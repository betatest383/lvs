/**
 * Estimate Package Workflow — Feature Flag, Resolver, and Compatibility Layer
 *
 * This module implements the controlled migration from the legacy estimate workflow
 * to the v2 Estimate Package workflow. It is backward-compatible: when the feature
 * flag is false (default), the current live workflow is untouched.
 *
 * === Architecture — Layer Separation ===
 *
 *   Inspection Findings     → "What did we find?" (observations only)
 *     ↓
 *   Repair Recommendations  → "What should be repaired?" (recommendations only, no pricing)
 *     ↓
 *   Estimate Items          → "What services solve those recommendations?" (DraftEstimateItem)
 *     ↓                        Each recommendation may produce 1..N estimate items.
 *                             Only selected items enter a package.
 *   Estimate Package        → "Which services are we offering together?" (Good/Better/Best)
 *     ↓                        Built from Estimate Items, NOT from recommendations.
 *   Scope of Work           → "How will we execute this package?" (aggregates all items)
 *     ↓
 *   Dynamic Pricing         → "What should this package cost?" (whole-package pricing)
 *     ↓
 *   Proposal Builder        → "How should this package be presented?"
 *     ↓
 *   Customer Presentation   → Customer selects accepted package
 *     ↓
 *   Execution Plan          → "How will we perform the accepted package?"
 *
 * === Key Relationship Rules ===
 *
 *   - EstimatePackage.estimate_item_ids is the authoritative relationship.
 *   - EstimatePackageItem.estimate_item_id is the authoritative link (required).
 *   - repair_recommendation_id on EstimatePackageItem is traceability only.
 *   - Scope of Work aggregates ALL Estimate Items within a package — describes
 *     how to execute the complete package, not individual recommendations.
 *   - Dynamic Pricing operates on the complete package: material cost +
 *     combined labor + crew + equipment + shared mobilization savings +
 *     special conditions + overhead + profit optimization.
 *   - Shared labor optimization (scaffold, mobilization, cleanup, roof setup,
 *     crew) is determined by the Scope of Work BEFORE pricing.
 *
 * === Future: Solution Group (NOT IMPLEMENTED) ===
 *
 *   Reserved for a future entity that allows reusable collections of Estimate Items
 *   (e.g. Interior Repair Group, Exterior Repair Group, Complete Restoration Group,
 *   Good/Better/Best, Membership Upgrade). These groups can later be combined into
 *   Estimate Packages. This is Version 2 functionality and should not be built now.
 *
 * Phases:
 *   Phase 1 — Data model (EstimatePackage, EstimatePackageItem, ScopeOfWork v2 fields)
 *   Phase 2 — Compatibility layer (resolveAuthoritativeScopeOfWork)
 *   Phase 3 — Feature flag gate (USE_ESTIMATE_PACKAGE_WORKFLOW)
 *
 * Rollback: set USE_ESTIMATE_PACKAGE_WORKFLOW = false and the app immediately
 * returns to the legacy workflow with no data loss.
 */

import { base44 } from '@/api/base44Client';

// ---------------------------------------------------------------------------
// Phase 3 — Feature Flag
// ---------------------------------------------------------------------------

/**
 * Master feature flag for the Estimate Package workflow.
 * Default: true — the v2 package workflow is the default for all new jobs.
 *
 * Set to false to globally roll back to the legacy workflow (emergency only).
 */
export const USE_ESTIMATE_PACKAGE_WORKFLOW = true;

/**
 * Job IDs explicitly enabled for the v2 workflow during Phase 4 testing.
 * Retained for backward compatibility — no longer the primary gating mechanism.
 * The v2 workflow is now the default for all new jobs.
 * @deprecated — v2 is now the default; this list is kept only for reference.
 */
export const ESTIMATE_PACKAGE_WORKFLOW_TEST_JOB_IDS = [
  '6a4bd32948c6ad99119d97b2',
];

/**
 * Determines whether the v2 Estimate Package workflow should be used
 * for a given appointment workflow record.
 *
 * Resolution order:
 *   1. Global flag is false → legacy (rollback mode)
 *   2. workflow.workflow_version === 'v2_package' → v2
 *   3. workflow.workflow_version === 'legacy' → legacy
 *   4. workflow_version is unset → legacy (existing record from before cutover)
 *
 * New workflow records are created with workflow_version = 'v2_package'.
 *
 * @param {object} workflow - The AppointmentWorkflow record (must include workflow_version)
 */
export function isEstimatePackageWorkflowEnabled(workflow) {
  if (!USE_ESTIMATE_PACKAGE_WORKFLOW) return false;

  if (workflow?.workflow_version === 'v2_package') return true;
  if (workflow?.workflow_version === 'legacy') return false;

  // workflow_version is unset — existing record created before the v2 cutover.
  // Default to legacy to preserve backward compatibility for in-flight jobs.
  return false;
}

// ---------------------------------------------------------------------------
// Shared Workflow Initialization — single entry point for all creation paths
// ---------------------------------------------------------------------------

