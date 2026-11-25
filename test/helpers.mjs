import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const home = mkdtempSync(join(tmpdir(), 'agent-test-'));
process.env.JOB_AGENT_HOME = home;
for (const d of ['config', 'data', 'resumes']) mkdirSync(join(home, d));
writeFileSync(join(home, 'resumes/resume.pdf'), 'test');
export const profile = {
  language: 'en', identity: { first_name: 'Ada', last_name: 'Example', email: 'ada@example.com' }, address: { city: 'Springfield' },
  education: [{ school: 'Example University', level: "Bachelor's Degree" }], experience: [{ employer: 'Example Corp' }],
  work_authorization: { authorized: 'Yes', needs_sponsorship_now_or_future: 'No', never_claim: ['citizen', 'permanent resident'] },
  declarations: {}, preferences: {}, self_id: { veteran: 'Decline' }, resumes: { default: 'resumes/resume.pdf' }, consents: { privacy_policy: true },
};
export const rules = { titles_include: ['\\banalyst\\b'], titles_exclude: ['\\bsenior\\b'], locations_include: ['remote'], text_exclude: [{ pattern: 'commission-only', why: 'pay' }], unsure_when_missing: [{ pattern: 'start date', why: 'no date' }], max_years: 2, blocked_work_statuses: ['training visa'] };
for (const [n, v] of Object.entries({ profile, rules, sources: {}, agent: { time_zone: 'UTC' }, answers: { rules: [] } })) writeFileSync(join(home, 'config', `${n}.json`), JSON.stringify(v));
