// What state each job is in, computed from the ledgers in one place so the sender, the review page and the email
// always agree on the numbers.
import { add, jobKey, latest, rows } from './store.mjs';

export const NEVER_RESEND = ['applied', 'closed', 'unknown']; // unknown: Submit was clicked, no confirmation was read
const MAX_ERRORS = 2;

export function state() {
  const decisions = latest('decisions'), applications = new Map(), marks = new Map(), errors = new Map();
  // Order matters only for "what happened last": a job that was ever sent stays sent.
  for (const r of rows('applications')) {
    if (r.dry_run) continue;
    const k = jobKey(r.url);
    if (r.status === 'error' || r.status === 'stuck') errors.set(k, (errors.get(k) || 0) + 1);
    if (!NEVER_RESEND.includes(applications.get(k)?.status) || r.status === 'applied') applications.set(k, r);
  }
  for (const m of rows('marks')) { if (m.state) marks.set(jobKey(m.url), m); else marks.delete(jobKey(m.url)); }
  return { decisions, applications, marks, errors };
}

export function alreadyHandled(url, s = state()) {
  const k = jobKey(url);
  const status = s.applications.get(k)?.status;
  if (NEVER_RESEND.includes(status)) return status;
  return s.marks.get(k)?.state || '';
}

// Jobs the sender may work on now. A job waiting for answers comes back when its answers are newer than its last try.
export function sendQueue(s = state(), answeredAt = () => 0) {
  return [...s.decisions.values()].filter((d) => {
    if (d.decision !== 'apply' || alreadyHandled(d.url, s)) return false;
    const a = s.applications.get(jobKey(d.url));
    if (!a) return true;
    if (a.status === 'questions') return answeredAt(d.url) > Date.parse(a.at);
    if (a.status === 'error' || a.status === 'stuck') return s.errors.get(jobKey(d.url)) < MAX_ERRORS;
    return false; // human: it waits in the review queue
  }).sort((a, b) => (b.score || 0) - (a.score || 0));
}

export function waitingForPerson(s = state()) {
  return [...s.applications.values()].filter((a) => {
    if (s.marks.has(jobKey(a.url)) || s.decisions.get(jobKey(a.url))?.decision === 'skip') return false;
    if (['human', 'questions', 'unknown'].includes(a.status)) return true;
    return ['error', 'stuck'].includes(a.status) && s.errors.get(jobKey(a.url)) >= MAX_ERRORS;
  }).map((a) => ({ ...s.decisions.get(jobKey(a.url)), ...a }));
}
export const undecided = (s = state()) => [...s.decisions.values()].filter((d) => d.decision === 'unsure' && !s.marks.has(jobKey(d.url)));
// Sent by the agent, plus the ones the user marked as sent by hand.
export function sentJobs(s = state()) {
  const out = new Map([...s.applications].filter(([, a]) => a.status === 'applied'));
  for (const [k, m] of s.marks) if (m.state === 'sent' && !out.has(k)) out.set(k, { ...s.decisions.get(k), ...s.applications.get(k), status: 'applied', via: 'you', at: m.at, url: m.url });
  return [...out.values()];
}
export const decide = (job, decision, why, extra = {}) => add('decisions', { url: job.url, company: job.company, title: job.title, location: job.location, ats: job.ats, score: job.score, track: job.track, ...extra, decision, why });