/**
 * Builds the initial AppointmentWorkflow data object for a new job.
 * Every new eligible field-service job MUST use this function to initialize
 * its workflow record, ensuring consistent v2_package defaults and clean
 * stage state across all creation paths (UI, webhook, import, etc.).
 *
 * The caller is responsible for the actual .create() call — this is a pure
 * factory so it works in both frontend (user-scoped) and backend
 * (service-role) contexts.
 *
 * @param {object} params
 * @param {string} params.job_id           - Required. Links to Job record.
 * @param {string} [params.appointment_id] - Optional. Links to Appointment.
 * @param {string} [params.workflow_version] - Default 'v2_package'.
 * @param {string[]} [params.setupModules]  - Default ['interior','exterior'].
 * @param {boolean} [params.setupComplete]   - Default false.
 * @returns {object} AppointmentWorkflow create payload
 */
export function initializeAppointmentWorkflow({
  job_id,
  appointment_id,
  workflow_version = 'v2_package',
  setupModules,
  setupComplete = false,
}) {
  const modules = setupModules && setupModules.length > 0
    ? setupModules
    : ['interior', 'exterior'];

  return {
    job_id,
    appointment_id: appointment_id || null,
    workflow_version,
    stage_states: JSON.stringify({
      inspection_setup: { status: setupComplete ? 'completed' : 'available' },
    }),
    module_assignments: JSON.stringify({}),
    conflict_locks: JSON.stringify({}),
    review_decisions: JSON.stringify({}),
    crew_members: JSON.stringify([]),
    selected_modules: JSON.stringify(modules),
    customer_decision: 'pending',
    overall_progress: 0,
  };
}

// ---------------------------------------------------------------------------
// Phase 2 — Compatibility Layer: Authoritative Scope of Work Resolver
// ---------------------------------------------------------------------------

export const SCOPE_SOURCE_TYPES = {
  ESTIMATE_PACKAGE: 'estimate_package',
  LEGACY_BUILDER: 'legacy_builder',
  LEGACY_ESTIMATE: 'legacy_estimate',
  RECOMMENDATION_LEVEL: 'recommendation_level',
  MANUAL: 'manual',
};

/**
 * Resolves the authoritative Scope of Work for a given context.
 *
 * Resolution order (never silently selects a duplicate):
 *   1. Scope linked directly to estimate_package_id (is_authoritative=true)
 *   2. Current builder scope linked to the same job/appointment (v2 or legacy)
 *   3. Legacy scope fallback (is_legacy=true, not superseded)
 *   4. No scope found
 *
 * @param {object} params - { job_id, appointment_id?, estimate_package_id? }
 * @returns {Promise<object>} { scope, source_type, selection_reason, records_found, is_resolved }
 */
export async function resolveAuthoritativeScopeOfWork({ job_id, appointment_id, estimate_package_id }) {
  const log = {
    job_id,
    appointment_id,
    estimate_package_id,
    records_found: 0,
    selected_record_id: null,
    source_type: null,
    selection_reason: null,
    is_resolved: false,
  };

  if (!job_id && !estimate_package_id) {
    log.selection_reason = 'No job_id or estimate_package_id provided';
    console.warn('[ScopeResolver]', log);
    return { scope: null, ...log };
  }

  // Gather all candidate scope records for this job.
  // We query by job_id and then filter in-memory to cover all source types.
  let candidates = [];
  try {
    candidates = await base44.entities.ScopeOfWork.filter(
      { job_id },
      '-updated_date',
      50
    );
  } catch (err) {
    log.selection_reason = `Query failed: ${err.message}`;
    console.error('[ScopeResolver]', log);
    return { scope: null, ...log };
  }

  // Exclude superseded records
  candidates = candidates.filter(s => !s.superseded_by_id);
  log.records_found = candidates.length;

  // --- Priority 1: Scope linked directly to estimate_package_id ---
  if (estimate_package_id) {
    const packageScopes = candidates.filter(
      s => s.estimate_package_id === estimate_package_id
    );
    const authoritative = packageScopes.find(s => s.is_authoritative);

    if (authoritative) {
      log.selected_record_id = authoritative.id;
      log.source_type = authoritative.source_type || SCOPE_SOURCE_TYPES.ESTIMATE_PACKAGE;
      log.selection_reason = `Authoritative scope linked to estimate_package_id ${estimate_package_id}`;
      log.is_resolved = true;
      console.info('[ScopeResolver]', log);
      return { scope: authoritative, ...log };
    }

    if (packageScopes.length === 1) {
      log.selected_record_id = packageScopes[0].id;
      log.source_type = packageScopes[0].source_type || SCOPE_SOURCE_TYPES.ESTIMATE_PACKAGE;
      log.selection_reason = `Single scope linked to estimate_package_id ${estimate_package_id} (authoritative flag not set, auto-selected)`;
      log.is_resolved = true;
      console.info('[ScopeResolver]', log);
      return { scope: packageScopes[0], ...log };
    }

    if (packageScopes.length > 1) {
      // Multiple scopes for the same package — do NOT silently select.
      // Pick the one with the highest version, but flag the conflict.
      const sorted = [...packageScopes].sort((a, b) => (b.version || 0) - (a.version || 0));
      log.selected_record_id = sorted[0].id;
      log.source_type = sorted[0].source_type || SCOPE_SOURCE_TYPES.ESTIMATE_PACKAGE;
      log.selection_reason = `WARNING: ${packageScopes.length} scopes found for package ${estimate_package_id}. Selected highest version (${sorted[0].version}). Conflict requires admin resolution.`;
      log.is_resolved = true;
      log.has_conflict = true;
      console.warn('[ScopeResolver]', log);
      return { scope: sorted[0], ...log };
    }
  }

  // --- Priority 2: Current builder scope (v2 or legacy) linked to job/appointment ---
  const builderScopes = candidates.filter(s => {
    if (appointment_id && s.appointment_id === appointment_id) return true;
    return false;
  });

  if (builderScopes.length > 0) {
    const authoritative = builderScopes.find(s => s.is_authoritative);
    const selected = authoritative || builderScopes[0];
    log.selected_record_id = selected.id;
    log.source_type = selected.source_type || SCOPE_SOURCE_TYPES.LEGACY_BUILDER;
    log.selection_reason = authoritative
      ? `Authoritative builder scope for appointment ${appointment_id}`
      : `First builder scope for appointment ${appointment_id} (no authoritative flag)`;
    log.is_resolved = true;
    console.info('[ScopeResolver]', log);
    return { scope: selected, ...log };
  }

  // --- Priority 3: Legacy scope fallback (job-level, not superseded) ---
  const legacyScopes = candidates.filter(
    s => !s.estimate_package_id && (s.is_legacy !== false || s.workflow_version === 'legacy')
  );

  if (legacyScopes.length > 0) {
    // Prefer approved, then most recently updated
    const approved = legacyScopes.find(s => s.status === 'approved');
    const selected = approved || legacyScopes[0];
    log.selected_record_id = selected.id;
    log.source_type = selected.source_type || SCOPE_SOURCE_TYPES.LEGACY_BUILDER;
    log.selection_reason = `Legacy scope fallback (job-level, ${selected.status})`;
    log.is_resolved = true;
    log.is_legacy = true;
    console.info('[ScopeResolver]', log);
    return { scope: selected, ...log };
  }

  // --- Priority 4: No scope found ---
  log.selection_reason = 'No scope found for any resolution path';
  console.info('[ScopeResolver]', log);
  return { scope: null, ...log };
}

