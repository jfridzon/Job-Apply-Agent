import test from 'node:test';
import assert from 'node:assert/strict';
import { profile, rules } from './helpers.mjs';
const { fit, minYears, excludesStatus } = await import('../src/match/fit.mjs');
const { score, resumeFor } = await import('../src/match/score.mjs');
const { answerFor, pickOption } = await import('../src/apply/answers.mjs');
const { consentFor } = await import('../src/apply/fill.mjs');
const { jobKey } = await import('../src/core/store.mjs');

const text = 'Great team. '.repeat(30), job = { title: 'Analyst', location: 'Remote', text: `${text} Start date: June.` };
const a = (label, options = [], extra = {}) => answerFor(label, options, { profile, custom: [], ...extra });

test('fit: yes, no and unsure', () => {
  assert.equal(fit(job, rules).ok, true);
  assert.match(fit({ ...job, title: 'Senior Analyst' }, rules).why, /title/);
  assert.match(fit({ ...job, location: 'Paris' }, rules).why, /location/);
  assert.equal(fit({ ...job, text }, rules).unsure, true);
  assert.equal(fit({ ...job, text: 'short' }, rules).unsure, true, 'an unread posting is never a yes');
  assert.equal(fit({ ...job, location: '' }, rules).unsure, true);
});
test('fit: years, pay and work status', () => {
  assert.match(fit({ ...job, text: `${job.text} 5+ years of experience required.` }, rules).why, /5\+/);
  assert.equal(minYears('3-5 years of experience. 8 years of experience preferred.'), 3);
  assert.equal(minYears('Founded two years ago.'), null);
  assert.equal(excludesStatus('We cannot hire candidates (e.g. interns) on a training visa.', ['training visa']), true);
  assert.equal(excludesStatus('Training visa holders are welcome.', ['training visa']), false);
});
test('score orders and picks the resume', () => {
  const r = { score: [{ pattern: 'maps', points: 30, why: 'x' }], tracks: [{ id: 'gis', pattern: 'gis' }] };
  assert.ok(score({ title: 'maps' }, r).score > score({ title: 'other' }, r).score);
  assert.equal(resumeFor('GIS Analyst', { resumes: { default: 'd.pdf', gis: 'g.pdf' } }, r), 'g.pdf');
});
test('answers come only from the profile', () => {
  assert.equal(a('Will you require sponsorship?', ['Yes', 'No']), 'No');
  assert.equal(a('Have you been convicted of a felony?', ['Yes', 'No']), null, 'undeclared facts are asked, never assumed');
  assert.equal(a('Do you have a non-compete?', ['Yes', 'No']), null);
  assert.equal(a('Describe your favorite book'), null);
  assert.equal(a('Why our company?', [], { long: true }), null);
  assert.equal(a('Company'), 'Example Corp');
  assert.equal(a('What do you like about our company?'), null);
  assert.equal(a('Veteran status', ['I am a veteran', 'I prefer not to say']), 'I prefer not to say');
  assert.equal(a('Favorite color', ['Red', 'Blue'], { saved: { 'Favorite color *': 'Blue' } }), 'Blue');
});
test('never claims a status the user does not hold', () => {
  assert.equal(a('Are you a U.S. citizen?', ['Yes', 'No']), null);
  assert.equal(a('Work status', ['I am a citizen', 'Other'], { saved: { 'Work status': 'I am a citizen' } }), null);
  assert.equal(a('Are you legally authorized to work?', ['Yes, I am a citizen', 'No']), null);
});
test('options match on whole words', () => {
  assert.equal(pickOption(['Not sure', 'Norway', 'No, I do not'], 'No'), 'No, I do not');
  assert.equal(pickOption(['Not sure'], 'No'), null);
});
test('consents need prior agreement', () => {
  assert.equal(consentFor('I agree to the privacy policy', profile.consents), true);
  assert.equal(consentFor('Send me marketing and privacy news', profile.consents), false);
  assert.equal(consentFor('I confirm this was written without AI', { ai_use_policy: true }), false);
});
test('one id per job', () => {
  assert.equal(jobKey('https://boards.greenhouse.io/x/jobs/12345?gh_src=1'), jobKey('https://job-boards.greenhouse.io/x/jobs/12345'));
  assert.equal(jobKey('https://x.com/jobs/1/apply?utm_source=a'), jobKey('https://www.x.com/jobs/1'));
  assert.notEqual(jobKey('https://x.com/job?id=1'), jobKey('https://x.com/job?id=2'));
  assert.equal(jobKey('https://t.wd5.myworkdayjobs.com/en-US/s/job/City/Analyst_R-123'), jobKey('https://t.wd5.myworkdayjobs.com/s/job/City/Analyst_R-123/apply'));
});
test('workday opens only the titles worth reading', async () => {
  const { BOARDS } = await import('../src/discover/boards.mjs');
  const real = globalThis.fetch, asked = [];
  globalThis.fetch = async (u, o) => { asked.push(u); return Response.json(o.method === 'POST' ? { jobPostings: JSON.parse(o.body).offset ? [] : [{ title: 'Analyst', externalPath: '/job/a_R1' }, { title: 'Nurse', externalPath: '/job/n_R2' }] } : { jobPostingInfo: { title: 'Analyst', location: 'Remote', jobDescription: '<p>Hi &amp; bye</p>', externalUrl: 'https://t.wd5.myworkdayjobs.com/s/job/a_R1' } }); };
  try {
    const jobs = await BOARDS.workday('t/wd5/s', (t) => t === 'Analyst');
    assert.equal(jobs.length, 1); assert.equal(jobs[0].text, 'Hi & bye'); assert.ok(!asked.some((u) => u.includes('R2')));
  } finally { globalThis.fetch = real; }
});
