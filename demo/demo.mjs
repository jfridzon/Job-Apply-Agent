#!/usr/bin/env node
// Sample data, so you can see the review queue and the daily email before setting anything up. The company names are
// real; every role, number, message and answer is invented. Nothing is read from or written to your own files.
// Usage: npm run demo [-- --no-serve]
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = join(tmpdir(), 'job-apply-agent-demo');
rmSync(home, { recursive: true, force: true });
process.env.JOB_AGENT_HOME = home;
const { dataPath } = await import('../src/core/store.mjs');
mkdirSync(dataPath('answers'), { recursive: true });

const now = Date.now(), ago = (hours) => new Date(now - hours * 36e5).toISOString();
const COMPANIES = ['Netflix', 'Spotify', 'Airbnb', 'NVIDIA', 'Figma', 'Stripe', 'Adobe', 'Notion', 'Disney', 'Shopify', 'Duolingo', 'Nike'];
const ROLES = ['Product Designer', 'Software Engineer', 'UX Researcher', 'Product Manager', 'Brand Designer', 'Frontend Engineer', 'Content Strategist'];
const PORTALS = ['https://boards.greenhouse.io/demo/jobs/', 'https://jobs.lever.co/demo/', 'https://jobs.ashbyhq.com/demo/', 'https://apply.workable.com/demo/j/'];
const out = {}, add = (ledger, row) => (out[ledger] ||= []).push(JSON.stringify({ at: new Date(now).toISOString(), ...row }));
let id = 100000;
const job = (i, role = ROLES[i % ROLES.length]) => ({ url: `${PORTALS[i % 4]}${++id}`, company: COMPANIES[i % COMPANIES.length], title: role, location: ['Remote', 'San Francisco', 'London', 'Los Angeles'][i % 4], score: 60 + ((i * 17) % 40) });

// Two weeks of work, oldest day first.
[24, 31, 28, 35, 30, 26, 38, 33, 41, 36, 29, 44, 35, 38].forEach((n, d) => {
  const day = (13 - d) * 24;
  if (new Date(now - day * 36e5).getDay() === 6) return;
  for (let i = 0; i < n; i++) {
    const j = job(d * 5 + i); add('decisions', { ...j, decision: 'apply', why: 'matches your rules', at: ago(day + 2) });
    add('applications', { ...j, status: 'applied', ...(i % 5 === 4 ? { via: 'finish' } : {}), at: ago(day + 0.1 + i / 600) });
  }
  for (let i = 0; i < 1650 + d * 40; i++) add('decisions', { ...job(i + d, 'Senior Director'), decision: 'skip', why: 'title excluded', at: ago(day + 3) });
});
[['captcha', 0, 0], ['code', 1, 1], ['questions', 4, 0, ['Share a project you are proud of']], ['captcha', 2, 2], ['account', 3, 1], ['code', 5, 3], ['questions', 8, 6, ['Portfolio link']], ['account', 11, 4]].forEach(([need, c, r, missing]) => {
  const j = { ...job(c, ROLES[r]), score: 96 - c }; add('decisions', { ...j, decision: 'apply', why: 'matches your rules', at: ago(5) });
  add('applications', { ...j, status: need === 'questions' ? 'questions' : 'human', need, missing, at: ago(4) });
});
for (const [i, why] of [[6, 'no start date in the posting'], [7, 'no location in the posting'], [9, 'could not read the full posting']]) add('decisions', { ...job(i), decision: 'unsure', why, at: ago(6) });
const mail = (company, subject, snippet, hours) => add('inbox', { id: subject + company, from: `jobs@${company.toLowerCase()}.example`, name: company, subject, snippet, date: ago(hours), link: 'https://mail.example.com/' });
const invite = 'We would like to invite you to an interview.';
mail('Spotify', 'Interview invitation: Product Designer', invite, 5);
mail('Airbnb', 'Next step: UX Researcher interview', invite, 19);
mail('Figma', 'Schedule your call with the design team', invite, 28);
mail('Duolingo', 'Final round interview invitation', invite, 40);
mail('NVIDIA', 'Assessment completed', 'Thank you for completing it.', 46);
mail('Notion', 'Video interview completed: thank you for completing it', '', 60);
for (const [c, h] of [['Nike', 70], ['Disney', 90]]) mail(c, 'Update on your application', 'Unfortunately we will not be moving forward.', h);
mail('Stripe', 'Thank you for applying', 'We received your application.', 2);
add('sweeps', { source: 'boards', boards: 1240, read: 86400, new: 2208, apply: 38, at: ago(7) });
add('digests', { day: new Date(now - 864e5).toISOString().slice(0, 10), open: 4, rejected: 2 });
for (const [ledger, list] of Object.entries(out)) appendFileSync(dataPath(`${ledger}.jsonl`), `${list.join('\n')}\n`);

const { digest } = await import('../src/mail/digest.mjs'), { stats } = await import('../src/mail/stats.mjs'), { translator } = await import('../src/core/i18n.mjs');
const email = join(home, 'digest.html');
writeFileSync(email, digest(stats(), translator(), { previous: { open: 4, rejected: 2 } }).html);
console.log(`Daily email: ${email}`);
if (!process.argv.includes('--no-serve')) { const { start } = await import('../src/review/server.mjs'); console.log(`Review queue: http://127.0.0.1:${(await start(Number(process.env.PORT) || 8766, () => true)).port}/   (Ctrl+C to stop)`); }
