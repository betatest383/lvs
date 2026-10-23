// Column definitions for material CSV import/export
export const MATERIAL_COLUMNS = [
  { field: 'inv_id', header: 'INV ID', type: 'string' },
  { field: 'sku', header: 'SKU', type: 'string' },
  { field: 'item_name', header: 'Item Name', type: 'string', required: true },
  { field: 'description', header: 'Description', type: 'string' },
  { field: 'category', header: 'Category', type: 'string' },
  { field: 'manufacturer', header: 'Manufacturer', type: 'string' },
  { field: 'vendor', header: 'Vendor', type: 'string' },
  { field: 'vendor_part_number', header: 'Vendor Part Number', type: 'string' },
  { field: 'unit', header: 'Unit of Measure', type: 'string' },
  { field: 'unit_cost', header: 'Unit Cost', type: 'number' },
  { field: 'msrp', header: 'MSRP', type: 'number' },
  { field: 'selling_price', header: 'Selling Price', type: 'number' },
  { field: 'primary_location', header: 'Primary Location', type: 'string' },
  { field: 'minimum_stock', header: 'Minimum Stock', type: 'number' },
  { field: 'reorder_quantity', header: 'Reorder Quantity', type: 'number' },
  { field: 'opening_quantity', header: 'Opening Quantity', type: 'number' },
  { field: 'image_url', header: 'Image URL', type: 'string' },
  { field: 'active_status', header: 'Active Status', type: 'string' },
];

const NUMERIC_FIELDS = MATERIAL_COLUMNS.filter(c => c.type === 'number').map(c => c.field);

/**
 * Parse CSV text into { headers, rows }.
 * Handles quoted fields, embedded commas, and embedded newlines.
 */
export function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else if (char === '\r') {
        // skip
      } else {
        currentField += char;
      }
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  while (rows.length > 0 && rows[rows.length - 1].every(f => f.trim() === '')) {
    rows.pop();
  }
  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (row[i] || '').trim(); });
    return obj;
  });

  return { headers, rows: dataRows };
}

function escapeCSVValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCSV(rows, headers) {
  const headerLine = headers.map(escapeCSVValue).join(',');
  const dataLines = rows.map(row =>
    headers.map(h => escapeCSVValue(row[h])).join(',')
  );
  return [headerLine, ...dataLines].join('\n');
}

export function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function generateTemplateCSV() {
  const headers = MATERIAL_COLUMNS.map(c => c.header);
  const exampleRow = {
    'INV ID': 'INV-000001',
    'SKU': 'MAT-000001',
    'Item Name': 'Chimney Cap 13"x13"',
    'Description': 'Stainless steel chimney cap',
    'Category': 'Chimney Caps',
    'Manufacturer': 'Hy-C',
    'Vendor': 'SupplyHouse',
    'Vendor Part Number': 'HC-1313',
    'Unit of Measure': 'ea',
    'Unit Cost': '45.00',
    'MSRP': '89.99',
    'Selling Price': '125.00',
    'Primary Location': 'Main Warehouse',
    'Minimum Stock': '5',
    'Reorder Quantity': '10',
    'Opening Quantity': '20',
    'Image URL': 'https://example.com/cap.jpg',
    'Active Status': 'Yes',
  };
  return toCSV([exampleRow], headers);
}

export function generateExportCSV(items) {
  const headers = MATERIAL_COLUMNS.map(c => c.header);
  const rows = items.map(item => ({
    'INV ID': item.inventory_id || '',
    'SKU': item.sku || '',
    'Item Name': item.item_name || '',
    'Description': item.description || '',
    'Category': item.category || '',
    'Manufacturer': item.manufacturer || '',
    'Vendor': item.vendor || '',
    'Vendor Part Number': item.vendor_sku || '',
    'Unit of Measure': item.unit || '',
    'Unit Cost': item.unit_cost || 0,
    'MSRP': item.msrp || 0,
    'Selling Price': item.selling_price || 0,
    'Primary Location': item.warehouse_location || '',
    'Minimum Stock': item.minimum_stock || 0,
    'Reorder Quantity': item.reorder_quantity || 0,
    'Opening Quantity': '',
    'Image URL': item.image_url || '',
    'Active Status': item.is_active ? 'Yes' : 'No',
  }));
  return toCSV(rows, headers);
}

/**
 * Auto-match spreadsheet column headers to database fields by similarity.
 */
