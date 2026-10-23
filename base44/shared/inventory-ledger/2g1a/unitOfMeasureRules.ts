// ═════════════════════════════════════════════════════════════════
// 2G1-A UNIT OF MEASURE RULES
// ═════════════════════════════════════════════════════════════════

import type { UnitOfMeasure2G1A } from "./eventTypes.ts";

export const VALID_UOMS: ReadonlySet<string> = new Set([
  "ea", "box", "case", "pallet", "ft", "in", "yd", "lb", "oz",
  "gal", "qt", "pt", "sheet", "roll", "set", "pair", "unit",
]);

export function isValidUOM(value: string): boolean {
  return VALID_UOMS.has(value);
}

export function isFiniteNumber(value: unknown): boolean {
  return typeof value === "number" && isFinite(value);
}

export function isPositiveFinite(value: number): boolean {
  return typeof value === "number" && isFinite(value) && value > 0;
}

export function isNonNegativeFinite(value: number): boolean {
  return typeof value === "number" && isFinite(value) && value >= 0;
}