// ---------------------------------------------------------------------------
// Validation Safeguards
// ---------------------------------------------------------------------------

/**
 * Validates that there is at most one authoritative scope per package.
 * Returns { valid, conflicts[] }.
 */
export async function validateNoDuplicateAuthoritativeScopes(estimate_package_id) {
  if (!estimate_package_id) return { valid: true, conflicts: [] };

  const scopes = await base44.entities.ScopeOfWork.filter(
    { estimate_package_id, is_authoritative: true },
    '-updated_date',
    50
  );

  const conflicts = scopes.filter(s => !s.superseded_by_id);
  return { valid: conflicts.length <= 1, conflicts };
}

/**
 * Validates that a package has a scope before pricing can be locked.
 */
export function validatePackageHasScope(pkg) {
  if (!pkg) return { valid: false, reason: 'Package not provided' };
  if (!pkg.scope_of_work_id) {
    return { valid: false, reason: 'Package has no linked Scope of Work — pricing cannot be locked' };
  }
  return { valid: true };
}

/**
 * Validates that a proposal option references an estimate package (v2) or
 * is explicitly marked legacy.
 */
export function validateProposalOptionHasPackage(option) {
  if (!option) return { valid: false, reason: 'Option not provided' };
  if (option.estimate_package_id) return { valid: true };
  if (option.is_legacy || option.workflow_version === 'legacy') return { valid: true, reason: 'Legacy option — package not required' };
  return { valid: false, reason: 'Proposal option does not reference an Estimate Package' };
}

/**
 * Validates that an execution plan references an accepted package.
 */
