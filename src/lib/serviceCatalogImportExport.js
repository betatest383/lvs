/**
 * Service Catalog CSV export/import utilities.
 * service_image is treated as a URL/text value for spreadsheet round-tripping.
 * Relative storage paths are resolved to public media URLs at import time.
 */
import { appParams } from '@/lib/app-params';

const EXPORT_COLUMNS = [
  'service_name',
  'service_code',
  'category',
  'service_image',
  'is_active',
  'description',
  'customer_description',
  'internal_notes',
  'estimated_time_hours',
  'estimated_time_minutes',
  'default_selling_price',
  'pricing_type',
  'pricebook_item_id',
  'pricebook_item_name',
  'materials_required',
  'default_material_packages',
  'default_materials',
  'default_labor_hours',
  'allow_labor_adjustment',
  'minimum_labor_hours',
  'maximum_labor_hours',
  'service_commission_type',
  'service_commission_value',
  'material_commission_type',
  'material_commission_value',
  'sort_order',
];

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportServicesToCsv(services) {
  const header = EXPORT_COLUMNS.join(',');
  const rows = services.map(svc =>
    EXPORT_COLUMNS.map(col => escapeCsv(svc[col])).join(',')
  );
  return [header, ...rows].join('\r\n');
}

export function downloadServicesCsv(services) {
  const csv = exportServicesToCsv(services);
  console.log('[ServiceCatalog Export] Headers:', EXPORT_COLUMNS.join(', '));
  console.log('[ServiceCatalog Export] service_image included:', EXPORT_COLUMNS.includes('service_image'));
  console.log('[ServiceCatalog Export] Rows with image URL:', services.filter(s => s.service_image).length, 'of', services.length);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `service_catalog_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

function splitCsvIntoRows(text) {
  // Normalize line endings, then split respecting quoted newlines
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let current = '';
  let inQuotes = false;
  for (const char of normalized) {
    if (inQuotes) {
      current += char;
      if (char === '"') inQuotes = false;
    } else if (char === '"') {
      inQuotes = true;
      current += char;
    } else if (char === '\n') {
      rows.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current) rows.push(current);
  return rows.filter(r => r.trim().length > 0);
}

function parseValue(col, raw) {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  if (col === 'is_active') return trimmed.toLowerCase() === 'true';
  if (col === 'materials_required' || col === 'allow_labor_adjustment') return trimmed.toLowerCase() === 'true';
  if (['estimated_time_hours', 'estimated_time_minutes', 'default_selling_price',
    'default_labor_hours', 'minimum_labor_hours', 'maximum_labor_hours',
    'service_commission_value', 'material_commission_value', 'sort_order'].includes(col)) {
    const num = Number(trimmed);
    return isNaN(num) ? 0 : num;
  }
  return trimmed;
}

function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed === '') return false;
  return /^https?:\/\/.+/i.test(trimmed);
}

/**
 * Checks if a value is a relative storage path (not a full URL, not empty).
 * e.g. "Images/Service/8021b35b-...png"
 */
function isRelativeStoragePath(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  return !isValidImageUrl(trimmed);
}

/**
 * Resolves a relative storage path to a public media URL using the app's
 * storage namespace, matching the format produced by UploadFile.
 * Full URLs are returned as-is.
 */
function resolveToPublicUrl(value) {
  if (!value || typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '' || isValidImageUrl(trimmed)) return trimmed;
  const appId = appParams?.appId;
  if (!appId) {
    console.warn('[ServiceCatalog Import] Cannot resolve relative path — appId unavailable:', trimmed);
    return trimmed;
  }
  const resolved = `https://media.base44.com/images/public/${appId}/${trimmed}`;
  console.log('[ServiceCatalog Import] Resolved relative path to public URL:', { original: trimmed, resolved });
  return resolved;
}

/**
 * Parse CSV text into service catalog records.
 * @param {string} csvText
 * @returns {Array} parsed rows as partial service objects keyed by column header
 */
export function parseServicesCsv(csvText) {
  const rows = splitCsvIntoRows(csvText);
  if (rows.length === 0) return [];

  const headers = parseCsvLine(rows[0]).map(h => h.trim());
  const dataRows = rows.slice(1);

  return dataRows.map(row => {
    const cells = parseCsvLine(row);
    const obj = {};
    headers.forEach((col, i) => {
      obj[col] = parseValue(col, cells[i]);
    });
    return obj;
  });
}

/**
 * Build the update payload for a single imported row, matched to an existing service.
 * Blank service_image cells are skipped unless clearBlanks is true.
 *
 * @param {object} existing - existing ServiceCatalog record (or null for new)
 * @param {object} importedRow - parsed CSV row
 * @param {boolean} clearBlanks - if true, blank fields overwrite existing values
 * @returns {object|null} fields to update, or null if nothing to apply
 */
export function buildImportUpdate(existing, importedRow, clearBlanks) {
  const update = {};

  for (const col of EXPORT_COLUMNS) {
    if (!(col in importedRow)) continue;
    const raw = importedRow[col];

    if (col === 'service_image') {
      if (isValidImageUrl(raw)) {
        update.service_image = raw.trim();
      } else if (isRelativeStoragePath(raw)) {
        // Relative storage path — resolve to public URL so it matches manual upload format
        const resolved = resolveToPublicUrl(raw);
        if (isValidImageUrl(resolved)) {
          update.service_image = resolved;
        }
      } else if (clearBlanks && raw === '') {
        update.service_image = '';
      }
      // blank without clearBlanks → skip (preserve existing)
      continue;
    }

    if (raw === '') {
      if (clearBlanks) {
        update[col] = typeof existing?.[col] === 'boolean' ? false
          : typeof existing?.[col] === 'number' ? 0 : '';
      }
      continue;
    }

    update[col] = raw;
  }

  // Ensure required fields have values
  if (!update.service_name && !existing?.service_name) return null;

  return Object.keys(update).length > 0 ? update : null;
}

/**
 * Match an imported row to an existing service by service_code (preferred) or service_name.
 */
export function findMatchingService(existingServices, row) {
  if (row.service_code) {
    const byCode = existingServices.find(s =>
      s.service_code && s.service_code.toLowerCase() === row.service_code.toLowerCase()
    );
    if (byCode) return byCode;
  }
  if (row.service_name) {
    const byName = existingServices.find(s =>
      s.service_name && s.service_name.toLowerCase() === row.service_name.toLowerCase()
    );
    if (byName) return byName;
  }
  return null;
}