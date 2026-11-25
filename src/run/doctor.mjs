#!/usr/bin/env node
// Checks that a setup is ready and says exactly what's missing.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, config, hasConfig, homePath } from '../core/store.mjs';
import { chromePath } from '../apply/browser.mjs';

const problems = [];
const check = (name, ok, fix) => { console.log(`${ok ? 'ok      ' : 'MISSING '}${name}${ok ? '' : `  → ${fix}`}`); if (!ok) problems.push(name); };
const patterns = (o) => JSON.stringify(o, (k, v) => v);
check('Node 20 or newer', Number(process.versions.node.split('.')[0]) >= 20, 'install it from nodejs.org');
check('Dependencies', existsSync(join(ROOT, 'node_modules/playwright')), 'npm install');
check('Google Chrome', Boolean(chromePath()), 'install it or set CHROME_PATH');
for (const c of ['profile', 'rules', 'sources', 'agent']) check(`config/${c}.json`, hasConfig(c), 'run the setup in AGENTS.md');
if (hasConfig('profile')) {
  const p = config('profile');
  check('Your own details, not the example', !patterns(p).includes('example.com'), 'finish config/profile.json');
  for (const [k, f] of Object.entries(p.resumes || {})) check(`Resume (${k})`, existsSync(homePath(f)), `save it as ${f}`);
  check('Work authorization answers', Boolean(p.work_authorization?.authorized && p.work_authorization?.needs_sponsorship_now_or_future), 'answer both, they decide what is sent');
}
if (hasConfig('rules')) {
  const r = config('rules'), bad = [];
  for (const p of [...['titles_include', 'titles_exclude', 'locations_include', 'locations_exclude', 'companies_exclude', 'text_require_any'].flatMap((k) => r[k] || []), ...['text_exclude', 'unsure_when_missing', 'score', 'tracks'].flatMap((k) => (r[k] || []).map((x) => x.pattern))]) try { new RegExp(p, 'i'); } catch { bad.push(p); }
  check('Rules are valid patterns', !bad.length, bad.join(', '));
}
process.exitCode = problems.length ? 1 : 0;
