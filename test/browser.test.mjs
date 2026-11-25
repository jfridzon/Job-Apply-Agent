import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { home } from './helpers.mjs';
const { ROOT, jobKey } = await import('../src/core/store.mjs');
const { chromium } = await import('playwright');
const { applyTo } = await import('../src/apply/apply.mjs');
const { blocker } = await import('../src/apply/detect.mjs');
const { waitForPerson } = await import('../src/apply/finish.mjs');
const { sweepSite } = await import('../src/discover/sites.mjs');
const { chromePath } = await import('../src/apply/browser.mjs');

const executablePath = chromePath();
const opts = { skip: !executablePath && 'Chrome is not installed' };
const url = pathToFileURL(join(ROOT, 'test/fixtures/form.html')).href, job = { url, title: 'Analyst' };
let browser, page;
test.before(async () => { if (executablePath) { browser = await chromium.launch({ executablePath }); } });
test.beforeEach(async () => { if (browser) page = await (await browser.newContext()).newPage(); });
test.after(() => browser?.close());

test('stops at the question it cannot answer', opts, async () => {
  const r = await applyTo(page, job, { submit: true, wait: 50, open: () => true });
  assert.equal(r.status, 'questions');
  assert.deepEqual(r.missing, ['Why do you want to work at our company? *']);
  assert.equal(await page.evaluate(() => window.clicks), undefined);
});
test('fills everything, dry run does not send, submit sends once', opts, async () => {
  mkdirSync(join(home, 'data/answers'), { recursive: true });
  writeFileSync(join(home, 'data/answers/a.json'), JSON.stringify({ [jobKey(url)]: { 'Why do you want to work at our company?': 'True reasons.' } }));
  assert.equal((await applyTo(page, job, { wait: 50, open: () => true })).status, 'ready');
  const v = await page.evaluate(() => ({ fn: fn.value, sp: sp.value, auth: document.querySelector('[name=auth]:checked').value, vet: vet.value, dd: dd.innerText, priv: priv.checked, mk: mk.checked, file: res.files.length }));
  assert.deepEqual(v, { fn: 'Ada', sp: '0', auth: 'y', vet: 'b', dd: "Bachelor's Degree", priv: true, mk: false, file: 1 });
  assert.equal((await applyTo(page, job, { submit: true, wait: 50, open: () => true, beforeSubmit: async () => 'already sent' })).status, 'skipped');
  assert.equal((await applyTo(page, job, { submit: true, wait: 50, open: () => true })).status, 'applied');
  assert.equal(await page.evaluate(() => window.clicks), 1);
});
test('people steps are recognized and waited for', opts, async () => {
  await page.setContent('<input type=password>'); assert.equal(await blocker(page), 'account');
  await page.setContent('<iframe src="https://www.google.com/recaptcha/api2/anchor?size=invisible" width=300 height=80></iframe>'); assert.equal(await blocker(page), null);
  await page.setContent('<input autocomplete="one-time-code">'); assert.equal(await blocker(page), 'code');
  setTimeout(() => page.fill('input', '123456'), 300);
  assert.equal(await waitForPerson(page, 'code', { minutes: 0.1, every: 100 }), true);
});
test('a closed job is closed', opts, async () => {
  const p = join(home, 'closed.html'); writeFileSync(p, 'This position has been filled.');
  assert.equal((await applyTo(page, { url: pathToFileURL(p).href }, { wait: 50, open: () => true })).status, 'closed');
});
test('site sweep reads postings and stops at a sign-in page', opts, async () => {
  const ctx = page.context();
  await ctx.route('https://jobs.example.com/**', (r) => { const u = r.request().url(); r.fulfill({ contentType: 'text/html', body: u.includes('/search') ? '<a href="/job/1">one</a><a href="/about">no</a>' : `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'Analyst', hiringOrganization: { name: 'Acme' }, jobLocationType: 'TELECOMMUTE', description: `<p>${'Nice. '.repeat(60)} Start date: May</p>` })}</script><main>x</main>` }); });
  const site = { name: 's', search_url: 'https://jobs.example.com/search?q={query}', queries: ['a b'], link_pattern: '/job/\\d+' };
  const r = await sweepSite(page, site, new Map(), { pauseMs: 20, open: () => true });
  assert.equal(r.apply, 1);
  await ctx.route('https://in.example.com/**', (x) => x.fulfill({ contentType: 'text/html', body: '<input type=password>' }));
  assert.equal((await sweepSite(page, { ...site, search_url: 'https://in.example.com/' }, new Map(), { pauseMs: 20, open: () => true })).stopped, 'sign in needed');
});
