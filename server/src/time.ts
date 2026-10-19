export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const MINUTE = 60_000;
export const iso = (ms: number) => new Date(ms).toISOString();
// Africa/Douala is UTC+1, with no daylight saving transitions.
export function localMidnight(ms: number) {
  const d = new Date(ms + HOUR);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - HOUR;
}
export function monthStart(ms: number) {
  const d = new Date(ms + HOUR);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - HOUR;
}
export function monthEnd(ms:number) {
  const d=new Date(ms+HOUR);
  return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)-HOUR;
}
export function weekStart(ms: number) {
  const day = new Date(ms + HOUR).getUTCDay();
  return localMidnight(ms) - ((day + 6) % 7) * DAY;
}
export function localDate(ms: number) { return iso(ms + HOUR).slice(0, 10); }
export function shiftAt(ms: number) {
  const midnight = localMidnight(ms);
  const hour = (ms - midnight) / HOUR;
  const start = midnight + (hour < 6 ? -2 : hour < 14 ? 6 : hour < 22 ? 14 : 22) * HOUR;
  const index = new Date(start + HOUR).getUTCHours() === 6 ? 0 : new Date(start + HOUR).getUTCHours() === 14 ? 1 : 2;
  return { start, end: start + 8 * HOUR, templateId: index + 1, index };
}
export function historyStart(ms: number) {
  return Math.min(shiftAt(ms).start - 10 * DAY, shiftAt(monthStart(ms)).start);
}
export function requireInstant(value: unknown): number {
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error('Date ISO avec fuseau requise');
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error('Date invalide');
  return ms;
}
