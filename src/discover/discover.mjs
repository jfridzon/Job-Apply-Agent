#!/usr/bin/env node
// Sweeps every public board and feed in config/sources.json, reads each new posting in full, and records a decision.
// Usage: npm run discover [-- --only greenhouse,lever]
import { isOpen, requireOpen } from '../core/open.mjs';
import { add, config, isMain, jobKey, latest, option } from '../core/store.mjs';
import { decide } from '../core/jobs.mjs';
import { fit } from '../match/fit.mjs';
import { score } from '../match/score.mjs';
import { BOARDS, FEEDS } from './boards.mjs';

// Reads one job, decides and records. Shared by every source so they all follow the same rules.
export function consider(job, seen, rules = config('rules')) {
  if (!/^https?:\/\//.test(job.url || '') || !job.title || seen.has(jobKey(job.url))) return null;
  const r = fit(job, rules), s = score(job, rules);
  const decision = r.ok ? 'apply' : r.unsure ? 'unsure' : 'skip';
  decide({ ...job, ...s }, decision, r.why, { posted: job.posted, source: job.source });
  seen.set(jobKey(job.url), job);
  return decision;
}

export async function sweep(sources = config('sources'), rules = config('rules'), only = null, now = isOpen) {
  const seen = latest('decisions');
  // Same titles fit() would drop, checked early so a one-request-per-posting system isn't read in full for nothing.
  const wanted = (title) => !(rules.titles_exclude || []).some((p) => new RegExp(p, 'i').test(title)) && (!rules.titles_include?.length || rules.titles_include.some((p) => new RegExp(p, 'i').test(title)));
  const work = [
    ...Object.entries(sources.boards || {}).flatMap(([ats, list]) => list.map((b) => ({ ats, name: b, read: () => BOARDS[ats](b, wanted) }))),
    ...Object.entries(sources.feeds || {}).filter(([, f]) => f.enabled).map(([ats, f]) => ({ ats, name: ats, read: () => FEEDS[ats](f, wanted) })),
  ].filter((w) => (BOARDS[w.ats] || FEEDS[w.ats]) && (!only || only.includes(w.ats)));
  const total = { boards: 0, failed: 0, read: 0, new: 0, apply: 0, unsure: 0, skip: 0 };
  const limited = new Set();
  // One request at a time per system, different systems in parallel: quick, and gentle with each of them.
  const bySystem = Map.groupBy ? Map.groupBy(work, (w) => w.ats) : work.reduce((m, w) => m.set(w.ats, [...(m.get(w.ats) || []), w]), new Map());
  await Promise.all([...bySystem].map(async ([ats, list]) => {
    for (const w of list) {
      if (!now()) return;
      if (limited.has(ats)) { total.failed++; continue; }
      try {
        const jobs = await w.read();
        total.boards++; total.read += jobs.length;
        for (const j of jobs) { const d = consider({ ...j, ats, source: ats }, seen, rules); if (d) { total.new++; total[d]++; } }
      } catch (e) {
        total.failed++; console.error(`${ats}/${w.name}: ${e.message}`);
        if (e.status === 429) limited.add(ats); // asked to slow down: stop until the next run
      }
    }
  }));
  add('sweeps', { source: 'boards', ...total });
  return total;
}

if (isMain(import.meta)) requireOpen();
if (isMain(import.meta)) console.log(JSON.stringify(await sweep(undefined, undefined, option('--only')?.split(','))));
