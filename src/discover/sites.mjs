#!/usr/bin/env node
// Sweeps job sites the user is signed in to (a university board, a niche community, an alumni network), in the
// agent's own Chrome. The user signs in by hand, once. Off by default: each site needs "enabled" and "terms_checked",
// which the user sets after reading that site's rules. Slow, capped, and it stops when a site says to slow down or
// shows a bot check. It only reads; applications always go through the employer's own form.
// Usage: npm run sites [-- --only name]
import { isOpen, requireOpen } from '../core/open.mjs';
import { add, config, isMain, jobKey, latest, option, sleep } from '../core/store.mjs';
import { consider } from './discover.mjs';
import { plain } from './boards.mjs';
import { newTab, openBrowser } from '../apply/browser.mjs';
import { blocker } from '../apply/detect.mjs';

// Prefers the schema.org JobPosting most sites embed, and falls back to what the page shows.
export const readPosting = (page) => page.evaluate(() => {
  const flat = (x) => (Array.isArray(x) ? x.flatMap(flat) : x && x['@graph'] ? flat(x['@graph']) : [x]);
  const parse = (s) => { try { return flat(JSON.parse(s.textContent)); } catch { return []; } };
  const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(parse).find((x) => x && [].concat(x['@type']).includes('JobPosting')) || {};
  const place = [].concat(ld.jobLocation || []).map((l) => l?.address).map((a) => (typeof a === 'string' ? a : [a?.addressLocality, a?.addressRegion, a?.addressCountry?.name || a?.addressCountry].filter(Boolean).join(', '))).filter(Boolean).join('; ');
  const apply = [...document.querySelectorAll('a[href^="http"]')].find((a) => /apply/i.test(a.innerText) && new URL(a.href).hostname !== location.hostname);
  return { title: ld.title || document.querySelector('h1')?.innerText || '', company: ld.hiringOrganization?.name || '', location: [place, ld.jobLocationType === 'TELECOMMUTE' ? 'Remote' : ''].filter(Boolean).join('; '), html: ld.description || '', text: (document.querySelector('main') || document.body).innerText.slice(0, 20000), posted: ld.datePosted || '', apply: apply?.href || '' };
});

export async function sweepSite(page, site, seen, { pauseMs = 4000, open = isOpen } = {}) {
  const c = { pages: 0, read: 0, new: 0, apply: 0, unsure: 0, skip: 0 };
  const stop = async (status) => {
    if (!open()) return 'not available';
    if (status === 429 || status === 403) return 'asked to slow down';
    if (site.signed_out && new RegExp(site.signed_out, 'i').test(page.url())) return 'sign in needed';
    const b = await blocker(page);
    return b === 'account' ? 'sign in needed' : b;
  };
  const links = new Map();
  for (const query of site.queries?.length ? site.queries : ['']) {
    const r = await page.goto(site.search_url.replace('{query}', encodeURIComponent(query)), { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(pauseMs); c.pages++;
    const why = await stop(r?.status()); if (why) return { ...c, stopped: why };
    const found = await page.locator('a[href]').evaluateAll((as) => as.map((a) => ({ href: a.href, text: a.innerText.trim() })));
    for (const l of found) if (new RegExp(site.link_pattern).test(l.href) && !seen.has(jobKey(l.href))) links.set(jobKey(l.href), l.href);
  }
  for (const href of [...links.values()].slice(0, site.max_per_run ?? 40)) {
    const r = await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
    await page.waitForTimeout(pauseMs);
    const why = await stop(r?.status()); if (why) return { ...c, stopped: why };
    const p = await readPosting(page).catch(() => null); if (!p) continue;
    c.read++;
    const job = { url: p.apply || href, company: p.company || site.name, title: p.title.trim(), location: p.location, text: plain(p.html) || p.text, posted: p.posted, source: site.name, ats: 'site' };
    const d = consider(job, seen); if (d) { c.new++; c[d]++; }
    if (p.apply) { add('decisions', { url: href, company: job.company, title: job.title, decision: 'skip', why: 'listing: the employer link is used instead' }); seen.set(jobKey(href), job); }
  }
  return c;
}

if (isMain(import.meta)) {
  requireOpen();
  const only = option('--only');
  const all = (config('sources').sites || []).filter((s) => s.enabled && (!only || s.name === only));
  for (const s of all.filter((x) => !x.terms_checked)) console.log(`${s.name}: skipped. Read its terms, then set "terms_checked": true in config/sources.json.`);
  const sites = all.filter((s) => s.terms_checked);
  if (sites.length) {
    const nav = await openBrowser(), page = await newTab(nav), seen = latest('decisions');
    for (const site of sites) {
      const r = await sweepSite(page, site, seen).catch((e) => ({ stopped: e.message.split('\n')[0] }));
      add('sweeps', { source: site.name, ...r });
      console.log(`${site.name}: ${JSON.stringify(r)}`);
      await sleep(2000);
    }
    await page.close().catch(() => {}); await nav.close();
  }
}
