// English is the default and the key. Another language is one JSON file in locales/ that maps English to it;
// anything missing stays in English, so a half-finished translation still works.
import { join } from 'node:path';
import { ROOT, config, readJson } from './store.mjs';

export function translator(lang = config('profile').language || 'en') {
  const strings = /^[a-z]{2}(-[A-Z]{2})?$/.test(lang) && lang !== 'en' ? readJson(join(ROOT, 'locales', `${lang}.json`), {}) : {};
  const t = (key, vars = {}) => (strings[key] || key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  return { lang, strings, t };
}
