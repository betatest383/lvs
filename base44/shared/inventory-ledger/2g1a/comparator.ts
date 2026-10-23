// ═════════════════════════════════════════════════════════════════
// 2G1-A DETERMINISTIC COMPARATOR
// ═════════════════════════════════════════════════════════════════

import type { CanonicalStateEffect2G1A } from "./quantityEffects.ts";
import type { AtomicRecordOperation2G1A } from "./atomicRecordOps.ts";
import type { DomainError, DomainWarning } from "./resultTypes.ts";

export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function sortEffects(effects: CanonicalStateEffect2G1A[]): CanonicalStateEffect2G1A[] {
  return [...effects].sort((a, b) => {
    if (a.kind !== b.kind) return compareStrings(a.kind, b.kind);
    if (a.kind === "position_quantity" && b.kind === "position_quantity") {
      const c = compareStrings(a.position_id, b.position_id);
      if (c !== 0) return c;
      return compareStrings(a.item_id, b.item_id);
    }
    if (a.kind === "company_owned" && b.kind === "company_owned") {
      return compareStrings(a.item_id, b.item_id);
    }
    if ((a.kind === "condition_reclassification" || a.kind === "restriction_reclassification") &&
        (b.kind === "condition_reclassification" || b.kind === "restriction_reclassification")) {
      return compareStrings(a.position_id, b.position_id);
    }
    return 0;
  });
}

export function sortOperations(ops: AtomicRecordOperation2G1A[]): AtomicRecordOperation2G1A[] {
  return [...ops].sort((a, b) => {
    const ak = (a as { op_kind: string }).op_kind;
    const bk = (b as { op_kind: string }).op_kind;
    if (ak !== bk) return compareStrings(ak, bk);
    // Within same op_kind, sort by primary key
    const aRecord = a as unknown as Record<string, unknown>;
    const bRecord = b as unknown as Record<string, unknown>;
    const keys: Record<string, string> = {
      transfer_outstanding_created: "transfer_id",
      transfer_outstanding_received: "transfer_id",
      correction_provenance_created: "record_id",
      correction_provenance_reversal_updated: "provenance_record_id",
      correction_provenance_downstream_block_updated: "provenance_record_id",
      job_issue_progress_created: "issue_event_id",
      job_issue_consumed_updated: "issue_event_id",
      job_issue_consumed_reversed: "issue_event_id",
      job_issue_returned_updated: "issue_event_id",
      accepted_event_record_inserted: "_record_id",
      state_revision_advanced: "_after_revision",
    };
    const keyName = keys[ak] || "op_kind";
    let av: string, bv: string;
    if (keyName === "_record_id") {
      av = String((aRecord.record as { record_id?: string })?.record_id ?? "");
      bv = String((bRecord.record as { record_id?: string })?.record_id ?? "");
    } else if (keyName === "_after_revision") {
      av = String(aRecord.after_revision ?? "");
      bv = String(bRecord.after_revision ?? "");
    } else {
      av = String(aRecord[keyName] ?? "");
      bv = String(bRecord[keyName] ?? "");
    }
    const c = compareStrings(av, bv);
    if (c !== 0) return c;
    // Secondary sort for multi-key ops
    const secondaryKeys: Record<string, string> = {
      correction_provenance_reversal_updated: "reversing_event_id",
      correction_provenance_downstream_block_updated: "blocking_event_id",
      job_issue_consumed_updated: "consumption_event_id",
      job_issue_consumed_reversed: "reversal_event_id",
      job_issue_returned_updated: "return_event_id",
    };
    const sk = secondaryKeys[ak];
    if (sk) {
      return compareStrings(String(aRecord[sk] ?? ""), String(bRecord[sk] ?? ""));
    }
    return 0;
  });
}

export function sortErrors(errors: DomainError[]): DomainError[] {
  return [...errors].sort((a, b) => {
    const c = compareStrings(a.category, b.category);
    if (c !== 0) return c;
    const c2 = compareStrings(a.error_code, b.error_code);
    if (c2 !== 0) return c2;
    const af = a.affected_field ?? "~";
    const bf = b.affected_field ?? "~";
    return compareStrings(af, bf);
  });
}

export function sortWarnings(warnings: DomainWarning[]): DomainWarning[] {
  return [...warnings].sort((a, b) => {
    const c = compareStrings(a.warning_code, b.warning_code);
    if (c !== 0) return c;
    const c2 = compareStrings(a.category, b.category);
    if (c2 !== 0) return c2;
    const af = a.affected_field ?? "~";
    const bf = b.affected_field ?? "~";
    return compareStrings(af, bf);
  });
}