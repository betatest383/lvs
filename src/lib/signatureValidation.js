/**
 * Centralized signature validation helper.
 *
 * Signatures are tracked via JobActivityLog entries with event_type='signature_captured'.
 * Each log entry's event_details (JSON) contains: { purpose, purposeLabel, signatureUrl, signerName, timestamp }
 *
 * Required signatures are built DYNAMICALLY based on the customer decision,
 * not from a static stage-to-signature map. This ensures the required list
 * always matches the actual workflow context.
 */

export const SIGNATURE_TYPES = {
  customer_authorization: {
    key: 'customer_authorization',
    label: 'Customer Work Authorization',
    purpose: 'work_authorization',
    captureLocation: 'Customer Signature (✍️ Quick Action)',
    managerOverrideAllowed: true,
    description: 'Customer must authorize the proposed work before proceeding.',
  },
  estimate_approval: {
    key: 'estimate_approval',
    label: 'Estimate Approval Signature',
    purpose: 'estimate_presentation',
    captureLocation: 'Customer Presentation → Decision section',
    managerOverrideAllowed: true,
    description: 'Customer must approve the estimate during presentation.',
  },
  manager_override: {
    key: 'manager_override',
    label: 'Manager Override Signature',
    purpose: 'manager_override',
    captureLocation: 'Manager Override dialog (within the blocking stage)',
    managerOverrideAllowed: false,
    description: 'A manager override was used and requires a manager signature.',
  },
  completion_acceptance: {
    key: 'completion_acceptance',
    label: 'Customer Completion / Closeout Signature',
    purpose: 'completion_acceptance',
    captureLocation: 'Customer Signature (✍️ Quick Action) or Completion Engine',
    managerOverrideAllowed: false,
    description: 'Customer must sign off on the completed work before the appointment is closed.',
  },
  clean_inspection_acknowledgment: {
    key: 'clean_inspection_acknowledgment',
    label: 'Clean Inspection Acknowledgment',
    purpose: 'clean_inspection_acknowledgment',
    captureLocation: 'Clean Inspection Dialog',
    managerOverrideAllowed: true,
    description: 'Customer must acknowledge the clean inspection results.',
  },
};

/**
 * Decisions that require estimate_approval signature.
 * "think_about_it" and "declined" do NOT require estimate approval —
 * the customer is not approving any work.
 */
const DECISIONS_REQUIRING_ESTIMATE_APPROVAL = [
  'perform_work_today',
  'schedule_for_later',
];

/**
 * Builds the required signature list DYNAMICALLY based on the customer decision
 * and workflow stage. This replaces the static STAGE_SIGNATURE_REQUIREMENTS map.
 *
 * Rules:
 *   customer_presentation  → customer_authorization (always)
 *   customer_decision      → estimate_approval ONLY for perform_work_today / schedule_for_later
 *   complete_appointment   → completion_acceptance (unless declined)
 *
 * @param {string} customerDecision - perform_work_today | schedule_for_later | think_about_it | declined | pending
 * @param {string} stage - workflow stage key
 * @param {Object} context - additional context { noRecommendations, hasDeficiencies }
 * @returns {Array} - array of SIGNATURE_TYPES entries
 */
export function buildRequiredSignatures(customerDecision, stage, context = {}) {
  const requiresEstimateApproval = DECISIONS_REQUIRING_ESTIMATE_APPROVAL.includes(customerDecision);
  const sigs = [];

  switch (stage) {
    case 'customer_presentation':
      sigs.push(SIGNATURE_TYPES.customer_authorization);
      break;
    case 'customer_decision':
      if (requiresEstimateApproval) {
        sigs.push(SIGNATURE_TYPES.estimate_approval);
      }
      break;
    case 'complete_appointment':
      if (customerDecision !== 'declined') {
        sigs.push(SIGNATURE_TYPES.completion_acceptance);
      }
      break;
    default:
      break;
  }

  return sigs;
}

/**
 * Extracts captured signature purposes from activity logs.
 * @param {Array} activityLogs - JobActivityLog entries
 * @returns {Array<string>} - list of captured signature purposes
 */
export function getCapturedSignaturePurposes(activityLogs = []) {
  const purposes = new Set();
  for (const log of activityLogs) {
    if (log.event_type !== 'signature_captured') continue;
    let details = log.event_details;
    if (typeof details === 'string') {
      try { details = JSON.parse(details); } catch { details = {}; }
    }
    // Primary: check the `purpose` field
    if (details?.purpose) {
      purposes.add(details.purpose);
    }
    // Fallback: check `signature_type` and resolve to its purpose via SIGNATURE_TYPES
    if (details?.signature_type && SIGNATURE_TYPES[details.signature_type]) {
      purposes.add(SIGNATURE_TYPES[details.signature_type].purpose);
    }
    // Also check override_signature fields from recommendation reviews
    if (details?.override_signature) {
      purposes.add('manager_override');
    }
  }
  return Array.from(purposes);
}

// ── Logging dedup ──
// Prevents the same validation log from firing dozens of times in a render loop.
let _lastLoggedDecision = null;
let _lastLoggedStage = null;
let _lastLogTime = 0;

