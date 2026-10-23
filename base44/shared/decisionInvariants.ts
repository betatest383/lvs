/**
 * decisionInvariants — duplicate-decision detection + containment.
 *
 * Because the CDR `create` cannot be fenced (creates aren't conditional),
 * the only residual race is: a worker acquires the lock, creates a CDR,
 * then is stolen from by expiry-recovery before its fenced release. The
 * late worker's fenced release CAS fails (lock_owner changed) so it
 * writes NO workflow pointer/version — but its CDR is orphaned.
 *
 * This module detects that and every other invariant breach, blocks the
 * workflow from progressing to scheduling, and raises an operational
 * exception. It NEVER deletes a "losing" record.
 *
 * Invariants checked:
 *   I1  No two CDRs share the same (workflow_id, decision_sequence_number)
 *   I2  No two completed decisions originated from the same starting
 *       workflow version (expected_workflow_revision_version collision
 *       across completed CDRs)
 *   I3  Workflow pointer resolves to a real CDR belonging to this workflow
 *   I4  Workflow pointer's estimate_package_id (if any) matches the CDR's
 *   I5  No orphaned CDRs (CDR exists but no workflow pointer references it
 *       AND it was not superseded by a later switch/cancel)
 *   I6  Workflow version matches the durable mutation result version of
 *       the current-pointer CDR
 *   I7  No multiple current pointers (workflow field is single by schema,
 *       but multiple CDRs with is_current:true are tolerated — pointer
 *       is authoritative)
 */

export interface InvariantViolation {
  code: string;
  severity: 'block' | 'warn';
  detail: string;
  evidence_ids?: string[];
}

export interface InvariantReport {
  ok: boolean;
  violations: InvariantViolation[];
  blocking: boolean;
}

export function evaluateDecisionInvariants(
  workflow: any,
  cdrs: any[],
): InvariantReport {
  const violations: InvariantViolation[] = [];

  // I1 — duplicate sequence numbers
  const seqCounts: Record<string, string[]> = {};
  for (const r of cdrs) {
    const key = String(r.decision_sequence_number);
    (seqCounts[key] = seqCounts[key] || []).push(r.id);
  }
  for (const [seq, ids] of Object.entries(seqCounts)) {
    if (ids.length > 1) {
      violations.push({
        code: 'DUPLICATE_DECISION_SEQUENCE',
        severity: 'block',
        detail: `Two or more CustomerDecisionRecords share decision_sequence_number ${seq}. Sequence allocation was not exclusive.`,
        evidence_ids: ids,
      });
    }
  }

  // I2 — duplicate starting-version among completed decisions
  const completedTypes = ['accept_option', 'switch_option'];
  const completed = cdrs.filter((r) => completedTypes.includes(r.decision_type));
  const startVerCounts: Record<string, string[]> = {};
  for (const r of completed) {
    const key = String(r.expected_workflow_revision_version ?? 0);
    (startVerCounts[key] = startVerCounts[key] || []).push(r.id);
  }
  for (const [ver, ids] of Object.entries(startVerCounts)) {
    if (ids.length > 1) {
      violations.push({
        code: 'DUPLICATE_STARTING_VERSION',
        severity: 'block',
        detail: `Two or more accepted/switched decisions originated from the same starting workflow version ${ver}. Concurrent same-version acceptance.`,
        evidence_ids: ids,
      });
    }
  }

  // I3 — pointer resolves
  const pointer = workflow.current_customer_decision_record_id;
  const pointed = pointer ? cdrs.find((r) => r.id === pointer) || null : null;
  if (pointer && !pointed) {
    violations.push({
      code: 'DANGLING_POINTER',
      severity: 'block',
      detail: `current_customer_decision_record_id (${pointer}) does not resolve to a CustomerDecisionRecord on this workflow.`,
      evidence_ids: [pointer],
    });
  }

  // I4 — pointer package matches CDR
  if (pointed && workflow.selected_option_id && pointed.estimate_package_id &&
      workflow.selected_option_id !== pointed.estimate_package_id) {
    violations.push({
      code: 'POINTER_PACKAGE_MISMATCH',
      severity: 'block',
      detail: `workflow.selected_option_id (${workflow.selected_option_id}) does not match the current CDR's estimate_package_id (${pointed.estimate_package_id}).`,
      evidence_ids: [pointed.id],
    });
  }

  // I6 — workflow version matches current CDR's resulting version
  if (pointed && pointed.resulting_workflow_revision_version != null &&
      Number(workflow.workflow_revision_version) !== Number(pointed.resulting_workflow_revision_version)) {
    violations.push({
      code: 'VERSION_POINTER_DRIFT',
      severity: 'block',
      detail: `workflow.workflow_revision_version (${workflow.workflow_revision_version}) does not match the current CDR's resulting_workflow_revision_version (${pointed.resulting_workflow_revision_version}).`,
      evidence_ids: [pointed.id],
    });
  }

  // I5 — orphaned CDRs: a CDR whose id is not the current pointer AND not
  // referenced as previous_decision_record_id by any later CDR AND not a
  // decline/cancel/defer/revision (which legitimately don't get pointed to).
  // Orphans arise from the unrecoverable create-then-stolen race.
  const referencedAsPrev = new Set(
    cdrs.map((r) => r.previous_decision_record_id).filter(Boolean),
  );
  const supersededSet = new Set(
    cdrs.map((r) => r.superseded_decision_record_id).filter(Boolean),
  );
  for (const r of cdrs) {
    if (r.id === pointer) continue;
    if (referencedAsPrev.has(r.id)) continue;
    if (supersededSet.has(r.id)) continue;
    // acceptance/switch CDRs that aren't chained and aren't the pointer are orphans
    if (completedTypes.includes(r.decision_type)) {
      violations.push({
        code: 'ORPHANED_DECISION_RECORD',
        severity: 'warn',
        detail: `CustomerDecisionRecord ${r.id} (type ${r.decision_type}, seq ${r.decision_sequence_number}) is not the current pointer, not chained as a previous decision, and not superseded — likely a create-then-stolen race orphan.`,
        evidence_ids: [r.id],
      });
    }
  }

  const blocking = violations.some((v) => v.severity === 'block');
  return { ok: !blocking && violations.length === 0, violations, blocking };
}