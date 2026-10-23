// ═════════════════════════════════════════════════════════════════
// 2G1-A COST TYPES (LITERAL)
// ═════════════════════════════════════════════════════════════════

import type {
  Currency2G1A, RawCostSource2G1A, CostPreservationReason2G1A,
} from "./eventTypes.ts";

// ─── RawCostInput2G1A (string cost_source — raw, pre-parsed) ───
export interface RawCostInput2G1A {
  cost_source: string;
  unit_cost: number;
  currency: Currency2G1A;
}

// ─── CostParseResult2G1A ───
export type CostParseResult2G1A =
  | { ok: true; supplied_cost: SuppliedCost2G1A }
  | {
      ok: false;
      rejection_code:
        | "VAL.SELLING_PRICE_REJECTED"
        | "VAL.MSRP_REJECTED"
        | "VAL.MARKUP_REJECTED"
        | "VAL.COST_SOURCE_INVALID";
    };

// ─── SuppliedCost2G1A ───
export interface SuppliedCost2G1A {
  cost_source: "supported_explicit";
  unit_cost: number;
  currency: Currency2G1A;
}

// ─── DomainPreservedCost ───
export interface DomainPreservedCost {
  cost_source: "supported_explicit" | "not_applicable";
  unit_cost: number | null;
  currency: Currency2G1A;
  cost_basis: null;
}

// ─── CostPreservationResult ───
export interface CostPreservationResult {
  kind: "cost_preservation";
  item_id: string;
  event_id: string;
  preserved_cost: DomainPreservedCost;
  reason: CostPreservationReason2G1A;
}

// ─── ImmutableEventFact2G1A union ───
export type ImmutableEventFact2G1A = CostPreservationResult;

// ─── Parse cost (Stage D) ───
export function parseCost(raw: RawCostInput2G1A): CostParseResult2G1A {
  const { cost_source, unit_cost, currency } = raw;
  switch (cost_source) {
    case "supported_explicit":
      if (typeof unit_cost !== "number" || !isFinite(unit_cost) || unit_cost <= 0) {
        return { ok: false, rejection_code: "VAL.COST_SOURCE_INVALID" };
      }
      return { ok: true, supplied_cost: { cost_source: "supported_explicit", unit_cost, currency } };
    case "selling_price":
      return { ok: false, rejection_code: "VAL.SELLING_PRICE_REJECTED" };
    case "msrp":
      return { ok: false, rejection_code: "VAL.MSRP_REJECTED" };
    case "markup":
      return { ok: false, rejection_code: "VAL.MARKUP_REJECTED" };
    case "other_invalid":
      return { ok: false, rejection_code: "VAL.COST_SOURCE_INVALID" };
    default:
      // Any other string value → VAL.COST_SOURCE_INVALID
      return { ok: false, rejection_code: "VAL.COST_SOURCE_INVALID" };
  }
}

// ─── Build CostPreservationResult from supplied cost ───
export function buildCostPreservation(
  itemId: string,
  eventId: string,
  supplied: SuppliedCost2G1A,
  reason: CostPreservationReason2G1A
): CostPreservationResult {
  return {
    kind: "cost_preservation",
    item_id: itemId,
    event_id: eventId,
    preserved_cost: {
      cost_source: "supported_explicit",
      unit_cost: supplied.unit_cost,
      currency: supplied.currency,
      cost_basis: null,
    },
    reason,
  };
}