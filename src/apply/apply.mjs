#!/usr/bin/env node
// Works through the queue, best job first, one at a time. Dry run by default: it fills and never sends.
// Each job ends as: applied, waiting for a person (CAPTCHA, emailed code, account), waiting for answers, closed, or
// unknown (Submit was clicked and no confirmation was read, so it is never sent again without a person looking).
// Usage: npm run apply [-- --submit --max 50]
import { CLOSED_TODAY, isOpen, requireOpen } from '../core/open.mjs';
import { add, config, flag, isMain, option, requireConfig } from '../core/store.mjs';
import { alreadyHandled, decide, sendQueue } from '../core/jobs.mjs';
import { confirmedByEmail } from '../mail/inbox.mjs';
import { guard } from '../run/guard.mjs';
import { excludesStatus } from '../match/fit.mjs';
import { answeredAt } from './answers.mjs';
import { newTab, openBrowser } from './browser.mjs';
import { CLOSED, CONFIRMED, blocker, pageText } from './detect.mjs';
import { fillPage } from './fill.mjs';

const SUBMIT = /^\s*(submit( my| your)?( application)?|send application|apply|finish|complete application)\s*$/i;
const NEXT = /^\s*(next|continue|save and continue|review)\s*$/i;
const OPEN = /^\s*(apply|apply now|apply for this (job|position|role)|start application|apply on company (site|website))\s*$/i;

async function button(page, name) {
  for (const f of page.frames()) for (const role of ['button', 'link']) {
    const list = f.getByRole(role, { name });
    for (let i = 0, n = await list.count().catch(() => 0); i < n; i++) if (await list.nth(i).isVisible().catch(() => false) && await list.nth(i).isEnabled().catch(() => false)) return list.nth(i);
  }
  return null;
}
const hasForm = (page) => page.locator('input[type=email]:visible,input[type=file],textarea:visible').count().then((n) => n > 0);
const urls = (page) => page.url().split('#')[0];

// hooks (used by finish.mjs): human(need, info) resolves true once the person did their step; progress(text); pause(ms).
export async function applyTo(page, job, { submit = false, hooks = {}, open = isOpen, wait = 4000, profile, beforeSubmit = async () => '' } = {}) {
  let current = page;
  if (!open()) return { status: 'skipped', why: CLOSED_TODAY };
  await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(wait);
  const first = await pageText(page);
  if (CLOSED.test(first.slice(0, 4000)) && !(await hasForm(page))) return { status: 'closed' };
  if (!(await hasForm(page))) {
    const open = await button(page, OPEN);
    if (open) {
      const popup = page.context().waitForEvent('page', { timeout: wait }).catch(() => null);
      await open.click({ timeout: 5000 }).catch(() => {});
      current = await popup || page; // Apply often opens the employer's site in a new tab
      await current.waitForLoadState('domcontentloaded').catch(() => {});
      await current.waitForTimeout(wait);
    }
  }
  const back = (r) => ({ ...r, page: current });
  for (let step = 0, asked = 0; step < 12; step++) {
    if (current.isClosed()) return { status: 'stuck', error: 'the tab was closed' };
    // Applications always go through the employer's own form, never through a network's quick-apply.
    if (/(^|\.)(linkedin|indeed)\.com$/.test(new URL(current.url()).hostname)) return back({ status: 'human', need: 'account' });
    const text = await pageText(current);
    if (CLOSED.test(text.slice(0, 3000)) && !(await hasForm(current))) return back({ status: 'closed' });
    const need = await blocker(current);
    if (need) {
      if (hooks.human && asked++ < 6 && await hooks.human(need, current, [])) { step--; continue; }
      return back({ status: 'human', need });
    }
    // A form can reveal a dealbreaker the posting never mentioned.
    if (excludesStatus(text.slice(0, 20000), config('rules').blocked_work_statuses)) return back({ status: 'dealbreaker', why: 'the form rules out your work status' });
    hooks.progress?.('filling');
    const { filled, missing, questions } = await fillPage(current, job, { profile });
    if (missing.length) {
      if (hooks.human && asked++ < 6 && await hooks.human('questions', current, missing)) { step--; continue; }
      return back({ status: 'questions', missing, questions });
    }
    const send = await button(current, SUBMIT);
    if (send && (await hasForm(current) || step > 0)) {
      if (!submit) return back({ status: 'ready', filled });
      const dup = open() ? await beforeSubmit() : CLOSED_TODAY;
      if (dup) return back({ status: 'skipped', why: dup });
      hooks.progress?.('sending');
      const before = urls(current);
      await send.click({ timeout: 8000 });
      const outcome = await result(current, before, hooks, Math.max(wait * 5, 5000), open);
      return back(outcome);
    }
    const next = await button(current, NEXT);
    if (!next) return back({ status: 'stuck', error: 'no Submit or Next button' });
    const shape = (await pageText(current)).slice(0, 3000) + urls(current);
    await next.click({ timeout: 8000 }); await current.waitForTimeout(wait);
    if ((await pageText(current)).slice(0, 3000) + urls(current) === shape) return back({ status: 'stuck', error: 'Next did not advance' });
  }
  return back({ status: 'stuck', error: 'too many steps' });
}

