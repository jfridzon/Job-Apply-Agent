#!/usr/bin/env node
// The whole chain, with no AI usage: every sweep, then the sender, then the numbers. Each step has a time limit and
// a stall check, so one stuck source can't eat the night, and a lock keeps two runs from overlapping.
// Usage: npm run night [-- --submit]     (without --submit, applications are only dry runs)
import { requireOpen } from '../core/open.mjs';
import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, add, dataPath, flag, isMain, requireConfig } from '../core/store.mjs';
import { guard } from './guard.mjs';

const LOG = dataPath('night.log'), LOCK = dataPath('night.pid');

export function step(args, { minutes, quiet = minutes, log = LOG, command = process.execPath }) {
  return new Promise((resolve) => {
    const started = Date.now(); let last = started, cut = false;
    const child = spawn(command, args, { cwd: ROOT, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    const note = (d) => { last = Date.now(); appendFileSync(log, d); };
    child.stdout.on('data', note); child.stderr.on('data', note);
    const timer = setInterval(() => {
      if (Date.now() - started < minutes * 60e3 && Date.now() - last < quiet * 60e3) return;
      cut = true;
      try { if (process.platform === 'win32') child.kill(); else process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
    }, Math.min(5000, minutes * 6e3));
    child.on('close', (code) => { clearInterval(timer); resolve({ code: cut ? 124 : code ?? 1, seconds: Math.round((Date.now() - started) / 1000) }); });
    child.on('error', () => { clearInterval(timer); resolve({ code: 1, seconds: 0 }); });
  });
}

if (isMain(import.meta)) {
  requireOpen();
  requireConfig('profile', 'rules', 'sources', 'agent');
  try { process.kill(Number(readFileSync(LOCK, 'utf8')), 0); console.log('already running'); process.exit(0); } catch { /* free */ }
  const g = await guard();
  if (!g.ok) { console.log(g.reason); process.exit(0); }
  writeFileSync(LOCK, String(process.pid));
  const steps = [
    ['discover', ['src/discover/discover.mjs'], 90, 30], ['leads', ['src/discover/leads.mjs'], 5, 5], ['sites', ['src/discover/sites.mjs'], 45, 20],
    ['inbox', ['src/mail/inbox.mjs'], 5, 5],
    ['apply', ['src/apply/apply.mjs', ...(flag('--submit') ? ['--submit'] : [])], 120, 15],
    ['digest', ['src/mail/digest.mjs'], 5, 5],
  ];
  const summary = {};
  try {
    for (const [name, [file, ...args], minutes, quiet] of steps) {
      if (!(await guard({ network: false })).ok) { summary[name] = 'paused'; break; }
      appendFileSync(LOG, `\n== ${new Date().toISOString()} ${name}\n`);
      const r = await step([join(ROOT, file), ...args], { minutes, quiet });
      summary[name] = r.code === 124 ? 'cut' : r.code ? `failed (${r.code})` : `ok ${r.seconds}s`;
    }
  } finally { try { unlinkSync(LOCK); } catch { /* gone */ } }
  add('runs', { kind: 'night', summary });
  console.log(JSON.stringify(summary));
}
