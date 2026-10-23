/**
 * Pricing Modifier Engine — trigger evaluation and adjustment calculation.
 * Used by the Modifier Simulator and the future Pricing stage engine.
 */

export function evaluateTrigger(modifier, scopeValues) {
  if (!modifier.operator || modifier.operator === 'always') return true;
  if (!modifier.source_field) return false;

  const fieldValue = scopeValues[modifier.source_field];
  if (fieldValue === undefined || fieldValue === null || fieldValue === '') return false;

  const triggerValue = modifier.trigger_value;
  const operator = modifier.operator;

  switch (operator) {
    case 'equals':
      return String(fieldValue).toLowerCase() === String(triggerValue).toLowerCase();
    case 'does_not_equal':
      return String(fieldValue).toLowerCase() !== String(triggerValue).toLowerCase();
    case 'greater_than':
    case 'quantity_greater_than':
      return parseFloat(fieldValue) > parseFloat(triggerValue);
    case 'greater_than_or_equal':
      return parseFloat(fieldValue) >= parseFloat(triggerValue);
    case 'less_than':
      return parseFloat(fieldValue) < parseFloat(triggerValue);
    case 'less_than_or_equal':
      return parseFloat(fieldValue) <= parseFloat(triggerValue);
    case 'between':
      return parseFloat(fieldValue) >= parseFloat(triggerValue)
        && parseFloat(fieldValue) <= parseFloat(modifier.secondary_trigger_value);
    case 'contains':
      return String(fieldValue).toLowerCase().includes(String(triggerValue).toLowerCase());
    case 'selected':
      if (Array.isArray(fieldValue)) return fieldValue.includes(triggerValue);
      return Boolean(fieldValue);
    default:
      return false;
  }
}

export function calculateAdjustment(modifier, baseAmounts) {
  const method = modifier.calculation_method;
  const base = baseAmounts[modifier.applies_to] || 0;

  let adjustment = 0;
  let newPrice = base;
  let formula = '';

  switch (method) {
    case 'fixed_amount':
      adjustment = modifier.modifier_value || 0;
      newPrice = base + adjustment;
      formula = `+ $${adjustment.toFixed(2)}`;
      break;
    case 'percentage':
      adjustment = base * ((modifier.percentage_value || 0) / 100);
      newPrice = base + adjustment;
      formula = `+ ${modifier.percentage_value}% of $${base.toFixed(2)}`;
      break;
    case 'multiplier':
      newPrice = base * (modifier.multiplier_value || 1);
      adjustment = newPrice - base;
      formula = `× ${modifier.multiplier_value}`;
      break;
    case 'hourly':
      adjustment = (modifier.hourly_rate || 0) * (baseAmounts.estimated_hours || 0);
      newPrice = base + adjustment;
      formula = `$${modifier.hourly_rate}/hr × ${baseAmounts.estimated_hours || 0} hrs`;
      break;
    case 'daily':
      adjustment = (modifier.daily_rate || 0) * (baseAmounts.project_days || 0);
      newPrice = base + adjustment;
      formula = `$${modifier.daily_rate}/day × ${baseAmounts.project_days || 0} days`;
      break;
    case 'per_unit':
      adjustment = (modifier.unit_rate || 0) * (baseAmounts.unit_quantity || 1);
      newPrice = base + adjustment;
      formula = `$${modifier.unit_rate}/unit × ${baseAmounts.unit_quantity || 1} units`;
      break;
    case 'cost_plus_markup':
      adjustment = base * ((modifier.markup_percentage || 0) / 100);
      newPrice = base + adjustment;
      formula = `+ ${modifier.markup_percentage}% markup on $${base.toFixed(2)}`;
      break;
    case 'replace_price':
      newPrice = modifier.modifier_value || 0;
      adjustment = newPrice - base;
      formula = `Replace with $${newPrice.toFixed(2)}`;
      break;
    case 'minimum_charge':
      newPrice = Math.max(base, modifier.minimum_amount || 0);
      adjustment = newPrice - base;
      formula = `Min $${modifier.minimum_amount}`;
      break;
    case 'maximum_charge':
      newPrice = Math.min(base, modifier.maximum_amount || 0);
      adjustment = newPrice - base;
      formula = `Max $${modifier.maximum_amount}`;
      break;
    default:
      formula = 'Unknown calculation method';
  }

  return { adjustment, newPrice, formula, baseAmount: base };
}

export function computeScopeHash(scopeValues) {
  const keys = [
    'scope.project_days', 'scope.estimated_hours',
    'scope.lead_technician_quantity', 'scope.apprentice_quantity', 'scope.mason_quantity',
    'scope.scaffold_required', 'scope.lift_required', 'scope.additional_vehicle_required',
    'scope.roof_pitch', 'scope.story_count', 'scope.access_condition',
    'scope.job_conditions', 'scope.staging_sequence',
  ];
  const str = keys.map(k => `${k}=${scopeValues[k] || ''}`).join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return String(hash);
}

export function buildTriggerSummary(modifier) {
  if (!modifier.operator) return 'No trigger configured';
  if (modifier.operator === 'always') return 'Always applies';
  const field = modifier.source_field || '?';
  const op = modifier.operator.replace(/_/g, ' ');
  const val = modifier.trigger_value || '';
  const sec = modifier.secondary_trigger_value;
  if (modifier.operator === 'between' && sec) {
    return `${field} between ${val} and ${sec}`;
  }
  return `${field} ${op} ${val}`;
}

export function buildCalculationSummary(modifier) {
  const method = modifier.calculation_method;
  if (!method) return 'No calculation configured';
  switch (method) {
    case 'fixed_amount': return `+$${modifier.modifier_value || 0}`;
    case 'percentage': return `+${modifier.percentage_value || 0}%`;
    case 'multiplier': return `×${modifier.multiplier_value || 1}`;
    case 'hourly': return `$${modifier.hourly_rate || 0}/hr`;
    case 'daily': return `$${modifier.daily_rate || 0}/day`;
    case 'per_unit': return `$${modifier.unit_rate || 0}/unit`;
    case 'cost_plus_markup': return `+${modifier.markup_percentage || 0}% markup`;
    case 'replace_price': return `=$${modifier.modifier_value || 0}`;
    case 'minimum_charge': return `min $${modifier.minimum_amount || 0}`;
    case 'maximum_charge': return `max $${modifier.maximum_amount || 0}`;
    default: return method;
  }
}