#!/usr/bin/env node
// The review queue, served on this machine only. Rebuilt on every visit. A random token and a Host check keep other
// web pages from reading or calling it.
import { CLOSED_TODAY, isOpen, requireOpen } from '../core/open.mjs';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, add, config, dataPath, isMain, jobKey, latest, readJson } from '../core/store.mjs';
import { decide, state, undecided, waitingForPerson } from '../core/jobs.mjs';
import { translator } from '../core/i18n.mjs';
import { resumeFor } from '../match/score.mjs';
import { portal } from '../mail/digest.mjs';
import { savedAnswers } from '../apply/answers.mjs';
import { page } from './page.mjs';

const MINUTES = { code: 2, captcha: 2, questions: 6, account: 8 };

export function build(token) {
  const { t, lang, strings } = translator(), s = state(), profile = config('profile');
  const card = (j, need) => ({ url: j.url, company: j.company || '', title: j.title || '', need, portal: portal(j.url), place: j.location || '', score: j.score ?? 40, minutes: MINUTES[need] || 2, resume: resumeFor(j.title || '', profile)?.split('/').pop() || '', why: j.why || '', missing: j.missing || [], error: j.error || '', status: j.status || '', answers: Object.entries(savedAnswers(j.url)) });
  const i = profile.identity || {}, a = profile.address || {}, w = profile.work_authorization || {}, e = profile.education?.[0] || {}, p = profile.preferences || {};
  const details = [[t('Email'), i.email], [t('Phone'), i.phone], [t('Address'), [a.street, a.city, a.region, a.postal_code].filter(Boolean).join(', ')], ['LinkedIn', i.linkedin], [t('School'), e.school], [t('Degree'), e.degree], ['GPA', e.gpa], [t('Graduation'), e.end], [t('Can start'), p.earliest_start], [t('Authorized to work'), w.authorized], [t('Needs sponsorship'), w.needs_sponsorship_now_or_future], [t('Salary'), p.salary]].filter(([, v]) => v);
  return page({ items: waitingForPerson(s).map((j) => card(j, j.need || 'questions')), unsure: undecided(s).map((j) => card(j, 'unsure')), details, token, lang, strings });
}

export function start(port = Number(process.env.PORT) || config('agent').review_port || 8765, open = isOpen) {
  const token = randomBytes(16).toString('hex');
  const server = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const reply = (code, body = '', type = 'text/plain') => { res.writeHead(code, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY' }); res.end(body); };
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) return reply(403);
    if (!open()) return reply(503, CLOSED_TODAY);
    try {
      if (u.pathname === '/' && req.method === 'GET') return reply(200, build(token), 'text/html');
      if (u.searchParams.get('t') !== token) return reply(403);
      if (u.pathname === '/status') {
        const e = readJson(dataPath('finish.json'), {});
        if (e.phase && e.phase !== 'done') try { process.kill(e.pid, 0); } catch { Object.assign(e, { phase: 'done', result: 'error', text: translator().t('It stopped. Press L to try again.') }); }
        return reply(200, JSON.stringify(e), 'application/json');
      }
      if (req.method !== 'POST') return reply(405);
      let body = ''; for await (const d of req) { body += d; if (body.length > 5000) return reply(413); }
      const { url = '', state: mark } = body ? JSON.parse(body) : {};
      if (u.pathname === '/continue') { writeFileSync(dataPath('finish.continue'), String(Date.now())); return reply(200); }
      // Only jobs that are in the ledgers: the page can't be used to open anything else.
      const job = latest('decisions').get(jobKey(url)) || latest('applications').get(jobKey(url));
      if (!job) return reply(404);
      if (u.pathname === '/mark') {
        if (!['sent', 'no', 'closed', null].includes(mark)) return reply(400);
        add('marks', { url: job.url, state: mark });
        return reply(200);
      }
      if (u.pathname === '/decide') {
        if (!['apply', 'skip', 'unsure'].includes(mark)) return reply(400);
        decide(job, mark, mark === 'unsure' ? job.why : 'your call', { reviewed: mark !== 'unsure' });
        return reply(200);
      }
      if (u.pathname === '/finish') { spawn(process.execPath, [join(ROOT, 'src/apply/finish.mjs'), job.url], { detached: true, stdio: 'ignore' }).unref(); return reply(200); }
      return reply(404);
    } catch { return reply(400); }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok({ server, token, port: server.address().port })));
}

if (isMain(import.meta)) { requireOpen(); const { port } = await start(); console.log(`http://127.0.0.1:${port}/`); }
