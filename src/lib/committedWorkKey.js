/**
 * Computes a stable committed-work key for overlap protection.
 *
 * A committed-work key uniquely identifies a single unit of repair work
 * that must not be sold twice across overlapping proposal options.
 *
 * Key = job_id + property_asset_id + inspection_finding_id
 *       + repair_recommendation_id + service_catalog_id
 *
 * All components are joined with '::'. Empty values are preserved as
 * empty strings to maintain key stability.
 */
export function computeCommittedWorkKey({
  jobId,
  propertyAssetId,
  inspectionFindingId,
  repairRecommendationId,
  serviceCatalogId,
}) {
  return [
    jobId || '',
    propertyAssetId || '',
    inspectionFindingId || '',
    repairRecommendationId || '',
    serviceCatalogId || '',
  ].join('::');
}

/**
 * Detects overlapping committed-work keys across a set of selected
 * proposal options / estimate groups.
 *
 * Returns an array of conflict objects, each containing:
 *   - key: the duplicated committed_work_key
 *   - sources: array of { group_id, group_name, option_id, option_title }
 *
 * If the array is empty, there are no overlaps.
 */
export function detectOverlaps(selectedOptions) {
  const keyMap = new Map();

  for (const opt of selectedOptions) {
    const keys = opt.committed_work_keys || [];
    for (const key of keys) {
      if (!key) continue;
      if (!keyMap.has(key)) {
        keyMap.set(key, []);
      }
      keyMap.get(key).push({
        group_id: opt.group_id || '',
        group_name: opt.group_name || '',
        option_id: opt.option_id || '',
        option_title: opt.option_title || '',
      });
    }
  }

  const conflicts = [];
  for (const [key, sources] of keyMap) {
    if (sources.length > 1) {
      conflicts.push({ key, sources });
    }
  }
  return conflicts;
}

/**
 * Returns a human-readable summary of a conflict for UI display.
 */
export function formatConflict(conflict) {
  if (!conflict || conflict.sources.length < 2) return '';
  const names = conflict.sources.map(s => s.group_name || s.option_title).filter(Boolean);
  return `Duplicate work detected across: ${names.join(' vs ')}`;
}