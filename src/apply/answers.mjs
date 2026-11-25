// Turns a form question into the user's answer. Sources, in order: answers saved for this job, the user's own rules
// (config/answers.json), then the profile. Anything else returns null and the job waits: a late application is
// better than a wrong one. Nothing here has a default opinion about the user.
import { readdirSync, existsSync, statSync } from 'node:fs';
import { config, dataPath, jobKey, readJson } from '../core/store.mjs';

const norm = (s = '') => s.replace(/[*\u200b]/g, '').replace(/\s+/g, ' ').trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function pickOption(options, wanted) {
  const w = norm(String(wanted)).toLowerCase();
  if (!w) return null;
  const list = options.map((o) => [o, norm(o).toLowerCase()]);
  const exact = list.find(([, o]) => o === w);
  if (exact) return exact[0];
  // "Yes" matches "Yes, I am authorized", and "No" never matches "Not sure" or "Norway".
  const starts = list.filter(([, o]) => new RegExp(`^${esc(w)}(?![\\p{L}\\p{N}])`, 'u').test(o));
  if (starts.length) return starts[0][0];
  const inside = list.filter(([, o]) => w.length > 3 && new RegExp(`(?<![\\p{L}\\p{N}])${esc(w)}(?![\\p{L}\\p{N}])`, 'u').test(o));
  return inside.length === 1 ? inside[0][0] : null;
}

// True when choosing this text would claim a status the user said they don't hold.
export function claimsForbidden(text, profile) {
  const never = profile.work_authorization?.never_claim || [];
  return never.some((c) => new RegExp(`\\b${esc(c)}`, 'i').test(text)) && !/\b(not|no|non|never|neither|don'?t)\b/i.test(text);
}

// Facts about the user, each tied to the questions that ask for it. An empty value means "ask".
function facts(profile) {
  const { identity: i = {}, address: a = {}, preferences: p = {}, work_authorization: w = {}, self_id: s = {}, declarations: d = {} } = profile;
  const edu = profile.education?.[0] || {}, job = profile.experience?.[0] || {};
  return {
    // Questions, matched anywhere in the label
    questions: [
      [/sponsor/i, w.needs_sponsorship_now_or_future],
      [/(authori[sz]ed|eligible|legally|right) .{0,30}work|work authori[sz]ation/i, w.authorized],
      [/(18|eighteen) years|at least 18|over 18|legal age/i, d.over_18],
      [/background (check|investigation|screen)/i, d.accepts_background_check],
      [/drug (test|screen)/i, d.accepts_drug_test],
      [/(previously|ever|currently|formerly|before).{0,40}(employed|employee|worked)|former employee/i, d.worked_here_before],
      [/relatives?\b|family member|related to (an|any|a current)/i, d.relatives_at_company],
      [/non-?compete|non-?solicit|restrictive covenant/i, d.has_non_compete],
      [/convicted|felony|misdemeanor|criminal/i, d.criminal_record],
      [/security clearance/i, d.security_clearance],
      [/how did you (first )?(hear|learn|find)|^source$/i, p.how_did_you_hear],
      [/relocat/i, p.willing_to_relocate],
      [/earliest .*start|when (can|could|would) you start|available to start|start date|notice period/i, p.earliest_start],
      [/(salary|compensation|pay).{0,40}(expect|requir|desir|range)|(expect|desir)\w* .{0,20}(salary|compensation|pay)|^(desired )?salary$/i, p.salary],
      [/veteran/i, s.veteran], [/disabilit/i, s.disability], [/\bgender\b(?! identity is)|^sex$/i, s.gender], [/hispanic|latin[oax]/i, s.hispanic_or_latino], [/\brace\b|ethnic/i, s.race], [/pronoun/i, i.pronouns],
    ],
    // Plain fields, matched only on short labels so an essay that mentions "company" is never filled with one
    fields: [
      [/preferred (first )?name/i, i.preferred_name || i.first_name], [/^(legal )?(first|given)[ _-]?name/i, i.first_name], [/^(legal )?(last|family)[ _-]?name|surname/i, i.last_name],
      [/^(full|legal|your|complete)?[ _-]?(legal )?name$/i, [i.first_name, i.last_name].filter(Boolean).join(' ')],
      [/e-?mail/i, i.email], [/phone|mobile|cell/i, i.phone, /code|type|device|extension/i], [/linkedin/i, i.linkedin], [/github/i, i.github], [/website|portfolio|personal (site|url)/i, i.website || i.github],
      [/address.*(line )?(2|two)|^(apt|apartment|unit|suite)/i, a.unit], [/address|^street/i, a.street], [/^(current )?(city|town)\b/i, a.city], [/(zip|postal)/i, a.postal_code], [/^(state|province|region)/i, a.region], [/^country(?!.*code)/i, a.country],
      [/^(current )?location/i, [a.city, a.region].filter(Boolean).join(', ')],
      [/school|university|college|institution/i, edu.school], [/^(major|field of study|discipline)/i, edu.field], [/^(highest )?degree|level of education|education level/i, edu.level || edu.degree], [/\bgpa\b|grade point/i, edu.gpa, /scale|basis/i], [/graduation (date|year)|expected graduation|grad date/i, edu.end],
      [/^(current|most recent)?[ _-]?(company|employer)( name)?$/i, job.employer], [/^(current|most recent)?[ _-]?(job )?title$/i, job.title],
    ],
  };
}

export function answerFor(label, options = [], { profile = config('profile'), saved = {}, custom = config('answers').rules || [], long = false } = {}) {
  const l = norm(label);
  const decline = (v) => /^decline$/i.test(String(v)) ? options.find((o) => /decline|prefer not|choose not|not to (say|answer|self|disclose)|don'?t wish|do not wish/i.test(o)) || null : undefined;
  const settle = (value) => {
    if (value === undefined || value === null || value === '') return null;
    if (claimsForbidden(`${value}`, profile)) return null;
    if (!options.length) return /^decline$/i.test(String(value)) ? null : String(value);
    const d = decline(value);
    const choice = d !== undefined ? d : pickOption(options, value);
    return choice && !claimsForbidden(choice, profile) ? choice : null;
  };
  const key = Object.keys(saved).find((k) => norm(k).toLowerCase() === l.toLowerCase());
  if (key !== undefined) return settle(saved[key]);
  const rule = custom.find((r) => new RegExp(r.pattern, 'i').test(l));
  if (rule) return settle(rule.answer);
  // A yes/no question about a status the user doesn't hold ("Are you a citizen?") is for the user's own rules.
  if (options.length && options.every((o) => /^\s*(yes|no)\b/i.test(o)) && (profile.work_authorization?.never_claim || []).some((c) => new RegExp(`\\b${esc(c)}`, 'i').test(l))) return null;
  const { questions, fields } = facts(profile);
  if (!long && l.length <= 60 && !l.includes('?')) { const f = fields.find(([q, v, not]) => q.test(l) && v && !not?.test(l)); if (f) return settle(f[1]); }
  if (long) return null; // essays come from saved answers only
  const q = questions.find(([pattern]) => pattern.test(l));
  return q ? settle(q[1]) : null;
}

// data/answers/*.json: { "<job key>": { "<question>": "<answer>" } }. Newer files win.
function files() {
  const dir = dataPath('answers');
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => dataPath('answers', f)).sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs) : [];
}
export const savedAnswers = (url) => Object.assign({}, ...files().map((f) => readJson(f, {})[jobKey(url)] || {}));
export const answeredAt = (url) => Math.max(0, ...files().filter((f) => readJson(f, {})[jobKey(url)]).map((f) => statSync(f).mtimeMs));