export function validateExecutionPlanHasAcceptedPackage(executionPlan, acceptedPackage) {
  if (!executionPlan) return { valid: false, reason: 'Execution plan not provided' };
  if (!acceptedPackage) {
    return { valid: false, reason: 'Execution plan has no accepted Estimate Package' };
  }
  if (acceptedPackage.status !== 'accepted' && !acceptedPackage.is_selected) {
    return { valid: false, reason: `Execution plan references package with status '${acceptedPackage.status}' — must be accepted` };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Audit Recording — Package Lifecycle Events
// ---------------------------------------------------------------------------

export const PACKAGE_AUDIT_EVENTS = {
  PACKAGE_STALE: 'package_stale',
  PACKAGE_RECALCULATED: 'package_recalculated',
  PACKAGE_REVISED: 'package_revised',
  SCOPE_REPLACED: 'scope_replaced',
  PROPOSAL_REGENERATED: 'proposal_regenerated',
};

/**
 * Writes a rich audit record to JobActivityLog for a package lifecycle event.
 * NON-BLOCKING — failures are logged but never interrupt the calling flow.
 *
 * Audit record includes:
 *   package_id, package_version, job_id, appointment_id, user_id,
 *   previous_status, new_status, reason,
 *   related_item_id, related_scope_id, related_proposal_id, timestamp.
 *
 * @param {object} pkg - The EstimatePackage record
 * @param {string} eventType - One of PACKAGE_AUDIT_EVENTS
 * @param {string} label - Human-readable summary
 * @param {object} details - Additional context including:
 *   { previous_status, new_status, reason, related_item_id,
 *     related_scope_id, related_proposal_id, appointment_id, ...extra }
 */
export async function logPackageAuditEvent(pkg, eventType, label, details = {}) {
  if (!pkg || !pkg.id) return;

  // Extract structured audit fields from details
  const {
    previous_status,
    new_status,
    reason,
    related_item_id,
    related_scope_id,
    related_proposal_id,
    appointment_id,
    ...extraDetails
  } = details;

  // Fetch current user for audit trail (non-blocking — if it fails, still write the record)
  let userId = '';
  try {
    const user = await base44.auth.me();
    userId = user?.email || user?.id || '';
  } catch { /* ignore — still write audit without user_id */ }

  try {
    await base44.entities.JobActivityLog.create({
      job_id: pkg.job_id || '',
      event_type: eventType,
      event_label: label,
      performed_by: userId,
      event_details: JSON.stringify({
        package_id: pkg.id,
        package_version: pkg.package_version || 1,
        job_id: pkg.job_id || '',
        appointment_id: pkg.appointment_id || appointment_id || '',
        user_id: userId,
        previous_status: previous_status || null,
        new_status: new_status || null,
        reason: reason || '',
        related_item_id: related_item_id || null,
        related_scope_id: related_scope_id || null,
        related_proposal_id: related_proposal_id || null,
        // Backward-compat + extra context
        estimate_package_id: pkg.id,
        package_number: pkg.package_number || '',
        package_name: pkg.name || '',
        option_type: pkg.option_type || '',
        package_version: pkg.package_version || 1,
        pricing_status: pkg.pricing_status || '',
        ...extraDetails,
      }),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // Requirement 1: Audit logging must never block the user workflow.
    // Log the error and continue — the primary action has already succeeded.
    console.error('[PackageAudit] Failed to write audit record:', err);
  }
}

// ---------------------------------------------------------------------------
// Backend Validation — Server-Side Stale Enforcement
// ---------------------------------------------------------------------------

/**
 * Validates all authoritative packages for a job are ready for customer presentation.
 * Calls the backend validateEstimatePackage function for server-side enforcement.
 *
 * Checks (per package):
 *   - pricing_status is current (not stale/pending/not_started)
 *   - proposal_stale is false
 *   - is_authoritative is true
 *   - authoritative Scope of Work exists
 *   - package totals match live EstimatePackageItem records
 *
 * @param {string} jobId
 * @returns {Promise<object>} { valid, packages[] }
 */
export async function validatePackageForPresentation(jobId) {
  const response = await base44.functions.invoke('validateEstimatePackage', {
    job_id: jobId,
    check_totals: true,
  });
  return response.data;
}

/**
 * Validates a single package is ready for acceptance.
 * Blocks acceptance if the package became stale while the presentation was open.
 *
 * @param {string} packageId
 * @returns {Promise<object>} { valid, reasons[], packages[] }
 */
export async function validatePackageForAcceptance(packageId) {
  const response = await base44.functions.invoke('validateEstimatePackage', {
    package_id: packageId,
    check_totals: true,
  });
  return response.data;
}

/**
 * Accepts a package with optimistic locking protection.
 * Re-validates server-side before accepting — blocks if package became stale.
 *
 * @param {object} pkg - EstimatePackage record (must include updated_date for locking)
 * @param {string} reason - Acceptance reason
 * @param {string} proposalId - Related proposal ID
 * @returns {Promise<object>} { success, package } | { conflict } | { blocked }
 */
export async function acceptPackageWithLocking(pkg, reason = 'customer_accepted', proposalId = null) {
  try {
    const response = await base44.functions.invoke('managePackageLifecycle', {
      action: 'accept',
      package_id: pkg.id,
      expected_updated_date: pkg.updated_date,
      reason,
      proposal_id: proposalId,
    });
    return response.data;
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    if (status === 409) {
      return { conflict: true, error: data?.error || 'Package was modified by another user' };
    }
    if (status === 422) {
      return { blocked: true, error: data?.error, validation: data?.validation };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Safeguard 1: Prevent EstimatePackageItem without valid estimate_item_id
// ---------------------------------------------------------------------------

/**
 * Validates that every EstimatePackageItem has a valid estimate_item_id.
 * Returns { valid, invalid_items[] }.
 */
export function validatePackageItemsHaveEstimateItems(items) {
  if (!Array.isArray(items)) return { valid: false, invalid_items: [], reason: 'Items is not an array' };
  const invalid = items.filter(item => !item.estimate_item_id);
  return {
    valid: invalid.length === 0,
    invalid_items: invalid,
    reason: invalid.length > 0 ? `${invalid.length} package item(s) missing estimate_item_id` : null,
  };
}

// ---------------------------------------------------------------------------
// Safeguard 2: Prevent duplicate DraftEstimateItem in same package
// ---------------------------------------------------------------------------

/**
 * Detects whether the same estimate_item_id appears more than once in a package.
 * Returns { valid, duplicates[], allow_explicit_duplicate }.
 *
 * If allow_explicit_duplicate is true, the caller can intentionally support
 * duplicate quantities (e.g. two crews of the same service). This must be
 * an explicit opt-in — never the default.
 */
export function validateNoDuplicateEstimateItems(items, allow_explicit_duplicate = false) {
  if (!Array.isArray(items)) return { valid: true, duplicates: [] };
  const seen = {};
  const duplicates = [];
  for (const item of items) {
    const id = item.estimate_item_id;
    if (!id) continue;
    if (seen[id]) {
      duplicates.push({ estimate_item_id: id, first: seen[id], duplicate: item });
    } else {
      seen[id] = item;
    }
  }
  return {
    valid: allow_explicit_duplicate || duplicates.length === 0,
    duplicates,
    allow_explicit_duplicate,
    reason: duplicates.length > 0 && !allow_explicit_duplicate
      ? `${duplicates.length} duplicate estimate_item_id(s) found — pass allow_explicit_duplicate=true to override`
      : null,
  };
}

/**
 * Pre-flight check before adding an item to a package.
 * Returns { can_add, reason }.
 */
export function canAddItemToPackage(existingItems, estimate_item_id, allow_explicit_duplicate = false) {
  if (!estimate_item_id) return { can_add: false, reason: 'No estimate_item_id provided' };
  const exists = existingItems.some(i => i.estimate_item_id === estimate_item_id);
  if (exists && !allow_explicit_duplicate) {
    return { can_add: false, reason: 'This Estimate Item is already in the package. Pass allow_explicit_duplicate=true to add a second quantity.' };
  }
  return { can_add: true };
}

// ---------------------------------------------------------------------------
// Safeguard 3: Package totals derived from current package items
// ---------------------------------------------------------------------------

/**
 * Recalculates package totals from the current EstimatePackageItem records.
 * Never uses stored recommendation data — always reads live item state.
 *
 * Returns { subtotal, selling_price, gross_profit, gross_margin, gross_profit_per_day,
 *           estimated_hours, estimated_days, commission_total, item_count }.
 */
export function recomputePackageTotals(items, packageMeta = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      subtotal: 0,
      selling_price: 0,
      gross_profit: 0,
      gross_margin: 0,
      gross_profit_per_day: 0,
      estimated_hours: 0,
      estimated_days: 1,
      commission_total: 0,
      item_count: 0,
    };
  }

  const subtotal = items.reduce((sum, i) => sum + (i.material_cost || 0) + (i.labor_cost || 0), 0);
  const selling_price = items.reduce((sum, i) => sum + (i.selling_price || 0), 0);
  const gross_profit = selling_price - subtotal;
  const gross_margin = subtotal > 0 ? Math.round((gross_profit / selling_price) * 100) : 0;
  const estimated_hours = items.reduce((sum, i) => sum + (i.estimated_hours || 0), 0);
  const estimated_days = Math.max(1, Math.ceil(estimated_hours / 8));
  const commission_total = items.reduce((sum, i) => sum + (i.commission_amount || 0), 0);
  const gross_profit_per_day = estimated_days > 0 ? Math.round(gross_profit / estimated_days) : 0;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    selling_price: Math.round(selling_price * 100) / 100,
    gross_profit: Math.round(gross_profit * 100) / 100,
    gross_margin,
    gross_profit_per_day,
    estimated_hours,
    estimated_days,
    commission_total: Math.round(commission_total * 100) / 100,
    item_count: items.length,
    shared_mobilization_savings: packageMeta.shared_mobilization_savings || 0,
  };
}

// ---------------------------------------------------------------------------
// Safeguard 4: Stale marking when DraftEstimateItem changes after package creation
// ---------------------------------------------------------------------------

export const STALE_REASONS = {
  ESTIMATE_ITEM_CHANGED: 'estimate_item_changed',
  ITEM_REMOVED: 'item_removed',
  ITEM_ADDED: 'item_added',
  SCOPE_REGENERATED: 'scope_regenerated',
  MANUAL: 'manual',
};

/**
 * Marks a package as stale after an underlying Estimate Item has changed.
 * Sets pricing_status = 'stale' and flags the Scope of Work for review.
 *
 * @param {object} pkg - The EstimatePackage record to update
 * @param {string} reason - One of STALE_REASONS
 * @param {string} changed_item_id - The estimate_item_id that triggered the change
 * @returns {Promise<object>} The updated package
 */
export async function markPackageStale(pkg, reason, changed_item_id = null) {
  if (!pkg || !pkg.id) throw new Error('Package not provided');

  const updates = {
    pricing_status: 'stale',
    stale_reason: reason,
    stale_item_id: changed_item_id,
    stale_at: new Date().toISOString(),
    profitability_target_met: false,
  };

  // Mark linked Scope of Work as needing review
  if (pkg.scope_of_work_id) {
    try {
      await base44.entities.ScopeOfWork.update(pkg.scope_of_work_id, {
        status: 'updated',
        is_authoritative: false,
        stale_reason: reason,
        stale_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[PackageStale] Failed to mark Scope of Work stale:', err);
    }
  }

  const updated = await base44.entities.EstimatePackage.update(pkg.id, updates);

  await logPackageAuditEvent(updated, PACKAGE_AUDIT_EVENTS.PACKAGE_STALE,
    `Package '${pkg.name || pkg.package_number || pkg.id}' marked stale (${reason})`,
    {
      previous_status: pkg.pricing_status,
      new_status: 'stale',
      reason,
      related_item_id: changed_item_id,
      stale_reason: reason,
      changed_item_id,
      previous_pricing_status: pkg.pricing_status,
    }
  );

  return updated;
}

// ---------------------------------------------------------------------------
// Safeguard 5: Stale marking when EstimatePackageItem is removed
// ---------------------------------------------------------------------------

/**
 * Handles the removal of an EstimatePackageItem.
 * Marks Scope of Work = needs review, pricing_status = stale,
 * and flags proposal status as stale.
 *
 * @param {object} pkg - The EstimatePackage record
 * @param {string} removed_item_id - The estimate_item_id that was removed
 * @returns {Promise<object>} The updated package
 */
export async function handlePackageItemRemoved(pkg, removed_item_id) {
  if (!pkg || !pkg.id) throw new Error('Package not provided');

  // Remove the item ID from the package's estimate_item_ids array
  let itemIds = [];
  try {
    itemIds = JSON.parse(pkg.estimate_item_ids || '[]');
  } catch { itemIds = []; }
  itemIds = itemIds.filter(id => id !== removed_item_id);

  const updates = {
    estimate_item_ids: JSON.stringify(itemIds),
    pricing_status: 'stale',
    stale_reason: STALE_REASONS.ITEM_REMOVED,
    stale_item_id: removed_item_id,
    stale_at: new Date().toISOString(),
    profitability_target_met: false,
  };

  // Mark Scope of Work as needs review
  if (pkg.scope_of_work_id) {
    try {
      await base44.entities.ScopeOfWork.update(pkg.scope_of_work_id, {
        status: 'updated',
        is_authoritative: false,
        stale_reason: STALE_REASONS.ITEM_REMOVED,
        stale_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[PackageItemRemoved] Failed to mark Scope of Work:', err);
    }
  }

  // Mark any linked proposal as stale (proposal_status is tracked on the package
  // or via a separate proposal entity — we set a flag here)
  updates.proposal_stale = true;
  updates.proposal_stale_reason = STALE_REASONS.ITEM_REMOVED;

  const updated = await base44.entities.EstimatePackage.update(pkg.id, updates);

  await logPackageAuditEvent(updated, PACKAGE_AUDIT_EVENTS.PACKAGE_STALE,
    `Package '${pkg.name || pkg.package_number || pkg.id}' marked stale — item removed`,
    {
      previous_status: pkg.pricing_status,
      new_status: 'stale',
      reason: STALE_REASONS.ITEM_REMOVED,
      related_item_id: removed_item_id,
      stale_reason: STALE_REASONS.ITEM_REMOVED,
      removed_item_id: removed_item_id,
    }
  );

  return updated;
}

// ---------------------------------------------------------------------------
// Safeguard 6: Prevent accepted packages from being edited without revision
// ---------------------------------------------------------------------------

/**
 * Validates whether a package can be edited in its current state.
 * Accepted packages require a version bump (revision) before editing.
 *
 * Returns { can_edit, requires_revision, reason }.
 */
export function canEditPackage(pkg) {
  if (!pkg) return { can_edit: false, requires_revision: false, reason: 'Package not provided' };

  const acceptedStatuses = ['accepted', 'presented'];
  if (acceptedStatuses.includes(pkg.status)) {
    return {
      can_edit: false,
      requires_revision: true,
      reason: `Package status is '${pkg.status}' — editing requires creating a new revision (bump package_version and set status to 'draft')`,
    };
  }

  if (pkg.pricing_status === 'locked') {
    return {
      can_edit: false,
      requires_revision: true,
      reason: 'Package pricing is locked — editing requires creating a new revision',
    };
  }

  return { can_edit: true, requires_revision: false };
}

/**
 * Creates a revision of an accepted package for editing.
 * The original is superseded; the new revision starts in 'draft' status.
 *
 * Delegates to the managePackageLifecycle backend function which uses
 * optimistic locking (expected_updated_date) to prevent two users from
 * revising the same package simultaneously. Audit is written server-side
 * with the full field set.
 *
 * @param {object} pkg - The original accepted package (must include updated_date)
 * @returns {Promise<object>} The new revision package
 */
export async function createPackageRevision(pkg) {
  if (!pkg || !pkg.id) throw new Error('Package not provided');

  try {
    const response = await base44.functions.invoke('managePackageLifecycle', {
      action: 'revise',
      package_id: pkg.id,
      expected_updated_date: pkg.updated_date,
      reason: 'revision_created',
    });
    if (response.data?.success) return response.data.package;
    throw new Error(response.data?.error || 'Revision failed');
  } catch (err) {
    if (err.response?.status === 409) {
      throw new Error('Package was modified by another user. Please refresh and try again.');
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Safeguard 7: Preserve traceability chain
// ---------------------------------------------------------------------------

/**
 * Validates the full traceability chain for a package item:
 *   EstimatePackageItem → DraftEstimateItem → RepairRecommendation → Inspection Finding
 *
 * Returns { valid, chain, breaks[] }.
 */
export async function validateTraceabilityChain(packageItem) {
  const result = {
    valid: true,
    chain: {
      package_item_id: packageItem?.id,
      estimate_item_id: packageItem?.estimate_item_id,
      repair_recommendation_id: null,
      inspection_finding_id: null,
    },
    breaks: [],
  };

  if (!packageItem) {
    return { valid: false, chain: null, breaks: ['Package item not provided'] };
  }

  if (!packageItem.estimate_item_id) {
    result.breaks.push('EstimatePackageItem has no estimate_item_id — chain broken at layer 1');
    result.valid = false;
    return result;
  }

  // Layer 2: DraftEstimateItem
  let estimateItem;
  try {
    estimateItem = await base44.entities.DraftEstimateItem.get(packageItem.estimate_item_id);
  } catch (err) {
    result.breaks.push(`DraftEstimateItem not found: ${err.message}`);
    result.valid = false;
    return result;
  }

  if (!estimateItem) {
    result.breaks.push('DraftEstimateItem record not found — chain broken at layer 2');
    result.valid = false;
    return result;
  }

  result.chain.repair_recommendation_id = estimateItem.repair_system_recommendation_id || estimateItem.recommendation_review_item_id;

  // Layer 3: Repair Recommendation (RepairSystemRecommendation or RecommendationReviewItem)
  if (!result.chain.repair_recommendation_id) {
    result.breaks.push('DraftEstimateItem has no repair_recommendation_id — chain broken at layer 3');
    result.valid = false;
    return result;
  }

  let recommendation;
  try {
    // Try RepairSystemRecommendation first, then RecommendationReviewItem
    recommendation = await base44.entities.RepairSystemRecommendation.get(result.chain.repair_recommendation_id);
    if (!recommendation) {
      recommendation = await base44.entities.RecommendationReviewItem.get(result.chain.repair_recommendation_id);
    }
  } catch (err) {
    result.breaks.push(`Repair recommendation not found: ${err.message}`);
    result.valid = false;
    return result;
  }

  if (!recommendation) {
    result.breaks.push('Repair recommendation record not found — chain broken at layer 3');
    result.valid = false;
    return result;
  }

  result.chain.inspection_finding_id = recommendation.finding_id || recommendation.source_finding_id;

  // Layer 4: Inspection Finding
  if (!result.chain.inspection_finding_id) {
    result.breaks.push('Repair recommendation has no finding_id — chain broken at layer 4');
    result.valid = false;
    return result;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Safeguard 8: Execution Plan creation validation
// ---------------------------------------------------------------------------

/**
 * Validates all prerequisites for Execution Plan creation.
 * Requires:
 *   - package is accepted
 *   - authoritative Scope of Work exists
 *   - pricing is current (not stale)
 *
 * Returns { valid, reasons[] }.
 */
export async function validateExecutionPlanPrerequisites(estimate_package_id) {
  const reasons = [];

  if (!estimate_package_id) {
    return { valid: false, reasons: ['No estimate_package_id provided'] };
  }

  // Fetch the package
  let pkg;
  try {
    pkg = await base44.entities.EstimatePackage.get(estimate_package_id);
  } catch (err) {
    return { valid: false, reasons: [`Package not found: ${err.message}`] };
  }

  if (!pkg) {
    return { valid: false, reasons: ['Package record not found'] };
  }

  // Check 1: Package must be accepted
  const accepted = pkg.status === 'accepted' || pkg.is_selected === true;
  if (!accepted) {
    reasons.push(`Package status is '${pkg.status}' (is_selected=${pkg.is_selected}) — must be 'accepted' before creating an Execution Plan`);
  }

  // Check 2: Authoritative Scope of Work must exist
  const scopeResult = await resolveAuthoritativeScopeOfWork({
    job_id: pkg.job_id,
    appointment_id: pkg.appointment_id,
    estimate_package_id,
  });

  if (!scopeResult.scope) {
    reasons.push('No authoritative Scope of Work found — cannot create Execution Plan');
  } else if (!scopeResult.scope.is_authoritative) {
    reasons.push('Scope of Work exists but is not marked authoritative — cannot create Execution Plan');
  } else if (scopeResult.has_conflict) {
    reasons.push(`Scope of Work conflict detected: ${scopeResult.selection_reason}`);
  }

  // Check 3: Pricing must be current (not stale)
  const staleStatuses = ['stale', 'pending', 'not_started'];
  if (staleStatuses.includes(pkg.pricing_status)) {
    reasons.push(`Package pricing_status is '${pkg.pricing_status}' — pricing must be current (calculated/approved/locked) before creating an Execution Plan`);
  }

  return { valid: reasons.length === 0, reasons, package: pkg, scope: scopeResult.scope };
}

// ---------------------------------------------------------------------------
// Stale Prevention — Filter packages eligible for customer presentation
// ---------------------------------------------------------------------------

/**
 * Filters out stale packages from a list, returning only those that are
 * safe to present to a customer.
 *
 * A package is presentable when:
 *   - pricing_status is NOT 'stale', 'not_started', or 'pending'
 *   - proposal_stale is not true
 *   - is_authoritative is true (not superseded)
 *
 * @param {array} packages - EstimatePackage records
 * @returns {array} Presentable packages
 */
export function filterPresentablePackages(packages) {
  if (!Array.isArray(packages)) return [];
  const blockedStatuses = ['stale', 'not_started', 'pending'];
  return packages.filter(pkg => {
    if (!pkg) return false;
    if (blockedStatuses.includes(pkg.pricing_status)) return false;
    if (pkg.proposal_stale === true) return false;
    if (pkg.is_authoritative === false) return false;
    return true;
  });
}

/**
 * Returns stale packages from a list — useful for showing warnings.
 */
export function getStalePackages(packages) {
  if (!Array.isArray(packages)) return [];
  return packages.filter(pkg => {
    if (!pkg) return false;
    return pkg.pricing_status === 'stale' || pkg.proposal_stale === true;
  });
}

// ---------------------------------------------------------------------------
// Recalculate Package Pricing — clears stale state with audit
// ---------------------------------------------------------------------------

/**
 * Recalculates package pricing from current EstimatePackageItems,
 * clears the stale flag, and records an audit event.
 *
 * Delegates to the managePackageLifecycle backend function which uses
 * optimistic locking (expected_updated_date) to prevent two users from
 * recalculating the same package simultaneously. The backend fetches live
 * items, recomputes totals, and writes a rich audit record server-side.
 *
 * @param {object} pkg - The EstimatePackage record (must include updated_date)
 * @param {array} items - Unused when backend is available (backend fetches live items).
 *                        Kept for backward-compatible call signature.
 * @returns {Promise<object>} The updated package with fresh totals
 */
export async function recalculatePackagePricing(pkg, items) {
  if (!pkg || !pkg.id) throw new Error('Package not provided');

  try {
    const response = await base44.functions.invoke('managePackageLifecycle', {
      action: 'recalculate',
      package_id: pkg.id,
      expected_updated_date: pkg.updated_date,
      reason: 'stale_pricing_recalculated',
    });
    if (response.data?.success) return response.data.package;
    throw new Error(response.data?.error || 'Recalculation failed');
  } catch (err) {
    if (err.response?.status === 409) {
      throw new Error('Package was modified by another user. Please refresh and try again.');
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Replace Authoritative Scope — supersedes old scope with audit
// ---------------------------------------------------------------------------

/**
 * Replaces the authoritative Scope of Work for a package.
 * The old scope is superseded; the new scope becomes authoritative.
 *
 * @param {object} pkg - The EstimatePackage record
 * @param {object} newScope - The new ScopeOfWork record (already created)
 * @returns {Promise<object>} The updated package
 */
export async function replaceAuthoritativeScope(pkg, newScope) {
  if (!pkg || !pkg.id) throw new Error('Package not provided');
  if (!newScope || !newScope.id) throw new Error('New scope not provided');

  const oldScopeId = pkg.scope_of_work_id;

  // Supersede the old scope if it exists
  if (oldScopeId && oldScopeId !== newScope.id) {
    try {
      await base44.entities.ScopeOfWork.update(oldScopeId, {
        is_authoritative: false,
        superseded_by_id: newScope.id,
        status: 'archived',
      });
    } catch (err) {
      console.error('[ScopeReplaced] Failed to supersede old scope:', err);
    }
  }

  // Mark the new scope as authoritative
  await base44.entities.ScopeOfWork.update(newScope.id, {
    is_authoritative: true,
    estimate_package_id: pkg.id,
  });

  const updated = await base44.entities.EstimatePackage.update(pkg.id, {
    scope_of_work_id: newScope.id,
    pricing_status: 'stale',
    stale_reason: STALE_REASONS.SCOPE_REGENERATED,
    stale_at: new Date().toISOString(),
  });

  await logPackageAuditEvent(updated, PACKAGE_AUDIT_EVENTS.SCOPE_REPLACED,
    `Scope of Work replaced for package '${pkg.name || pkg.package_number || pkg.id}'`,
    {
      previous_status: pkg.pricing_status,
      new_status: 'stale',
      reason: STALE_REASONS.SCOPE_REGENERATED,
      related_scope_id: newScope.id,
      old_scope_id: oldScopeId,
      new_scope_id: newScope.id,
    }
  );

  return updated;
}

// ---------------------------------------------------------------------------
// Regenerate Proposal — clears proposal_stale with audit
// ---------------------------------------------------------------------------

/**
 * Marks a package's proposal as regenerated (no longer stale).
 *
 * @param {object} pkg - The EstimatePackage record
 * @returns {Promise<object>} The updated package
 */
export async function regenerateProposal(pkg) {
  if (!pkg || !pkg.id) throw new Error('Package not provided');

  const updated = await base44.entities.EstimatePackage.update(pkg.id, {
    proposal_stale: false,
    proposal_stale_reason: null,
  });

  await logPackageAuditEvent(updated, PACKAGE_AUDIT_EVENTS.PROPOSAL_REGENERATED,
    `Proposal regenerated for package '${pkg.name || pkg.package_number || pkg.id}'`,
    {
      previous_status: pkg.pricing_status,
      new_status: pkg.pricing_status,
      reason: 'proposal_regenerated',
      previous_proposal_stale_reason: pkg.proposal_stale_reason,
    }
  );

  return updated;
}

// ---------------------------------------------------------------------------
// Legacy Detection Helpers (Phase 5 — Historical Compatibility)
// ---------------------------------------------------------------------------

/**
 * Returns true when a job's data is from the legacy workflow.
 * Used to display legacy labels and prevent automatic recalculation.
 */
export function isLegacyJobScope(scopeOfWork) {
  if (!scopeOfWork) return false;
  return (
    scopeOfWork.is_legacy === true ||
    scopeOfWork.workflow_version === 'legacy' ||
    !scopeOfWork.estimate_package_id
  );
}

/**
 * Returns a display label for a scope record indicating its provenance.
 */
export function getScopeDisplayLabel(scopeOfWork) {
  if (!scopeOfWork) return 'No Scope';
  if (scopeOfWork.is_legacy || scopeOfWork.workflow_version === 'legacy') {
    return 'Legacy Scope (Pre-Package Workflow)';
  }
  if (scopeOfWork.is_authoritative) {
    return `Authoritative Scope v${scopeOfWork.version || 1}`;
  }
  return `Scope v${scopeOfWork.version || 1}`;
}