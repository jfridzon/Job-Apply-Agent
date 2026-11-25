// Every number in the email and the review page comes from here, so they always agree.
import { config, rows } from '../core/store.mjs';
import { sentJobs, state, undecided, waitingForPerson } from '../core/jobs.mjs';
import { localParts } from '../run/guard.mjs';
import { readInbox } from './inbox.mjs';

export function stats(now = new Date()) {
  const tz = config('agent').time_zone, day = (d) => localParts(new Date(d), tz).date;
  const s = state(), sent = sentJobs(s), waiting = waitingForPerson(s), inbox = readInbox({ now: now.getTime() });
  const decisions = [...s.decisions.values()].filter((d) => !/^listing:/.test(d.why || ''));
  const today = day(now);
  const count = (list) => list.reduce((m, x) => { const d = day(x.at); return m.set(d, (m.get(d) || 0) + 1); }, new Map());
  const agent = count(sent.filter((a) => !a.via)), you = count(sent.filter((a) => a.via)), read = count(decisions), fitting = count(decisions.filter((d) => d.decision === 'apply'));
  const days = Array.from({ length: 14 }, (_, i) => day(now.getTime() - (13 - i) * 864e5)).map((date) => ({
    date,
    agent: agent.get(date) || 0, you: you.get(date) || 0, read: read.get(date) || 0, fit: fitting.get(date) || 0,
  }));
  const by = (need) => waiting.filter((w) => (w.need || 'questions') === need).length;
  return {
    today, days, sent, waiting, inbox, undecided: undecided(s),
    sentToday: days.at(-1).agent + days.at(-1).you, sentYesterday: days.at(-2).agent + days.at(-2).you,
    last24: sent.filter((a) => now - Date.parse(a.at) < 864e5).sort((a, b) => b.at.localeCompare(a.at)),
    needs: { captcha: by('captcha'), code: by('code'), account: by('account'), questions: by('questions') },
    funnel: { read: decisions.length, fit: decisions.filter((d) => d.decision === 'apply').length, sent: sent.length, answered: inbox.answered, next: inbox.open.length },
    sweep: rows('sweeps').filter((r) => now - Date.parse(r.at) < 864e5).reduce((t, r) => ({ boards: t.boards + (r.boards || 0), new: t.new + (r.new || 0), apply: t.apply + (r.apply || 0) }), { boards: 0, new: 0, apply: 0 }),
  };
}
