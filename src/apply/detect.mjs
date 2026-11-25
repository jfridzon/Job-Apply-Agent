// Reads what a page is showing: the steps that belong to a person, a closed job, a confirmation.
export const CONFIRMED = /thank(s| you) for (applying|your application|submitting)|application (has been |was |is )?(successfully )?(submitted|received|sent)|we(.ve| have) (successfully )?received your application|successfully (submitted|applied)|you(.ve| have) (already )?applied/i;
export const CLOSED = /no longer (available|accepting|active|open)|(job|position|posting) (has been|is|has) (closed|filled|expired)|job (not found|is not available)/i;

// 'captcha' | 'code' | 'account' | null. These are never solved, typed or created by the agent.
// An invisible CAPTCHA badge is on almost every form, so only a visible challenge or checkbox counts.
export async function blocker(page) {
  for (const frame of page.frames()) {
    const found = await frame.evaluate(() => {
      const box = (e) => { const r = e.getBoundingClientRect(); return getComputedStyle(e).visibility !== 'hidden' && r.width > 200 && r.height > 50 && r.top > -5000 ? r : null; };
      for (const f of document.querySelectorAll('iframe')) {
        if (/recaptcha\/(api2|enterprise)\/bframe|hcaptcha\.com.*challenge|challenges\.cloudflare\.com/.test(f.src) && box(f)) return 'captcha';
        if (/recaptcha\/(api2|enterprise)\/anchor/.test(f.src) && !/size=invisible/.test(f.src) && box(f)) return 'captcha';
        if (/hcaptcha\.com.*checkbox/.test(f.src) && !/size=invisible/.test(f.src) && box(f)) return 'captcha';
      }
      const seen = (e) => e.getClientRects().length > 0;
      if (/verify (that )?you are (a )?human/i.test(document.body.innerText.slice(0, 3000))) return 'captcha';
      const code = [...document.querySelectorAll('input[autocomplete="one-time-code"],input[id^="security-input"],input[name*="verification_code" i],input[id*="verification-code" i]')].filter(seen);
      if (code.some((e) => !e.value)) return 'code';
      if ([...document.querySelectorAll('input[type=password]')].some(seen)) return 'account';
      return null;
    }).catch(() => null);
    if (!found) continue;
    if (found === 'captcha' && await solved(page)) continue; // the person already did it
    return found;
  }
  return null;
}
export async function solved(page) {
  for (const f of page.frames()) if (await f.evaluate(() => [...document.querySelectorAll('[name="g-recaptcha-response"],[name="h-captcha-response"],[name="cf-turnstile-response"]')].some((e) => (e.value || '').length > 20)).catch(() => false)) return true;
  return false;
}
export async function pageText(page) {
  const parts = [];
  for (const f of page.frames()) parts.push(await f.evaluate(() => document.body?.innerText || '').catch(() => ''));
  return parts.join('\n');
}
