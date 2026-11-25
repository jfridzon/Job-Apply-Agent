#!/usr/bin/env node
// May the agent run right now? Checks the pause switch, the user's quiet hours and the connection.
// Pause from anywhere that can write a file (a phone shortcut to a synced folder works): data/pause, or the file in
// agent.json "pause_file". Empty or "pause" = until removed, a date = until then, "resume" = not paused.
import { CLOSED_TODAY, isOpen } from '../core/open.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { config, dataPath, isMain } from '../core/store.mjs';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const formats = new Map(); // building one is slow, and large histories need thousands
const format = (timeZone) => { if (!formats.has(timeZone)) formats.set(timeZone, new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' })); return formats.get(timeZone); };
export function localParts(now, timeZone) {
  const p = Object.fromEntries(format(timeZone).formatToParts(now).map((x) => [x.type, x.value]));
  return { day: p.weekday.toLowerCase(), minutes: Number(p.hour) * 60 + Number(p.minute), date: `${p.year}-${p.month}-${p.day}` };
}
const mins = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

// Windows may cross midnight: { days: ["fri"], from: "18:00", to: "02:00" } blocks early Saturday too.
export function inQuietHours(windows = [], now, timeZone) {
  const { day, minutes } = localParts(now, timeZone), yesterday = DAYS[(DAYS.indexOf(day) + 6) % 7];
  return windows.some((w) => {
    const days = w.days || DAYS, from = mins(w.from), to = mins(w.to);
    return from < to ? days.includes(day) && minutes >= from && minutes < to : (days.includes(day) && minutes >= from) || (days.includes(yesterday) && minutes < to);
  });
}
export function paused(now, files) {
  for (const f of files) {
    if (!f || !existsSync(f)) continue;
    const txt = readFileSync(f, 'utf8').trim();
    if (/^resume$/i.test(txt)) continue;
    const until = /^\d{4}-\d{2}-\d{2}/.test(txt) ? Date.parse(txt) : NaN;
    if (Number.isNaN(until)) return 'paused';
    if (until > now.getTime()) return `paused until ${txt}`;
  }
  return '';
}
export async function guard({ now = new Date(), cfg = config('agent'), network = true } = {}) {
  if (!isOpen(now, [undefined, cfg.time_zone])) return { ok: false, reason: CLOSED_TODAY };
  const p = paused(now, [dataPath('pause'), cfg.pause_file?.replace(/^~/, homedir())]);
  if (p) return { ok: false, reason: p };
  if (inQuietHours(cfg.quiet_hours, now, cfg.time_zone)) return { ok: false, reason: 'quiet hours' };
  if (network && !(await fetch('https://boards-api.greenhouse.io/', { method: 'HEAD', signal: AbortSignal.timeout(8000) }).then(() => true, () => false))) return { ok: false, reason: 'offline' };
  return { ok: true, reason: 'ready' };
}
if (isMain(import.meta)) { const r = await guard(); console.log(JSON.stringify(r)); process.exitCode = r.ok ? 0 : 3; }
