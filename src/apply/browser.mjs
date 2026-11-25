// The agent drives its own Chrome window through a local debugging port, with its own profile folder: the user's
// sign-ins for job sites live there, separate from their everyday browser, and they can watch or take over any tab.
// Tabs open in the background so the window never steals focus, and scripts wait while the machine is overloaded.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadavg } from 'node:os';
import { chromium } from 'playwright';
import { config, homePath, sleep } from '../core/store.mjs';

const settings = () => ({ port: 9333, max_load: 12, ...config('agent').browser });
const base = () => `http://127.0.0.1:${settings().port}`;
const alive = async () => { try { return (await fetch(`${base()}/json/version`)).ok; } catch { return false; } };
const CANDIDATES = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
export const chromePath = () => CANDIDATES.find((p) => p && existsSync(p));

async function launch() {
  const path = chromePath();
  if (!path) throw new Error('Chrome was not found. Install it or set CHROME_PATH.');
  const { port } = settings();
  // A background window would be throttled, which leaves forms half filled; these flags keep it running.
  spawn(path, [`--user-data-dir=${homePath('chrome-profile')}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 40 && !(await alive()); i++) await sleep(500);
  if (!(await alive())) throw new Error('Chrome did not open. Close any window using the agent profile and try again.');
}

export async function openBrowser({ foreground = false } = {}) {
  if (!foreground && process.platform !== 'win32') for (let i = 0; i < 60 && loadavg()[0] > settings().max_load; i++) await sleep(10000);
  if (!(await alive())) await launch();
  const browser = await chromium.connectOverCDP(base());
  return { browser, ctx: browser.contexts()[0], close: () => browser.close().catch(() => {}) }; // detaches; Chrome stays open
}

// context.newPage() raises the window; the DevTools endpoint doesn't.
export async function newTab({ ctx }) {
  const before = new Set(ctx.pages());
  await fetch(`${base()}/json/new?about:blank`, { method: 'PUT' });
  for (let i = 0; i < 20; i++) { const p = ctx.pages().find((x) => !before.has(x)); if (p) return p; await sleep(150); }
  return ctx.newPage();
}
