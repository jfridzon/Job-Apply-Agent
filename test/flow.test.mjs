import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import { home } from './helpers.mjs';
const { ROOT, add, jobKey } = await import('../src/core/store.mjs');
const { decide, sendQueue, sentJobs, waitingForPerson, state } = await import('../src/core/jobs.mjs');
const { classify, readInbox, confirmedByEmail } = await import('../src/mail/inbox.mjs');
const { inQuietHours, paused } = await import('../src/run/guard.mjs');
const { allowance, inUse } = await import('../src/run/budget.mjs');
const { step } = await import('../src/run/night.mjs');
const { digest } = await import('../src/mail/digest.mjs');
const { stats } = await import('../src/mail/stats.mjs');
const { translator } = await import('../src/core/i18n.mjs');
const { start } = await import('../src/review/server.mjs');

const J = (n) => ({ url: `https://x.example/jobs/${n}`, company: `Company ${n}`, title: `Analyst ${n}` });
const queued = () => sendQueue().map((d) => d.url);

test('never sends twice, and a dry run does not count as sent', () => {
  for (const n of [1, 2, 3, 4, 5, 6]) decide(J(n), 'apply', 'ok');
  add('applications', { ...J(1), status: 'applied' });
  add('applications', { ...J(1), status: 'error' });
  add('applications', { ...J(2), status: 'ready', dry_run: true });
  add('applications', { ...J(3), status: 'unknown' });
  add('applications', { ...J(4), status: 'human', need: 'captcha' });
  add('applications', { ...J(5), status: 'error' });
  add('marks', { url: J(6).url, state: 'sent' });
  assert.deepEqual(queued().sort(), [J(2).url, J(5).url]);
  add('applications', { ...J(5), status: 'error' });
  assert.deepEqual(queued(), [J(2).url], 'two errors and it goes to the person');
  assert.equal(waitingForPerson().length, 3);
  assert.equal(sentJobs().length, 2);
});
test('a job waiting for answers comes back once they exist', () => {
  decide(J(7), 'apply', 'ok'); add('applications', { ...J(7), status: 'questions', missing: ['x'] });
  assert.ok(!queued().includes(J(7).url));
  assert.ok(sendQueue(state(), () => Date.now() + 1000).some((d) => d.url === J(7).url));
  add('marks', { url: J(7).url, state: 'no' });
});
test('inbox', () => {
  const m = (subject, snippet = '') => classify({ subject, snippet });
  assert.equal(m('Thank you for applying'), 'confirmation');
  assert.equal(m('Interview update', 'Unfortunately we will not move forward to the next round'), 'rejection');
  assert.equal(m('Interview invitation', 'We would like to invite you to a call'), 'next');
  assert.equal(m('Your security code', 'next step'), 'other');
  const day = (d) => new Date(Date.now() - d * 864e5).toISOString();
  const messages = [{ from: 'a@acme.example', name: 'Acme', subject: 'Interview invitation', snippet: 'invite you to a call', date: day(3) }, { from: 'a@acme.example', name: 'Acme', subject: 'Thank you for applying', date: day(1) }, { from: 'a@old.example', name: 'Oldco', subject: 'Interview invitation', snippet: 'invite you to a call', date: day(30) }];
  const r = readInbox({ messages, applications: [], ledger: {} });
  assert.deepEqual(r.open.map((c) => c.company), ['Acme'], 'a confirmation does not undo a stage, and old ones expire');
  assert.equal(confirmedByEmail({ company: 'Acme', title: 'Data Analyst' }, [{ from: 'a@acme.example', subject: 'Thank you for applying: Data Analyst' }]), true);
  assert.equal(confirmedByEmail({ company: 'Acme', title: 'Map Analyst' }, [{ from: 'a@acme.example', subject: 'Thank you for applying: Data Analyst' }]), false);
});
test('pause, quiet hours and budget', () => {
  const at = (s) => new Date(s), w = [{ days: ['fri'], from: '22:00', to: '02:00' }];
  assert.equal(inQuietHours(w, at('2030-01-04T23:00:00Z'), 'UTC'), true); // a Friday
  assert.equal(inQuietHours(w, at('2030-01-05T01:00:00Z'), 'UTC'), true);
  assert.equal(inQuietHours(w, at('2030-01-05T03:00:00Z'), 'UTC'), false);
  const f = join(home, 'pause'); writeFileSync(f, '2030-01-05');
  assert.match(paused(at('2030-01-04T00:00:00Z'), [f]), /until/);
  assert.equal(paused(at('2030-01-06T00:00:00Z'), [f]), '');
  assert.equal(allowance({ weekly: 50, now: 0, weeklyResets: 2 * 864e5, ceiling: 90, reservePerDay: 10 }), 10);
  assert.equal(inUse({ window: 30, windowResets: 'a', prev: { at: new Date(0).toISOString(), window: 10, windowResets: 'a' }, now: 60e3 }), true);
});
test('a stuck step is cut', async () => {
  const r = await step(['-e', 'setInterval(()=>{},1000)'], { minutes: 0.02, log: join(home, 'n.log') });
  assert.equal(r.code, 124);
});
test('email escapes what came from outside', () => {
  add('applications', { url: 'https://x.example/jobs/9', company: '<script>x</script>', title: 't', status: 'applied' });
  const { html, subject } = digest(stats(), translator('en'));
  assert.ok(!html.includes('<script>')); assert.match(subject, /sent today/);
});
test('every visible string has a Spanish translation', () => {
  const es = JSON.parse(readFileSync(join(ROOT, 'locales/es.json'), 'utf8')), need = new Set();
  for (const dir of ['mail', 'review', 'apply']) for (const f of readdirSync(join(ROOT, 'src', dir))) for (const m of readFileSync(join(ROOT, 'src', dir, f), 'utf8').matchAll(/\bt\('([^']+)'/g)) need.add(m[1]);
  assert.deepEqual([...need].filter((k) => !es[k]), []);
});
test('review page only answers its own page', async () => {
  const { server, port, token } = await start(0, () => true);
  const call = (path, o = {}) => new Promise((ok) => { const r = http.request({ port, path, host: '127.0.0.1', ...o }, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => ok({ code: res.statusCode, body: b })); }); r.end(o.body); });
  assert.equal((await call('/')).code, 200);
  assert.equal((await call('/', { headers: { host: 'evil.example' } })).code, 403);
  assert.equal((await call('/mark', { method: 'POST', body: '{}' })).code, 403);
  assert.equal((await call(`/finish?t=${token}`, { method: 'POST', body: JSON.stringify({ url: 'file:///etc/passwd' }) })).code, 404);
  assert.equal((await call(`/mark?t=${token}`, { method: 'POST', body: JSON.stringify({ url: J(4).url, state: 'no' }) })).code, 200);
  assert.ok(!waitingForPerson().some((w) => jobKey(w.url) === jobKey(J(4).url)));
  server.close(); server.closeAllConnections();
});
test('closed days apply to every command that runs the agent', async () => {
  const { isOpen } = await import('../src/core/open.mjs');
  const noon = new Date('2030-01-05T12:00:00Z');
  assert.equal(isOpen(noon, ['UTC']), false);
  assert.equal(isOpen(new Date('2030-01-06T12:00:00Z'), ['UTC']), true);
  assert.equal(isOpen(new Date('2030-01-06T02:00:00Z'), ['UTC', 'America/Chicago']), false);
  assert.equal(isOpen(noon, ['UTC', 'not a zone']), false);
  const scripts = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts;
  for (const [name, cmd] of Object.entries(scripts)) if (cmd.startsWith('node src/') && !['doctor', 'guard'].includes(name)) assert.match(readFileSync(join(ROOT, cmd.split(' ')[1]), 'utf8'), /requireOpen\(\)/, name);
});
