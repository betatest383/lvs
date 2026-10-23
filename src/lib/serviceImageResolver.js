import { appParams } from '@/lib/app-params';

const PUBLIC_MEDIA_BASE = 'https://media.base44.com/images/public';

/**
 * Checks if a value is a full URL (http/https).
 */
export function isFullUrl(value) {
  if (!value || typeof value !== 'string') return false;
  return /^https?:\/\//i.test(value.trim());
}

/**
 * Checks if a value is a relative storage path (not a full URL, not empty).
 * e.g. "Images/Service/8021b35b-...png"
 */
export function isRelativeStoragePath(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  return !isFullUrl(trimmed);
}

/**
 * Resolves a service_image value into a displayable image URL.
 *
 * - Full URLs (http/https) are returned as-is — this is what manual upload produces.
 * - Relative storage paths (e.g. "Images/Service/xxx.png") are resolved to
 *   public media URLs using the app's storage namespace, producing the same
 *   format as a manual UploadFile result.
 * - Empty/null values return null (placeholder will show).
 *
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function resolveServiceImage(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (isFullUrl(trimmed)) return trimmed;

  // Relative storage path — resolve to public media URL
  const appId = appParams.appId;
  if (!appId) {
    console.warn('[ServiceImage] Cannot resolve relative path — appId unavailable:', trimmed);
    return trimmed;
  }
  const resolved = `${PUBLIC_MEDIA_BASE}/${appId}/${trimmed}`;
  console.log('[ServiceImage] Resolved relative path:', { original: trimmed, resolved });
  return resolved;
}