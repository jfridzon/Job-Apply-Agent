#!/usr/bin/env node
// How much of the assistant's usage limit a run may spend. Scripts cost nothing; this protects the part that does.
// The assistant passes the numbers it can read (npm run budget -- start --weekly 46 --window 3 --weekly-resets <ISO>
// --window-resets <ISO>), then "check" between batches and "end" when done. It prints {"continue": true|false}.
// No usage numbers available? Skip this script and keep each run small instead.
import { requireOpen } from '../core/open.mjs';
import { add, config, dataPath, flag, isMain, option, readJson, rows, writeJson } from '../core/store.mjs';

const round = (x) => Math.round(x * 10) / 10;

// What is left after the weekly ceiling and the user's own reserve, split over the runs left before the reset.
export function allowance({ weekly, weeklyResets, now, ceiling = 90, reservePerDay = 8, runsPerDay = 1 }) {
  const days = Math.max(0, (weeklyResets - now) / 864e5);
  const free = Math.max(0, ceiling - weekly - reservePerDay * days);
  return round(free / Math.max(1, Math.ceil(days * runsPerDay)));
}
// Somebody else is using the assistant when the window grew since the last look without a run of ours in between.
export function inUse({ window, windowResets, prev, now }) {
  if (window <= 2) return false;
  if (!prev || prev.windowResets !== windowResets || now - Date.parse(prev.at) > 75 * 60e3) return true; // first look: wait for the next one
  return window - prev.window > 2;
}

if (isMain(import.meta)) requireOpen();
if (isMain(import.meta)) {
  const phase = process.argv[2], cfg = { weekly_ceiling: 90, window_ceiling: 95, reserve_per_day: 8, runs_per_day: 1, ...config('agent').budget };
  const now = Date.now(), weekly = Number(option('--weekly')), window = Number(option('--window', 0)), windowResets = option('--window-resets', '');
  const out = (o) => console.log(JSON.stringify(o));
  if (!['start', 'check', 'end'].includes(phase) || Number.isNaN(weekly)) { console.error('Usage: budget start|check|end --weekly <n> --window <n> [--weekly-resets <ISO>] [--window-resets <ISO>]'); process.exit(1); }
  const current = dataPath('budget.json');
  if (phase === 'start') {
    const resets = Date.parse(option('--weekly-resets', ''));
    if (Number.isNaN(resets)) { console.error('start needs --weekly-resets'); process.exit(1); }
    const a = allowance({ weekly, weeklyResets: resets, now, ceiling: cfg.weekly_ceiling, reservePerDay: cfg.reserve_per_day, runsPerDay: cfg.runs_per_day });
    const busy = !flag('--force') && inUse({ window, windowResets, prev: rows('usage').at(-1), now });
    add('usage', { phase, weekly, window, windowResets });
    writeJson(current, { stop_weekly_at: round(weekly + a), start_weekly: weekly });
    const reason = busy ? 'the assistant looks in use' : window >= cfg.window_ceiling ? 'the short window is used up' : a < 0.5 ? 'the rest of the week is reserved for you' : `may use ${a}% this run`;
    out({ continue: !busy && window < cfg.window_ceiling && a >= 0.5, reason });
  } else {
    const cur = readJson(current, {});
    if (phase === 'end') { add('usage', { phase, weekly, window, windowResets, spent: round(weekly - cur.start_weekly) }); out({ continue: false, spent: round(weekly - cur.start_weekly) }); }
    else out(window >= cfg.window_ceiling ? { continue: false, reason: 'the short window is used up' } : !(weekly < cur.stop_weekly_at) ? { continue: false, reason: 'this run reached its share' } : { continue: true });
  }
}
