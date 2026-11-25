// Portal-independent form filler. It reads each visible field's real label, answers it from answers.mjs, and reports
// what it could not answer. It never touches passwords, one-time codes or CAPTCHAs, and it never submits.
import { existsSync } from 'node:fs';
import { config, homePath } from '../core/store.mjs';
import { resumeFor } from '../match/score.mjs';
import { answerFor, savedAnswers } from './answers.mjs';

const SKIP_FRAME = /hcaptcha|recaptcha|cloudflare/;

// Runs in the page. Tags each field and returns what it is, its label, its options and whether it is still empty.
function readFields() {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const visible = (e) => { const r = e.getClientRects(); return r.length > 0 && r[0].width > 1; };
  const byId = (ids) => clean((ids || '').split(' ').map((i) => document.getElementById(i)?.innerText || '').join(' '));
  const labelOf = (e) => {
    const own = clean(e.labels?.[0]?.innerText) || byId(e.getAttribute('aria-labelledby')) || clean(e.getAttribute('aria-label'));
    if (own) return own;
    let x = e; for (let k = 0; k < 3; k++) { x = x.parentElement; if (!x || x.tagName === 'FORM' || x.querySelectorAll('input:not([type=hidden]),select,textarea').length > 1) break; const s = clean(x.innerText); if (s && s.length < 200) return s; }
    return clean(e.placeholder) || clean((e.name || e.id || '').replace(/[_-]+/g, ' '));
  };
  const groupLabel = (e) => { const g = e.closest('fieldset,[role=radiogroup],[role=group]'); return g ? byId(g.getAttribute('aria-labelledby')) || clean(g.querySelector('legend')?.innerText) || clean(g.getAttribute('aria-label')) : ''; };
  const starred = (s) => /\*\s*$|\(required\)/i.test(s);
  const out = [], groups = new Map();
  document.querySelectorAll('[data-agent]').forEach((e) => e.removeAttribute('data-agent'));
  let n = 0;
  for (const e of document.querySelectorAll('input,select,textarea,button[aria-haspopup=listbox]')) {
    const drop = e.tagName === 'BUTTON'; // a button that opens a list (Workday and others)
    if (!drop && ['hidden', 'submit', 'button', 'password', 'reset', 'image'].includes(e.type)) continue;
    if (e.disabled || e.readOnly) continue;
    if (/captcha|verification|one.?time|security-input|honeypot/i.test(`${e.name} ${e.id} ${e.className} ${e.autocomplete}`) || e.getAttribute('aria-hidden') === 'true' || e.tabIndex < -1) continue;
    if (e.type === 'search' || e.closest('[role=search],nav,header,footer')) continue;
    const shown = visible(e) || (['radio', 'checkbox'].includes(e.type) && e.labels?.[0] && visible(e.labels[0]));
    if (e.type !== 'file' && !shown) continue;
    const label = labelOf(e), required = e.required || e.getAttribute('aria-required') === 'true' || starred(label);
    const tag = () => { e.dataset.agent = String(++n); return n; };
    if (e.type === 'radio' || (e.type === 'checkbox' && groupLabel(e) && e.closest('fieldset,[role=group]').querySelectorAll('input[type=checkbox]').length > 1)) {
      const gl = groupLabel(e), key = e.name || gl || label;
      const g = groups.get(key) || { kind: e.type, label: gl || key, required: false, options: [], ids: [], empty: true };
      g.required ||= required || starred(gl) || e.closest('[role=radiogroup],fieldset')?.getAttribute('aria-required') === 'true';
      g.options.push(label); g.ids.push(tag()); if (e.checked) g.empty = false;
      if (!groups.has(key)) { groups.set(key, g); out.push(g); }
      continue;
    }
    const f = { id: tag(), label, required, options: [] };
    if (drop) Object.assign(f, { kind: 'combo', label: byId((e.getAttribute('aria-labelledby') || '').split(' ')[0]) || clean(e.labels?.[0]?.innerText) || clean(e.getAttribute('aria-label')).replace(/select one|required/gi, '').trim(), required: required || /required/i.test(e.getAttribute('aria-label') || ''), empty: !clean(e.innerText) || /^(select|choose)/i.test(clean(e.innerText)) });
    else if (e.type === 'checkbox') Object.assign(f, { kind: 'check', empty: !e.checked });
    else if (e.type === 'file') Object.assign(f, { kind: 'file', empty: !e.files.length, name: `${e.name} ${e.id}` });
    else if (e.tagName === 'SELECT') Object.assign(f, { kind: 'select', empty: !e.value || /^(select|choose|please|--)/i.test(clean(e.selectedOptions[0]?.innerText)), options: [...e.options].filter((o) => o.value).map((o) => clean(o.innerText)) });
    else if (e.getAttribute('role') === 'combobox') { let full = !!e.value, x = e.parentElement; for (let k = 0; k < 5 && x && !full; k++, x = x.parentElement) { if (x.querySelectorAll('[role=combobox]').length > 1) break; full = !!clean(x.querySelector('[class*="single-value"],[class*="singleValue"],[class*="multi-value"],[class*="multiValue"]')?.innerText); } Object.assign(f, { kind: 'combo', empty: !full }); }
    else Object.assign(f, { kind: 'text', long: e.tagName === 'TEXTAREA', type: e.type, empty: !e.value.trim() });
    out.push(f);
  }
  return out;
}

