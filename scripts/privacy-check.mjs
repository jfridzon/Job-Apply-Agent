// Fails when a tracked file holds something that looks personal or secret, or any word in a private list kept outside
// the repo (PRIVACY_DENYLIST=/path/to/words.txt, one per line). Runs in CI and before every commit (npm run hooks).
// --history also reads every past version and commit message.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 });
const deny = process.env.PRIVACY_DENYLIST && existsSync(process.env.PRIVACY_DENYLIST) ? readFileSync(process.env.PRIVACY_DENYLIST, 'utf8').split('\n').map((w) => w.trim().toLowerCase()).filter(Boolean) : [];
const RULES = [
  ['email', /[\w.%+-]+@(?!example\.com|users\.noreply\.github\.com|anthropic\.com|\$\{)[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.(?!example\b)[a-z]{2,}/],
  ['phone', /(?<![\d.-])(\+\d{1,3}[-. ])?\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}(?![\d-])/],
  ['home folder', /\/(Users|home)\/(?!runner\b)[a-z][\w.-]+\//i],
  ['secret', /(sk-|ghp_|gho_|github_pat_|xox[bp]-|AKIA)[A-Za-z0-9_-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY/],
  ['social security number', /(?<![\d-])\d{3}-\d{2}-\d{4}(?![\d-])/],
];
const FORBIDDEN = /^(data|resumes|chrome-profile)\/|^config\/(?!.*\.example\.json$)|\.(pdf|docx?|pem|key)$|(^|\/)\.env/;
let bad = 0;
const scan = (name, text) => text.split('\n').forEach((line, i) => {
  const hit = RULES.find(([, re]) => re.test(line))?.[0] || (deny.some((w) => line.toLowerCase().includes(w)) ? 'private word' : '');
  if (hit) { bad++; console.log(`${name}:${i + 1}: ${hit}`); }
});
const files = git('ls-files', '--cached', '--others', '--exclude-standard').split('\n').filter((f) => f && existsSync(f));
for (const f of files) {
  if (FORBIDDEN.test(f)) { bad++; console.log(`${f}: private kind of file`); }
  scan(f, f); // names leak too
  if (f !== 'scripts/privacy-check.mjs') scan(f, readFileSync(f, /\.(png|jpe?g|gif)$/i.test(f) ? 'latin1' : 'utf8'));
}
if (process.argv.includes('--history')) scan('history', git('log', '--all', '-p', '--format=%an %ae %cn %ce%n%B', '--', '.', ':!scripts/privacy-check.mjs', ':!*.png'));
console.log(bad ? `${bad} problem(s)` : `clean: ${files.length} files`);
process.exitCode = bad ? 1 : 0;
