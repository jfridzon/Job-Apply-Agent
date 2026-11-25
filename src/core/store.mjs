// Paths, config and the append-only ledgers. Every decision is one JSON line and the last line for a job is its
// state, so a crash or a restart never loses progress. JOB_AGENT_HOME moves all private files elsewhere (tests, demo).
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const HOME = process.env.JOB_AGENT_HOME || ROOT;
export const DATA = join(HOME, 'data');
mkdirSync(DATA, { recursive: true });

export const dataPath = (...parts) => join(DATA, ...parts);
export const homePath = (p) => join(HOME, p);
export function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${file} is not valid JSON: ${e.message}`); }
}
// Written to a temporary file first, so a process that dies halfway never leaves a broken file.
export function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 1));
  renameSync(`${file}.tmp`, file);
}

const real = (name) => join(HOME, 'config', `${name}.json`);
export const hasConfig = (name) => existsSync(real(name));
// Reading may fall back to the example; anything that could send data must call requireConfig() first.
export const config = (name) => readJson(hasConfig(name) ? real(name) : join(ROOT, 'config', `${name}.example.json`), {});
export function requireConfig(...names) {
  const missing = names.filter((n) => !hasConfig(n));
  if (missing.length) throw new Error(`Missing ${missing.map((n) => `config/${n}.json`).join(', ')}. Run the setup in AGENTS.md first.`);
}

export function rows(ledger) {
  const file = dataPath(`${ledger}.jsonl`);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}
export const add = (ledger, row) => appendFileSync(dataPath(`${ledger}.jsonl`), `${JSON.stringify({ at: new Date().toISOString(), ...row })}\n`);

const TRACKING = /^(utm_.*|gh_src|source|src|ref|referrer|lever-source.*|lever-origin|trk|trackingid|refid|codes)$/i;
// One id per job, however the link is written: tracking parameters, /apply suffixes, embedded boards, letter case.
export function jobKey(url = '') {
  let u; try { u = new URL(url); } catch { return String(url).toLowerCase(); }
  const uuid = url.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i);
  if (uuid) return uuid[0].toLowerCase();
  const gh = u.searchParams.get('gh_jid') || (/greenhouse\.io$/.test(u.hostname) && (u.searchParams.get('token') || u.pathname.match(/\/jobs\/(\d+)/)?.[1]));
  if (gh) return `greenhouse:${gh}`;
  const wd = /myworkdayjobs\.com$/.test(u.hostname) && u.pathname.match(/_([A-Za-z]*-?\d[\w-]*?)(?:\/apply.*)?$/);
  if (wd) return `workday:${u.hostname.split('.')[0]}:${wd[1]}`.toLowerCase();
  const params = [...u.searchParams].filter(([k]) => !TRACKING.test(k)).sort().map(([k, v]) => `${k}=${v}`).join('&');
  return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/(apply|application)\/?$/, '').replace(/\/$/, '')}${params ? `?${params}` : ''}`.toLowerCase();
}
export function latest(ledger) { const map = new Map(); for (const r of rows(ledger)) map.set(jobKey(r.url), r); return map; }

export const companyKey = (s = '') => s.toLowerCase().replace(/\b(inc|llc|ltd|corp|co|careers?|jobs?|the)\b/g, '').replace(/[^\p{L}\p{N}]/gu, '');
export const isMain = (meta) => Boolean(process.argv[1]) && fileURLToPath(meta.url) === realpathSync(process.argv[1]);
export const option = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
export const flag = (name) => process.argv.includes(name);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
