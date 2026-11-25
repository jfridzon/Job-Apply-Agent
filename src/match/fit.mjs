// Decides from the FULL posting whether a job fits. Titles lie: many programs never name their start date or level
// in the title. Three outcomes: fits, doesn't fit (with a reason), or unsure. Unsure is never sent.
import { config } from '../core/store.mjs';

const re = (pattern) => new RegExp(pattern, 'i');
const any = (list = [], text = '') => list.some((p) => re(p).test(text));

// Postings that rule out a work status the user holds, in the words employers actually use.
export function excludesStatus(text, statuses = []) {
  const clean = text.replace(/\b(e\.g|i\.e)\.,?/gi, 'eg').replace(/\bU\.S\./g, 'US'); // dots inside a sentence
  return statuses.some((s) => {
    const k = `\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`;
    return re(`${k}[^.]{0,80}\\b(not eligible|ineligible|not accept\\w*|not be considered|not qualify)|\\bnot (eligible|accept\\w*|consider\\w*)[^.]{0,80}${k}|(will not|won't|does not|do not|cannot|unable to)\\b[^.]{0,160}${k}`).test(clean);
  });
}

// Years the posting requires: the largest minimum next to "experience", ignoring "preferred" and similar lines.
export function minYears(text = '') {
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  let best = null;
  for (const line of text.split(/(?<=[.;•●▪\n])\s*/)) {
    if (!/experience/i.test(line) || /prefer|nice to have|bonus|a plus/i.test(line)) continue;
    for (const m of line.matchAll(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*\d{1,2}\s*\+?\s*)?(?:or more\s*)?years?/gi)) {
      const n = words[m[1].toLowerCase()] ?? Number(m[1]);
      if (n > 0 && n <= 20) best = Math.max(best ?? 0, n);
    }
  }
  return best;
}

export function fit({ title = '', text = '', location = '', company = '' }, rules = config('rules')) {
  const no = (why) => ({ ok: false, why });
  const all = `${title}\n${text}`;
  if (any(rules.titles_exclude, title)) return no('title excluded');
  if (any(rules.companies_exclude, company)) return no('company excluded');
  if (any(rules.locations_exclude, location)) return no(`location: ${location}`);
  if (rules.locations_include?.length && location && !any(rules.locations_include, location)) return no(`location: ${location}`);
  if (rules.titles_include?.length && !any(rules.titles_include, title)) return no('title not in scope');
  for (const r of rules.text_exclude || []) if (re(r.pattern).test(all)) return no(r.why);
  if (excludesStatus(text, rules.blocked_work_statuses)) return no('posting rules out your work status');
  const years = minYears(text);
  if (rules.max_years != null && years > rules.max_years) return no(`asks for ${years}+ years`);
  if (text.trim().length < 200) return { ok: false, unsure: true, why: 'could not read the full posting' };
  if (rules.text_require_any?.length && !any(rules.text_require_any, all)) return no('missing a required term');
  if (rules.locations_include?.length && !location) return { ok: false, unsure: true, why: 'no location in the posting' };
  for (const r of rules.unsure_when_missing || []) if (!re(r.pattern).test(all)) return { ok: false, unsure: true, why: r.why };
  return { ok: true, why: 'matches your rules' };
}
