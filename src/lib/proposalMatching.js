/**
 * Proposal matching helpers.
 *
 * ProposalOptionTemplates may store services in many shapes:
 *   - ID string
 *   - service object { service_catalog_id, service_name, ... }
 *   - JSON string (array or single object)
 *   - array of objects
 *   - array of IDs
 *   - fields: included_services, optional_services, recommended_service_catalog_id,
 *     recommended_service_name
 *
 * DraftEstimateItems may store the selected service as:
 *   - service_catalog_id
 *   - service_id
 *   - selected_service
 *   - service_name
 *   - title
 */

/**
 * Normalize a string for comparison: trim, lowercase, collapse spaces.
 */
function normalizeStr(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Extract a service reference object from a single value.
 * Returns { id, name } or null.
 *
 * Accepts:
 *   - string ID
 *   - object with service_catalog_id / id / service_id / recommended_service_catalog_id
 *   - object with service_name / name / recommended_service_name
 */
function extractServiceRef(value) {
  if (value === null || value === undefined) return null;

  // Plain string — treat as an ID
  if (typeof value === 'string') {
    const parsed = tryParseJson(value);
    if (parsed !== undefined) return extractServiceRef(parsed);
    const trimmed = value.trim();
    if (!trimmed) return null;
    return { id: trimmed, name: '' };
  }

  if (typeof value === 'number') {
    return { id: String(value), name: '' };
  }

  if (typeof value === 'object') {
    const id =
      value.service_catalog_id ||
      value.id ||
      value.service_id ||
      value.recommended_service_catalog_id ||
      value.recommended_service_id ||
      null;
    const name =
      value.service_name ||
      value.name ||
      value.recommended_service_name ||
      value.title ||
      '';
    if (!id && !name) return null;
    return { id: id ? String(id) : '', name: String(name || '') };
  }

  return null;
}

function tryParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return undefined;
  }
}

/**
 * normalizeServiceRefs(value)
 *
 * Returns an array of { id, name } service references extracted from:
 *   - ID string
 *   - service object
 *   - JSON string
 *   - array of objects
 *   - array of IDs
 */
export function normalizeServiceRefs(value) {
  if (value === null || value === undefined) return [];

  // JSON string — parse then recurse
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    const parsed = tryParseJson(trimmed);
    if (parsed !== undefined) return normalizeServiceRefs(parsed);
    // Non-JSON string — treat as single ID ref
    const ref = extractServiceRef(trimmed);
    return ref ? [ref] : [];
  }

  if (Array.isArray(value)) {
    return value
      .map(v => normalizeServiceRefs(v))
      .flat()
      .filter(r => r && (r.id || r.name));
  }

  // Single object or primitive
  const ref = extractServiceRef(value);
  return ref ? [ref] : [];
}

/**
 * Collect all service refs from a ProposalOptionTemplate.
 * Gathers from included_services, optional_services, recommended_service_catalog_id,
 * recommended_service_name, and recommended_service.
 */
export function collectTemplateServiceRefs(template) {
  if (!template || typeof template !== 'object') return [];
  const refs = [];

  const fields = [
    'included_services',
    'optional_services',
    'recommended_service',
    'recommended_service_catalog_id',
    'recommended_service_name',
  ];

  for (const field of fields) {
    const val = template[field];
    if (val !== null && val !== undefined && val !== '') {
      refs.push(...normalizeServiceRefs(val));
    }
  }

  // Deduplicate by id+name
  const seen = new Set();
  return refs.filter(r => {
    const key = `${r.id}||${r.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * serviceMatchesEstimateItem(proposalServiceRef, estimateItem)
 *
 * Returns true when the proposal option service matches the estimate item
 * by ID or normalized name.
 *
 * Priority:
 *   1. Proposal service ID equals DraftEstimateItem service_catalog_id
 *   2. Proposal service ID equals DraftEstimateItem service_id
 *   3. Proposal service name equals DraftEstimateItem service_name
 *   4. Proposal service name equals DraftEstimateItem.title
 *   5. Recommended service equals DraftEstimateItem service_catalog_id or service_name
 */
export function serviceMatchesEstimateItem(proposalServiceRef, estimateItem) {
  if (!proposalServiceRef || !estimateItem) return false;

  const refId = proposalServiceRef.id ? String(proposalServiceRef.id) : '';
  const refName = normalizeStr(proposalServiceRef.name);

  const itemId = estimateItem.service_catalog_id ? String(estimateItem.service_catalog_id) : '';
  const itemServiceId = estimateItem.service_id ? String(estimateItem.service_id) : '';
  const itemSelectedService = estimateItem.selected_service ? String(estimateItem.selected_service) : '';
  const itemName = normalizeStr(estimateItem.service_name);
  const itemTitle = normalizeStr(estimateItem.title);

  // 1. ID matches service_catalog_id
  if (refId && itemId && refId === itemId) return true;

  // 2. ID matches service_id
  if (refId && itemServiceId && refId === itemServiceId) return true;

  // 2b. ID matches selected_service
  if (refId && itemSelectedService && refId === itemSelectedService) return true;

  // 3. Name matches service_name
  if (refName && itemName && refName === itemName) return true;

  // 4. Name matches title
  if (refName && itemTitle && refName === itemTitle) return true;

  // 5. Fallback: if ref has only a name, also check against service_catalog_id (rare)
  //    or if ref has only an id, check against service_name normalized
  if (refId && !refName && itemName && refId === itemName) return true;
  if (refName && !refId && itemId && refName === normalizeStr(itemId)) return true;

  return false;
}

/**
 * Match all template service refs against a list of estimate items.
 * Returns { matched: [{ ref, item }], unmatched: [{ ref }] }.
 */
export function matchTemplateToEstimateItems(serviceRefs, estimateItems) {
  const refs = Array.isArray(serviceRefs) ? serviceRefs : [];
  const items = Array.isArray(estimateItems) ? estimateItems : [];

  const matched = [];
  const matchedItemIds = new Set();
  const unmatched = [];

  for (const ref of refs) {
    const matchingItem = items.find(item => !matchedItemIds.has(item.id) && serviceMatchesEstimateItem(ref, item));
    if (matchingItem) {
      matched.push({ ref, item: matchingItem });
      matchedItemIds.add(matchingItem.id);
    } else {
      unmatched.push({ ref });
    }
  }

  return { matched, unmatched };
}

/**
 * Build a diagnostic object for admin display.
 */
export function buildPackageDiagnostics(template, serviceRefs, estimateItems, matchResult) {
  return {
    templateId: template?.id || '—',
    proposalLevel: template?.proposal_level || '—',
    rawIncludedServices: template?.included_services || '—',
    rawOptionalServices: template?.optional_services || '—',
    recommendedServiceCatalogId: template?.recommended_service_catalog_id || '—',
    normalizedServiceRefs: serviceRefs.map(r => ({ id: r.id || '—', name: r.name || '—' })),
    estimateItemServiceCatalogIds: estimateItems.map(i => i.service_catalog_id || '—'),
    estimateItemServiceNames: estimateItems.map(i => i.service_name || i.title || '—'),
    matchResults: [
      ...matchResult.matched.map(m => ({
        refId: m.ref.id || '—',
        refName: m.ref.name || '—',
        matchedItemId: m.item.id,
        matchedItemName: m.item.service_name || m.item.title || '—',
        matched: true,
      })),
      ...matchResult.unmatched.map(m => ({
        refId: m.ref.id || '—',
        refName: m.ref.name || '—',
        matchedItemId: null,
        matchedItemName: null,
        matched: false,
      })),
    ],
    finalItemCount: matchResult.matched.length,
  };
}

export { normalizeStr };