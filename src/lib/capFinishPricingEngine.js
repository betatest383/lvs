/**
 * Cap Finish Pricing Resolver
 *
 * Resolves the additional powder-coat price for a cap product based on
 * the CapFinishPricing matrix. Evaluates by finish_type, cap_size_tier,
 * cap_style, and surface_area range.
 *
 * Highest-priority active match wins.
 */

/**
 * Determine the cap size tier from nominal dimensions.
 * @param {number} nominalLength
 * @param {number} nominalWidth
 * @returns {string} 'small' | 'medium' | 'large' | 'custom'
 */
export function deriveCapSizeTier(nominalLength, nominalWidth) {
  const maxDim = Math.max(nominalLength || 0, nominalWidth || 0);
  if (maxDim === 0) return 'custom';
  if (maxDim <= 13) return 'small';
  if (maxDim <= 24) return 'medium';
  if (maxDim <= 48) return 'large';
  return 'custom';
}

/**
 * Calculate approximate cap surface area from nominal dimensions.
 * @param {number} nominalLength
 * @param {number} nominalWidth
 * @param {number} nominalHeight
 * @returns {number} square inches
 */
export function estimateCapSurfaceArea(nominalLength, nominalWidth, nominalHeight) {
  const l = nominalLength || 0;
  const w = nominalWidth || 0;
  const h = nominalHeight || 0;
  // Top + 4 sides (approximate)
  return (l * w) + 2 * ((l * h) + (w * h));
}

/**
 * Resolve the finish pricing for a given cap product.
 *
 * @param {object} product - resolved cap product (from capResolverEngine)
 * @param {array} pricingEntries - CapFinishPricing records
 * @param {object} options - { finishTypeOverride }
 * @returns {{ matched: boolean, additionalPrice: number, entry: object|null, tier: string, surfaceArea: number }}
 */
export function resolveFinishPricing(product, pricingEntries, options = {}) {
  const finishType = options.finishTypeOverride || product.finish || 'powder_coated';
  const tier = deriveCapSizeTier(product.nominal_length, product.nominal_width);
  const surfaceArea = estimateCapSurfaceArea(product.nominal_length, product.nominal_width, product.nominal_height);

  const eligible = (pricingEntries || [])
    .filter(e => e.is_active !== false && e.finish_type === finishType)
    .filter(e => !e.cap_size_tier || e.cap_size_tier === tier)
    .filter(e => !e.cap_style || e.cap_style === product.cap_style)
    .filter(e => {
      if (e.surface_area_min != null && surfaceArea < e.surface_area_min) return false;
      if (e.surface_area_max != null && surfaceArea > e.surface_area_max) return false;
      return true;
    })
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const entry = eligible[0] || null;
  return {
    matched: !!entry,
    additionalPrice: entry ? (entry.additional_price || 0) : 0,
    entry,
    tier,
    surfaceArea,
  };
}

/**
 * Build a finish configuration object for persistence with the proposal/scope.
 *
 * @param {object} product - resolved cap product
 * @param {object} color - CapFinishColor record selected by the technician
 * @param {array} pricingEntries - CapFinishPricing records
 * @returns {object} finish configuration snapshot
 */
export function buildFinishConfiguration(product, color, pricingEntries) {
  const pricing = resolveFinishPricing(product, pricingEntries);
  const colorAdditionalCost = color?.additional_cost || 0;
  return {
    finish_type: product.finish,
    finish_material_id: product.finish_material_id || null,
    finish_service_id: product.finish_service_id || null,
    base_material_id: product.material_id || null,
    base_material_sku: product.material_sku || null,
    selected_color: color ? {
      id: color.id,
      display_name: color.display_name,
      manufacturer_color_code: color.manufacturer_color_code || '',
      color_family: color.color_family || '',
      hex_value: color.hex_value || '',
      additional_cost: colorAdditionalCost,
      lead_time_adjustment_days: color.lead_time_adjustment_days || 0,
    } : null,
    pricing_tier: pricing.tier,
    surface_area_estimate: pricing.surfaceArea,
    finish_pricing_entry_id: pricing.entry?.id || null,
    finish_additional_price: pricing.additionalPrice,
    color_additional_cost: colorAdditionalCost,
    total_finish_upcharge: pricing.additionalPrice + colorAdditionalCost,
    matched: pricing.matched,
  };
}