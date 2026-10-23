// ═════════════════════════════════════════════════════════════════
// 2G1-A CANONICAL STATE EFFECTS (4)
// ═════════════════════════════════════════════════════════════════

import type {
  PositionQuantityReason2G1A,
  CompanyOwnedReason2G1A,
  ReclassificationReason2G1A,
  ConditionClass2G1A,
  RestrictionClass2G1A,
} from "./eventTypes.ts";

// ─── 1. PositionQuantityEffect ───
export interface PositionQuantityEffect {
  kind: "position_quantity";
  position_id: string;
  item_id: string;
  delta: number;
  before: number;
  after: number;
  reason: PositionQuantityReason2G1A;
}

// ─── 2. CompanyOwnedEffect ───
export interface CompanyOwnedEffect {
  kind: "company_owned";
  item_id: string;
  delta: number;
  before: number;
  after: number;
  reason: CompanyOwnedReason2G1A;
}

// ─── 3. ConditionReclassification ───
export interface ConditionReclassification {
  kind: "condition_reclassification";
  position_id: string;
  item_id: string;
  before: ConditionClass2G1A;
  after: ConditionClass2G1A;
  reason: ReclassificationReason2G1A;
}

// ─── 4. RestrictionReclassification ───
export interface RestrictionReclassification {
  kind: "restriction_reclassification";
  position_id: string;
  item_id: string;
  before: RestrictionClass2G1A;
  after: RestrictionClass2G1A;
  reason: ReclassificationReason2G1A;
}

// ─── Union ───
export type CanonicalStateEffect2G1A =
  | PositionQuantityEffect
  | CompanyOwnedEffect
  | ConditionReclassification
  | RestrictionReclassification;

// ─── Count verification ───
export const CANONICAL_EFFECT_KINDS = [
  "position_quantity",
  "company_owned",
  "condition_reclassification",
  "restriction_reclassification",
] as const;