// After Submit: a confirmation, or a step for the person. Submit itself is clicked once per application, and once
// more only after a person solved what the site asked for.
async function result(page, before, hooks, ms, open) {
  let clicksLeft = 2;
  for (let until = Date.now() + ms; Date.now() < until;) {
    await page.waitForTimeout(1000).catch(() => {});
    if (page.isClosed()) return { status: 'unknown', why: 'the tab closed after Submit' };
    const text = await pageText(page);
    if (CONFIRMED.test(text) && (urls(page) !== before || !(await button(page, SUBMIT)))) return { status: 'applied' };
    const need = await blocker(page);
    if (!need) continue;
    if (!hooks.human) return { status: 'human', need };
    if (!(await hooks.human(need, page, []))) return { status: 'human', need };
    if (!open()) return { status: 'human', need };
    if (clicksLeft-- > 0) { await page.waitForTimeout(2500); if (!CONFIRMED.test(await pageText(page))) await (await button(page, SUBMIT))?.click({ timeout: 5000 }).catch(() => {}); }
    until = Date.now() + ms;
  }
  const errors = (await page.locator('[role=alert]:visible,[class*="error"]:visible').allInnerTexts().catch(() => [])).map((s) => s.trim()).filter(Boolean).slice(0, 4);
  // Still on the form with visible errors: it was not sent. Anything else stays unknown.
  return errors.length && await button(page, SUBMIT) ? { status: 'stuck', error: errors.join(' · ').slice(0, 300) } : { status: 'unknown' };
}

export const record = (job, r, extra = {}) => {
  const { page, ...row } = r;
  if (row.status === 'dealbreaker') return decide(job, 'skip', row.why);
  if (row.status === 'skipped') return undefined;
  return add('applications', { url: job.url, company: job.company, title: job.title, track: job.track, ...row, ...extra });
};

if (isMain(import.meta)) {
  requireOpen();
  requireConfig('profile', 'rules');
  const submit = flag('--submit'), max = Number(option('--max', config('agent').max_per_run ?? 30));
  const count = {}, nav = await openBrowser();
  for (const job of sendQueue(undefined, answeredAt).slice(0, max)) {
    const g = await guard({ network: false }); // paused or quiet hours can start halfway
    if (!g.ok) { console.log(`stopped: ${g.reason}`); break; }
    if (alreadyHandled(job.url) || (submit && confirmedByEmail(job))) continue;
    const tab = await newTab(nav);
    const r = await applyTo(tab, job, { submit, beforeSubmit: async () => alreadyHandled(job.url) || (confirmedByEmail(job) ? 'already confirmed by email' : '') }).catch((e) => ({ status: 'error', error: e.message.split('\n')[0] }));
    record(job, r, submit ? {} : { dry_run: true });
    count[r.status] = (count[r.status] || 0) + 1;
    console.log(`${r.status.padEnd(10)} ${job.company} | ${job.title}${r.missing ? `  (${r.missing.slice(0, 3).join(' · ')})` : r.need ? `  (${r.need})` : ''}`);
    // Tabs never pile up: the review page reopens the job when the person gets to it.
    for (const p of new Set([tab, r.page])) await p?.close().catch(() => {});
  }
  await nav.close();
  console.log(JSON.stringify(count));
}
