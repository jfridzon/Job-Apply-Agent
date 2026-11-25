// Orders what already fits: 0 to 100, from the user's own signals in rules.json. It never overrides fit().
import { config } from '../core/store.mjs';

export function score({ title = '', company = '', text = '' }, rules = config('rules')) {
  const where = { title, company, text };
  let total = 40; const reasons = [];
  for (const s of rules.score || []) {
    if (!new RegExp(s.pattern, 'i').test(where[s.in || 'title'] || '')) continue;
    total += s.points; reasons.push(`${s.points > 0 ? '+' : ''}${s.points} ${s.why}`);
  }
  const track = (rules.tracks || []).find((t) => new RegExp(t.pattern, 'i').test(title));
  return { score: Math.max(0, Math.min(100, total)), track: track?.id || 'default', reasons };
}

// Which resume goes with a job: the track's file, or the default one.
export function resumeFor(title, profile = config('profile'), rules = config('rules')) {
  const { track } = score({ title }, { tracks: rules.tracks });
  return profile.resumes?.[track] || profile.resumes?.default || null;
}
