#!/usr/bin/env node
// Finishes ONE application together with the person. Opens it in front, fills everything, stops at the step that is
// theirs (a CAPTCHA, an emailed code, an account, a question only they can answer), notices when they're done, goes
// on and submits. It never solves, types or creates any of those. Progress goes to data/finish.json for the review page.
// Usage: npm run finish -- <url>     (the review page runs it for you)
import { requireOpen } from '../core/open.mjs';
import { readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { config, dataPath, flag, isMain, jobKey, latest, requireConfig, writeJson, sleep } from '../core/store.mjs';
import { alreadyHandled } from '../core/jobs.mjs';
import { confirmedByEmail } from '../mail/inbox.mjs';
import { translator } from '../core/i18n.mjs';
import { applyTo, record } from './apply.mjs';
import { newTab, openBrowser } from './browser.mjs';
import { CONFIRMED, blocker, pageText } from './detect.mjs';
import { highlight } from './fill.mjs';

const { t } = translator();
const ASK = { captcha: 'Solve the CAPTCHA.', code: 'Type the code from your email.', account: 'Sign in or create the account with your own password.', questions: 'Answer the highlighted questions, then press S.' };
const PID = dataPath('finish.pid'), CONTINUE = dataPath('finish.continue');
export const progress = (url, phase, text, extra = {}) => writeJson(dataPath('finish.json'), { at: new Date().toISOString(), pid: process.pid, url, phase, text, ...extra });

const mtime = (f) => { try { return statSync(f).mtimeMs; } catch { return 0; } };

// Waits for the person. Codes, CAPTCHAs and sign-ins are noticed on their own; questions wait for S.
export async function waitForPerson(page, need, { minutes = 30, every = 2000, marked = () => false } = {}) {
  const seen = mtime(CONTINUE);
  for (const until = Date.now() + minutes * 60e3; Date.now() < until; await sleep(every)) {
    if (page.isClosed() || marked()) return false;
    if (mtime(CONTINUE) > seen) return true;
    if (need !== 'questions' && !(await blocker(page))) return true;
    if (CONFIRMED.test(await pageText(page))) return true;
  }
  return false;
}

if (isMain(import.meta)) {
  requireOpen();
  requireConfig('profile', 'rules');
  const url = process.argv[2];
  if (!/^https?:\/\//.test(url || '')) { console.error('Usage: npm run finish -- <url>'); process.exit(1); }
  const job = { ...latest('decisions').get(jobKey(url)), ...latest('applications').get(jobKey(url)), url };
  const end = (text, status) => { progress(url, 'done', text, { result: status }); try { unlinkSync(PID); } catch { /* already gone */ } console.log(text); process.exit(0); };
  try { process.kill(Number(readFileSync(PID, 'utf8')), 0); console.log(t('Another application is being finished.')); process.exit(0); } catch { /* free */ }
  writeFileSync(PID, String(process.pid));
  for (const ev of ['uncaughtException', 'unhandledRejection']) process.on(ev, (e) => end(`${t('It stopped')}: ${String(e?.message || e).split('\n')[0]}`, 'error'));
  const handled = () => alreadyHandled(url) || (confirmedByEmail(job) ? 'already confirmed by email' : '');
  if (['applied', 'sent'].includes(handled())) end(t('This one was already sent.'), 'applied');
  progress(url, 'opening', t('Opening {company}…', { company: job.company || new URL(url).hostname }));
  const nav = await openBrowser({ foreground: true }), tab = await newTab(nav);
  await tab.bringToFront();
  const r = await applyTo(tab, job, {
    submit: !flag('--no-submit'),
    beforeSubmit: async () => (alreadyHandled(url) === 'unknown' ? '' : handled()),
    hooks: {
      progress: (p) => progress(url, p, p === 'sending' ? t('Sending…') : t('Filling the form…')),
      human: async (need, page, missing) => {
        await page.bringToFront().catch(() => {});
        if (need === 'questions') await highlight(page);
        progress(url, 'your-turn', `${t(ASK[need])}${missing.length ? ` ${missing.slice(0, 4).join(' · ')}` : ''}`, { need });
        return waitForPerson(page, need, { minutes: config('agent').finish_wait_minutes ?? 30, marked: () => Boolean(handled()) && handled() !== 'unknown' });
      },
    },
  });
  record(job, r, { via: 'finish' });
  if (['applied', 'closed'].includes(r.status)) for (const p of new Set([tab, r.page])) await p?.close().catch(() => {});
  await nav.close();
  end({ applied: t('Sent.'), closed: t('This job is closed.'), ready: t('Filled. Nothing was sent.'), unknown: t('I pressed Submit but saw no confirmation. Check your email, then mark it.'), skipped: t('Not sent: {why}', { why: r.why }), dealbreaker: t('Not sent: {why}', { why: r.why }) }[r.status] || `${t('Not sent yet. The tab is still open.')} ${r.error || ''}`, r.status);
}
