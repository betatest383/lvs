/**
 * Display-timezone helpers for LVC OS.
 *
 * Stored timestamps arrive in UTC (e.g. 2026-08-19T17:00:00+00:00). These
 * helpers convert them to America/New_York wall-clock for DISPLAY ONLY — they
 * never mutate stored values. Date-only strings (YYYY-MM-DD) are returned
 * as-is because they carry no time component and no conversion is needed.
 *
 * Uses the runtime Intl tz database so DST is handled correctly (no simplified
 * EDT/EST math).
 */

export const APP_TIMEZONE = 'America/New_York';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isDateOnly(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Parse an instant (ISO) and return its wall-clock parts in APP_TIMEZONE. */
export function toZonedParts(iso) {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const map = {};
  for (const p of fmt.formatToParts(d)) map[p.type] = p.value;
  const hour = map.hour === '24' ? '00' : map.hour;
  return { year: map.year, month: map.month, day: map.day, hour, minute: map.minute };
}

function to12h(p) {
  const h = parseInt(p.hour, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { h12, ampm };
}

/** "MMM D, YYYY" in APP_TIMEZONE. Date-only strings are returned as-is. */
export function formatDateET(value) {
  if (!value) return '—';
  if (isDateOnly(value)) {
    const [y, m, d] = value.split('-');
    return `${MONTHS[+m - 1]} ${+d}, ${y}`;
  }
  const p = toZonedParts(value);
  if (!p) return '—';
  return `${MONTHS[+p.month - 1]} ${+p.day}, ${p.year}`;
}

/** "MMM D, h:mm A" in APP_TIMEZONE. */
export function formatDateTimeET(value) {
  if (!value) return '—';
  const p = toZonedParts(value);
  if (!p) return '—';
  const { h12, ampm } = to12h(p);
  return `${MONTHS[+p.month - 1]} ${+p.day}, ${h12}:${p.minute} ${ampm}`;
}

/** "h:mm A" in APP_TIMEZONE. */
export function formatTimeET(value) {
  if (!value) return '';
  const p = toZonedParts(value);
  if (!p) return '';
  const { h12, ampm } = to12h(p);
  return `${h12}:${p.minute} ${ampm}`;
}

/** "YYYY-MM-DD" in APP_TIMEZONE for <input type="date">. Date-only strings pass through. */
export function formatDateInputET(value) {
  if (!value) return '';
  if (isDateOnly(value)) return value;
  const p = toZonedParts(value);
  return p ? `${p.year}-${p.month}-${p.day}` : '';
}

/** "HH:mm" in APP_TIMEZONE for <input type="time">. Wall-clock times pass through. */
export function formatTimeInputET(value) {
  if (!value) return '';
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  const p = toZonedParts(value);
  return p ? `${p.hour}:${p.minute}` : '';
}

/** Convert a wall-clock date+time in APP_TIMEZONE back to a UTC ISO string. */
export function wallClockToUtcISO(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  const asIfUtc = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (isNaN(asIfUtc.getTime())) return null;
  const p = toZonedParts(asIfUtc);
  if (!p) return null;
  const zonedAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  const offsetMin = (zonedAsUtc - asIfUtc.getTime()) / 60000;
  return new Date(asIfUtc.getTime() - offsetMin * 60000).toISOString();
}