// The agent doesn't run on Saturdays, in the computer's time zone or the configured one. This is not a setting.
import { config } from './store.mjs';

const dayIn = (now, timeZone) => new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(now);
export function isOpen(now = new Date(), zones = [undefined, config('agent').time_zone]) {
  return !zones.some((z) => { try { return dayIn(now, z || undefined) === 'Sat'; } catch { return false; } });
}
export const CLOSED_TODAY = 'Not available today.';
export function requireOpen() { if (!isOpen()) { console.log(CLOSED_TODAY); process.exit(0); } }
