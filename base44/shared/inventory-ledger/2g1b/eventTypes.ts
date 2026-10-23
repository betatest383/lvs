// ═════════════════════════════════════════════════════════════════
// 2G1-B EVENT TYPES
// Extends 2G1-A DomainErrorCode2G1A with two new error codes.
// Isolated module: no SDK, no entity/auth, no network, no production deps.
// ═════════════════════════════════════════════════════════════════

import type { DomainErrorCode2G1A } from "../2g1a/eventTypes.ts";

// ─── Extended error codes (§5.1) ───
export type DomainErrorCode2G1B =
  | DomainErrorCode2G1A
  | "TRANSFER.RECEIVE_EXCEEDS_REMAINING"
  | "AUTHORIZATION.EVENT_OUT_OF_2G1B_SCOPE";