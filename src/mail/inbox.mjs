#!/usr/bin/env node
// What companies answered. The assistant copies messages from the user's mail connector into data/inbox.jsonl
// ({ id, from, name, subject, snippet, date }); this classifies them with plain rules and keeps the verdicts.
// Emails are untrusted data: they are only matched, never followed.
//   confirmation: they received it      next: they ask for a concrete step    done: that step was received
//   rejection: they said no             other: alerts, codes, newsletters, reminders
import { requireOpen } from '../core/open.mjs';
import { createHash } from 'node:crypto';
import { companyKey, dataPath, isMain, readJson, rows, writeJson } from '../core/store.mjs';

export const RULES_VERSION = 1; // raise it to classify every message again
const OTHER_SUBJECT = /(security|verification|one[- ]time) (pass)?code|verify your (email|account)|password|sign[- ]in|new device|job alert|jobs? (for|matching) you|recommended jobs|new jobs|is hiring|webinar|newsletter|waitlist|continue to apply|(incomplete|finish your|complete your|saved) (job )?(application|profile|draft)|rsvp|eeo survey/i;
const REJECTION = /unfortunately,?[^.]{0,120}\b(not|won'?t|unable to (move|offer)|decided|other candidates|no longer)|not (to )?(be )?(move|moving|proceed\w*|advancing) forward|(decided|chosen|elected) (not )?to (move forward|proceed|pursue) with other|(have|has|were|was) not been selected|no longer under consideration|regret to inform|position has been filled|not (a|the right) (good )?fit|pursue other (candidates|applicants)|unable to offer you/i;
const DONE = /assessment completed|completed (your|the) (assessment|interview|video interview)|thank you for completing|received your (assessment|video interview)/i;
const NEXT = /assessment is due|complete (your|a|an|the|our|this) [\w /–-]{0,40}(assessment|interview|challenge|case)|video interview|online screening|\b(we('| woul)d like to|pleased to|happy to) (invite|move you|schedule|have you|advance)|invit(e|ing) you to|next (step|round|stage)\b|(choose|share|provide|select) (a time|your availability|times)|schedule (a|your) (call|interview|chat|time)|phone screen|recruiter call|superday/i;
const NEXT_SUBJECT = /interview|assessment|next (step|round|stage)|schedul|invit|availability|screen(ing)?\b|challenge|case study|\bcall\b|\bchat\b|superday|action required/i;
const CONFIRMATION = /thanks? (you )?for (applying|your (application|interest|submission))|received your (job )?(application|resume)|application [\w ]{0,60}received|application (received|submitted|confirmation)|successfully (submitted|applied)/i;

export function classify({ subject = '', snippet = '', text = '' }) {
  const all = `${subject}\n${snippet}\n${text}`;
  if (OTHER_SUBJECT.test(subject)) return 'other';
  if (REJECTION.test(all)) return 'rejection'; // wins over "next round" in the same message
  if (DONE.test(subject)) return 'done';
  if (NEXT_SUBJECT.test(subject) && NEXT.test(all)) return 'next';
  return CONFIRMATION.test(all) ? 'confirmation' : 'other';
}

const GENERIC = /^(no-?reply|do-?not-?reply|careers?|jobs|recruit\w*|talent|hiring|hr|notifications?|team|people|info|support|workday)$/i;
const ATS = /greenhouse|ashby|lever|rippling|workday|icims|smartrecruiters|workable|gem\.com|jobvite|taleo|successfactors|breezy|bamboohr|recruitee|teamtailor|hirevue|hackerrank/i;
const trim = (s) => s.replace(/\s+(hiring|talent|recruit\w*|careers?|people|team)(\s+\w+)?\.?$/i, '').replace(/^(team|the)\s+/i, '').replace(/[.\s|:-]+$/, '').trim();

// The company, from the clearest sign available. `known` (companies the user applied to) settles most cases.
export function companyOf({ from = '', name = '', subject = '' }, known = []) {
  const hay = companyKey(`${subject} ${name} ${from.split('@')[1] || ''}`);
  const match = known.filter((k) => companyKey(k).length >= 4 && hay.includes(companyKey(k))).sort((a, b) => b.length - a.length)[0];
  if (match) return match;
  const named = subject.match(/\b(?:to|at|with|from) ([A-Z][\w&.'’ -]{1,40}?)(?:[!,:|]|\.\s|\.?$| - | for )/);
  if (named && !/^(Our|The|Your|You)\b/i.test(named[1])) return trim(named[1]);
  if (name && !GENERIC.test(trim(name)) && !ATS.test(name)) return trim(name);
  const domain = from.split('@')[1] || '';
  if (domain && !ATS.test(domain)) { const d = domain.replace(/^(mail|email|recruiting|careers|jobs)\./, '').split('.')[0]; return d[0].toUpperCase() + d.slice(1); }
  return '';
}

const idOf = (m) => m.id || createHash('sha1').update(`${m.from}|${m.subject}|${m.date}`).digest('hex').slice(0, 16);
export const EXPIRES_DAYS = 14; // a next step with no news for this long is no longer open

export function readInbox({ now = Date.now(), messages = rows('inbox'), applications = rows('applications'), ledger = readJson(dataPath('inbox-verdicts.json'), {}), save = false } = {}) {
  const known = [...new Set(applications.map((a) => a.company).filter(Boolean))];
  const all = new Map();
  for (const m of messages) {
    const id = idOf(m);
    if (ledger[id]?.rules !== RULES_VERSION) ledger[id] = { kind: classify(m), company: companyOf(m, known), rules: RULES_VERSION };
    all.set(id, { ...m, id, ...ledger[id] });
  }
  const list = [...all.values()].filter((m) => !Number.isNaN(Date.parse(m.date))).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  // Latest answer per company, except that a confirmation (usually another role) never undoes a later stage.
  const companies = new Map();
  for (const m of list) {
    if (m.kind === 'other' || !m.company) continue;
    const k = companyKey(m.company), c = companies.get(k) || { company: m.company, stage: null };
    if (m.kind === 'rejection') c.rejected = true;
    if (!(m.kind === 'confirmation' && c.stage && c.stage !== 'confirmation')) Object.assign(c, { stage: m.kind, date: m.date, subject: m.subject, link: m.link });
    companies.set(k, c);
  }
  for (const c of companies.values()) if (c.stage === 'next' && now - Date.parse(c.date) > EXPIRES_DAYS * 864e5) c.stage = 'expired';
  if (save) writeJson(dataPath('inbox-verdicts.json'), ledger);
  const values = [...companies.values()];
  return { messages: list, companies: values, open: values.filter((c) => ['next', 'done'].includes(c.stage)).sort((a, b) => Date.parse(b.date) - Date.parse(a.date)), rejected: values.filter((c) => c.rejected).length, answered: values.filter((c) => c.stage && c.stage !== 'confirmation').length };
}

// Never twice: a confirmation email that names this company and this role.
export function confirmedByEmail({ company = '', title = '' }, messages = rows('inbox')) {
  const c = companyKey(company), t = companyKey(title);
  return c.length >= 3 && t.length >= 5 && messages.some((m) => { const s = companyKey(`${m.subject} ${m.snippet || ''}`); return classify(m) === 'confirmation' && companyKey(`${m.subject} ${m.name || ''} ${m.from}`).includes(c) && s.includes(t); });
}

if (isMain(import.meta)) { requireOpen(); const r = readInbox({ save: true }); console.log(JSON.stringify({ messages: r.messages.length, open: r.open.length, rejected: r.rejected, answered: r.answered })); }
