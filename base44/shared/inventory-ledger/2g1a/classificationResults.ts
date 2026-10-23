// ═════════════════════════════════════════════════════════════════
// 2G1-A CLASSIFICATION RESULTS (3) AND DERIVED SNAPSHOTS (1)
// ═════════════════════════════════════════════════════════════════

import type {
  NoEffectWorkflowReason2G1A,
  NoEffectCommandReason2G1A,
  NoEffectObservationReason2G1A,
} from "./eventTypes.ts";

// ─── Classification Results (3) ───
export interface NoEffectWorkflow {
  kind: "no_effect_workflow";
  event_id: string;
  reason: NoEffectWorkflowReason2G1A;
}

export interface NoEffectCommand {
  kind: "no_effect_command";
  event_id: string;
  reason: NoEffectCommandReason2G1A;
}

export interface NoEffectObservation {
  kind: "no_effect_observation";
  event_id: string;
  reason: NoEffectObservationReason2G1A;
}

export type ClassificationResult2G1A =
  | NoEffectWorkflow
  | NoEffectCommand
  | NoEffectObservation;

// ─── Derived Snapshot (1) ───
export interface AvailabilityDerived {
  kind: "availability_derived";
  position_id: string;
  item_id: string;
  available_before: number;
  available_after: number;
}

export type DerivedResultSnapshot2G1A = AvailabilityDerived;

// ─── Count verification ───
export const CLASSIFICATION_KINDS = [
  "no_effect_workflow",
  "no_effect_command",
  "no_effect_observation",
] as const;

export const DERIVED_KINDS = ["availability_derived"] as const;