export function autoMatchColumns(headers) {
  const mapping = {};
  for (const col of MATERIAL_COLUMNS) {
    const headerLower = col.header.toLowerCase();
    const fieldLower = col.field.toLowerCase();
    let bestMatch = '';
    let bestScore = 0;
    for (const h of headers) {
      const hLower = h.toLowerCase().replace(/[^a-z0-9]/g, '');
      const targetLower = headerLower.replace(/[^a-z0-9]/g, '');
      if (hLower === targetLower) { bestMatch = h; break; }
      if (hLower.includes(targetLower) || targetLower.includes(hLower)) {
        const score = Math.min(hLower.length, targetLower.length);
        if (score > bestScore) { bestMatch = h; bestScore = score; }
      }
      if (fieldLower.replace(/[^a-z0-9]/g, '') === hLower) { bestMatch = h; break; }
    }
    mapping[col.field] = bestMatch || '';
  }
  return mapping;
}

/**
 * Validate a single mapped row.
 * Returns { status: 'valid'|'warning'|'rejected', errors: [], warnings: [] }
 */
export function validateRow(mappedRow, existingSKUs, rowIndex) {
  const errors = [];
  const warnings = [];

  // Required: Item Name
  if (!mappedRow.item_name) {
    errors.push('Item Name is required');
  }

  // Duplicate SKU within file
  if (mappedRow.sku) {
    const skuLower = mappedRow.sku.toLowerCase();
    const firstOccurrence = existingSKUs.findIndex(s => s.toLowerCase() === skuLower);
    if (firstOccurrence !== -1 && firstOccurrence < rowIndex) {
      warnings.push('Duplicate SKU within file');
    }
  }

  // Numeric validation
  for (const field of NUMERIC_FIELDS) {
    const val = mappedRow[field];
    if (val !== '' && val !== undefined && val !== null) {
      const num = Number(val);
      if (isNaN(num)) {
        errors.push(`${field} must be a number (got "${val}")`);
      } else if (num < 0) {
        warnings.push(`${field} is negative`);
      }
    }
  }

  // Active status normalization
  if (mappedRow.active_status) {
    const s = String(mappedRow.active_status).toLowerCase().trim();
    if (!['yes', 'no', 'true', 'false', 'active', 'inactive', '1', '0', ''].includes(s)) {
      warnings.push(`Unknown Active Status "${mappedRow.active_status}" — will default to Active`);
    }
  }

  let status = 'valid';
  if (errors.length > 0) status = 'rejected';
  else if (warnings.length > 0) status = 'warning';

  return { status, errors, warnings };
}

/**
 * Normalize a mapped row into the format expected by the import backend function.
 */
export function normalizeRow(mappedRow) {
  const parseNum = (val) => {
    if (val === '' || val === undefined || val === null) return 0;
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  };

  const activeRaw = String(mappedRow.active_status || '').toLowerCase().trim();
  const isActive = !['no', 'false', 'inactive', '0'].includes(activeRaw);

  return {
    inv_id: mappedRow.inv_id || '',
    sku: mappedRow.sku || '',
    item_name: mappedRow.item_name || '',
    description: mappedRow.description || '',
    category: mappedRow.category || '',
    manufacturer: mappedRow.manufacturer || '',
    vendor: mappedRow.vendor || '',
    vendor_part_number: mappedRow.vendor_part_number || '',
    unit: mappedRow.unit || 'ea',
    unit_cost: parseNum(mappedRow.unit_cost),
    msrp: parseNum(mappedRow.msrp),
    selling_price: parseNum(mappedRow.selling_price),
    primary_location: mappedRow.primary_location || '',
    minimum_stock: parseNum(mappedRow.minimum_stock),
    reorder_quantity: parseNum(mappedRow.reorder_quantity),
    opening_quantity: parseNum(mappedRow.opening_quantity),
    image_url: mappedRow.image_url || '',
    is_active: isActive,
  };
}

export function generateErrorReportCSV(rows) {
  const headers = ['Row', 'SKU', 'Item Name', 'Status', 'Issues'];
  const data = rows.map(r => ({
    Row: r.rowNumber,
    SKU: r.sku || '',
    'Item Name': r.item_name || '',
    Status: r.status,
    Issues: [...(r.errors || []), ...(r.warnings || [])].join('; '),
  }));
  return toCSV(data, headers);
}