// Consent boxes are only ticked when the user agreed to that kind in advance.
export function consentFor(label, consents = {}) {
  if (/(own work|without|not (been )?(generated|written)).{0,60}\b(AI|artificial intelligence|LLM)/i.test(label)) return false;
  if (/\bAI\b|artificial intelligence/i.test(label)) return consents.ai_use_policy === true;
  if (/arbitrat/i.test(label)) return consents.arbitration === true;
  if (/marketing|newsletter|job alerts|talent (community|network)|sms|text messages?/i.test(label)) return consents.marketing === true;
  if (/certify|attest|true and (complete|accurate)|accurate and complete/i.test(label)) return consents.certify_truthful === true;
  if (/privacy|personal data|data (protection|processing)|gdpr|terms/i.test(label)) return consents.privacy_policy === true;
  return false;
}

async function chooseCombo(frame, el, ask) {
  await el.click({ timeout: 3000 });
  await frame.waitForTimeout(400);
  const owned = await el.getAttribute('aria-controls') || await el.getAttribute('aria-owns');
  const list = owned ? frame.locator(`[id="${owned}"] [role=option]`) : frame.locator('[role=option]:visible');
  let options = (await list.allInnerTexts()).map((s) => s.trim()).filter(Boolean);
  let want = ask(options);
  if (!want && !options.length) { // typeahead: it only keeps a value picked from its suggestions
    const typed = ask([]);
    if (typed) { await el.fill(typed); await frame.waitForTimeout(1500); options = (await list.allInnerTexts()).map((s) => s.trim()).filter(Boolean); want = ask(options); }
  }
  if (want) { await list.filter({ hasText: want }).nth(0).click({ timeout: 3000 }); return true; }
  await el.press('Escape').catch(() => {});
  return false;
}

export async function fillPage(page, job, { profile = config('profile'), saved = savedAnswers(job.url), custom } = {}) {
  const total = { filled: 0, missing: [], optional: [], questions: [] };
  for (const frame of page.frames()) {
    if (SKIP_FRAME.test(frame.url())) continue;
    const done = new Set();
    for (let pass = 0; pass < 2; pass++) { // an answer can reveal a follow-up question
      const fields = await frame.evaluate(readFields).catch(() => []);
      for (const f of fields) {
        const key = `${f.kind}|${f.label}`;
        if (!f.empty || done.has(key)) continue;
        done.add(key);
        const el = frame.locator(`[data-agent="${f.id ?? f.ids[0]}"]`).first();
        const ask = (options) => answerFor(f.label, options, { profile, saved, custom, long: f.long });
        let ok = false;
        try {
          if (f.kind === 'file') {
            const what = `${f.label} ${f.name}`;
            const file = /cover/i.test(what) ? profile.files?.cover_letter : /transcript/i.test(what) ? profile.files?.transcript : /resume|résumé|\bcv\b|curriculum/i.test(what) ? resumeFor(job.title || '', profile) : null;
            if (file && existsSync(homePath(file))) { await el.setInputFiles(homePath(file)); await frame.waitForTimeout(1500); ok = true; }
          } else if (f.kind === 'check') {
            if (consentFor(f.label, profile.consents)) { await el.check({ timeout: 2500, force: true }); ok = true; }
          } else if (f.kind === 'radio' || f.kind === 'checkbox') {
            const v = ask(f.options);
            if (v) { await frame.locator(`[data-agent="${f.ids[f.options.indexOf(v)]}"]`).check({ timeout: 2500, force: true }); ok = true; }
          } else if (f.kind === 'select') {
            const v = ask(f.options);
            if (v) { await el.selectOption({ label: v }); ok = true; }
          } else if (f.kind === 'combo') ok = await chooseCombo(frame, el, ask);
          else {
            const v = ask([]);
            if (v && !(f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v))) { await el.fill(String(v), { timeout: 2500 }); await el.blur().catch(() => {}); ok = true; }
          }
        } catch { ok = false; }
        if (ok) total.filled++;
      }
    }
    // Read again at the end: what counts is what the form shows, not what was typed.
    for (const f of await frame.evaluate(readFields).catch(() => [])) if (f.empty) {
      (f.required ? total.missing : total.optional).push(f.label);
      if (f.required && f.kind !== 'file') total.questions.push({ label: f.label, kind: f.kind, options: f.options.slice(0, 40) });
    }
  }
  total.missing = [...new Set(total.missing)];
  return total;
}

// For the person: outlines required fields that are still empty and puts the cursor in the first one.
export async function highlight(page) {
  let focused = false;
  for (const frame of page.frames()) {
    if (SKIP_FRAME.test(frame.url())) continue;
    for (const f of await frame.evaluate(readFields).catch(() => [])) {
      if (!f.empty || !f.required) continue;
      const el = frame.locator(`[data-agent="${f.id ?? f.ids[0]}"]`).first();
      await el.evaluate((e) => { e.style.outline = '3px solid #e0a800'; e.style.outlineOffset = '2px'; }).catch(() => {});
      if (!focused) { focused = true; await el.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {}); await el.focus({ timeout: 1000 }).catch(() => {}); }
    }
  }
}