/**
 * Validates required signatures for a given workflow stage.
 *
 * @param {Array} activityLogs - JobActivityLog entries for the job
 * @param {string} workflowStage - the stage key the technician is trying to advance past
 * @param {Object} context - { noRecommendations, customerDecision, hasDeficiencies }
 * @param {string} triggerSource - what triggered this validation (for logging)
 * @returns {{ allCaptured: boolean, requiredSignatures: Array, capturedSignatures: Array, missingSignatures: Array, blockingStage: string }}
 */
export function validateRequiredSignatures(activityLogs, workflowStage, context = {}, triggerSource = 'unknown') {
  const capturedPurposes = getCapturedSignaturePurposes(activityLogs);
  const customerDecision = context.customerDecision || 'pending';

  // Build required signatures DYNAMICALLY based on customer decision
  let requiredSignatures = buildRequiredSignatures(customerDecision, workflowStage, context);

  // Check for manager override signatures from recommendation review
  const hasOverride = activityLogs.some(l => {
    let details = l.event_details;
    if (typeof details === 'string') {
      try { details = JSON.parse(details); } catch { details = {}; }
    }
    return details?.override_signature;
  });
  if (hasOverride && !capturedPurposes.includes('manager_override')) {
    requiredSignatures.push(SIGNATURE_TYPES.manager_override);
  }

  const missingSignatures = requiredSignatures.filter(
    sig => !capturedPurposes.includes(sig.purpose)
  );

  // ── Log once per unique (decision, stage) combination or after 2s gap ──
  const now = Date.now();
  const shouldLog = _lastLoggedDecision !== customerDecision
    || _lastLoggedStage !== workflowStage
    || (now - _lastLogTime) > 2000;

  if (shouldLog) {
    const previousDecision = _lastLoggedDecision;
    _lastLoggedDecision = customerDecision;
    _lastLoggedStage = workflowStage;
    _lastLogTime = now;

    console.log('[SignatureValidation] ─────────────────────────────');
    console.log('[SignatureValidation] Trigger source:      ', triggerSource);
    console.log('[SignatureValidation] Stage:               ', workflowStage);
    console.log('[SignatureValidation] Current decision:    ', customerDecision);
    console.log('[SignatureValidation] Previous decision:   ', previousDecision ?? '(none)');
    console.log('[SignatureValidation] Required signatures: ', requiredSignatures.map(s => s.key));
    console.log('[SignatureValidation] Captured signatures: ', capturedPurposes);
    console.log('[SignatureValidation] Missing signatures:  ', missingSignatures.map(s => s.key));
    console.log('[SignatureValidation] Result:              ', missingSignatures.length === 0 ? 'PASS' : 'BLOCKED');
    console.log('[SignatureValidation] ─────────────────────────────');
  }

  return {
    allCaptured: missingSignatures.length === 0,
    requiredSignatures,
    capturedSignatures: requiredSignatures.filter(sig => capturedPurposes.includes(sig.purpose)),
    missingSignatures,
    blockingStage: workflowStage,
  };
}

/**
 * Lightweight function that returns missing signature labels WITHOUT logging.
 * Used in render paths (useMemo) where frequent re-evaluation is expected.
 *
 * @param {Array} activityLogs
 * @param {Object} context - { noRecommendations, customerDecision }
 * @returns {Array<string>} - labels of missing signatures
 */
export function getMissingSignatureLabels(activityLogs, context = {}) {
  const capturedPurposes = getCapturedSignaturePurposes(activityLogs);
  const customerDecision = context.customerDecision || 'pending';
  const allMissing = [];

  for (const stage of ['customer_presentation', 'customer_decision', 'complete_appointment']) {
    const required = buildRequiredSignatures(customerDecision, stage, context);
    const missing = required.filter(sig => !capturedPurposes.includes(sig.purpose));
    allMissing.push(...missing);
  }

  return allMissing.map(s => s.label);
}

/**
 * Runs a full signature audit across all stages — used at final completion.
 *
 * @param {Array} activityLogs - JobActivityLog entries
 * @param {Object} context - { noRecommendations, customerDecision }
 * @param {string} triggerSource - what triggered this audit (for logging)
 * @returns {{ allCaptured: boolean, missingSignatures: Array, auditResults: Array }}
 */
export function runFullSignatureAudit(activityLogs, context = {}, triggerSource = 'full_audit') {
  const stagesToAudit = ['customer_presentation', 'customer_decision', 'complete_appointment'];
  const auditResults = [];
  const allMissing = [];

  for (const stage of stagesToAudit) {
    const result = validateRequiredSignatures(activityLogs, stage, context, triggerSource);
    if (result.requiredSignatures.length > 0) {
      auditResults.push({ stage, ...result });
      if (result.missingSignatures.length > 0) {
        allMissing.push(...result.missingSignatures);
      }
    }
  }

  return {
    allCaptured: allMissing.length === 0,
    missingSignatures: allMissing,
    auditResults,
  };
}