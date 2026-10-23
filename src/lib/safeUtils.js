/**
 * Safe array helper.
 * - If value is an array, return it.
 * - If value is a JSON string array, parse and return it.
 * - If value is null/undefined/empty, return [].
 * - If invalid, return [].
 */
export function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Safe string helper. Returns '' for null/undefined.
 */
export function safeString(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

/**
 * Safe number helper. Returns fallback (default 0) for null/undefined/NaN.
 */
export function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return isNaN(n) ? fallback : n;
}

/**
 * Safe boolean helper. Returns false for null/undefined.
 */
export function safeBool(value) {
  return value === true;
}