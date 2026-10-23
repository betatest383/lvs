/**
 * ServiceTitan Appointment Status Normalization Service
 *
 * THE single authority for ALL ServiceTitan status interpretation:
 *   - Status classification (cancellation / completion / hold)
 *   - Lifecycle normalization (raw → entity-enum)
 *   - Dispatch status normalization
 *
 * All sync paths (incremental API, recovery scans, webhooks, future imports)
 * MUST call this service. No other code may inspect raw ServiceTitan status
 * strings — the classification booleans are returned as part of the result.
 *
 * Design principles:
 *   1. Raw ServiceTitan status is ALWAYS preserved exactly as received.
 *   2. Normalized lifecycle status maps to entity-enum-compatible values only.
 *   3. Mapping result is one of:
 *        "mapped"      — status has a known mapping (normalizedStatus is non-null)
 *        "unsupported" — status is well-formed but has no mapping (normalizedStatus is null)
 *        "invalid"     — incoming value is empty, malformed, or unusable (normalizedStatus is null)
 *   4. When normalizedStatus is null (unsupported or invalid), the caller MUST
 *      leave the existing lifecycle status unchanged.
 *   5. No "unknown" lifecycle status is ever produced.
 *   6. Classification booleans (isCancellation, isCompletion, isHold) are
 *      determined HERE, never by inspecting raw strings in adapters/handlers.
 */

// ─── Entity-compatible normalized lifecycle statuses ────────────────────────

export type NormalizedAppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "dispatched"
  | "started"
  | "completed"
  | "cancelled"
  | "on_hold";

// ─── Entity-compatible normalized dispatch statuses ─────────────────────────

export type NormalizedDispatchStatus =
  | "unassigned"
  | "assigned"
  | "dispatched"
  | "started"
  | "completed"
  | "cancelled";

// ─── Mapping result ─────────────────────────────────────────────────────────

export type StatusMappingResult = "mapped" | "unsupported" | "invalid";

// ─── Classification booleans ────────────────────────────────────────────────

export interface StatusClassification {
  isCancellation: boolean;
  isCompletion: boolean;
  isHold: boolean;
}

/**
 * Result of normalizing an appointment lifecycle status.
 *
 * - rawStatus: The exact ServiceTitan status string, never modified.
 * - normalizedStatus: The entity-enum-compatible value, or null if
 *   unsupported/invalid. When null, the caller MUST leave the existing
 *   lifecycle status unchanged.
 * - mappingResult: "mapped" | "unsupported" | "invalid".
 * - reason: Human-readable explanation (only when not mapped).
 * - isCancellation / isCompletion / isHold: Classification booleans
 *   determined by this service. Adapters and handlers must use these
 *   instead of inspecting the raw status string.
 */
export interface AppointmentStatusNormalization extends StatusClassification {
  rawStatus: string;
  normalizedStatus: NormalizedAppointmentStatus | null;
  mappingResult: StatusMappingResult;
  reason?: string;
}

/**
 * Result of normalizing a dispatch status.
 */
export interface DispatchStatusNormalization extends StatusClassification {
  rawStatus: string;
  normalizedDispatchStatus: NormalizedDispatchStatus | null;
  mappingResult: StatusMappingResult;
  reason?: string;
}

// ─── Internal single-source classification ──────────────────────────────────
// THE single authority for status classification. No other code may inspect
// raw ServiceTitan status strings to determine cancellation, completion, or
// hold state — it must use the booleans returned by the normalization functions.

function classifyStatus(raw: string): StatusClassification {
  if (!raw) {
    return { isCancellation: false, isCompletion: false, isHold: false };
  }
  const s = raw.toLowerCase();
  return {
    isCancellation: s.includes("cancel"),
    isCompletion: s.includes("complete") || s.includes("done") || s.includes("finish"),
    isHold: s.includes("on hold") || s === "hold",
  };
}

// ─── Input coercion (safe for unknown types) ────────────────────────────────
// Accepts any incoming value without throwing. Non-string types are classified
// as invalid but retain a safe audit representation for logging/debugging.

interface CoercedInput {
  /** Safe string representation for audit/logging. */
  raw: string;
  /** True only for genuine string values (post-trim may still be empty). */
  isValidType: boolean;
}

function coerceInput(input: unknown): CoercedInput {
  if (typeof input === "string") {
    return { raw: input.trim(), isValidType: true };
  }
  if (input == null) {
    return { raw: "", isValidType: false };
  }
  // Non-string primitives — coerce for audit, but mark invalid
  if (typeof input === "number" || typeof input === "boolean" || typeof input === "bigint") {
    return { raw: String(input), isValidType: false };
  }
  // Object, array, symbol, function — safe audit representation
  try {
    const json = JSON.stringify(input);
    return { raw: json ?? "", isValidType: false };
  } catch {
    return { raw: String(input), isValidType: false };
  }
}

// ─── Normalization Service ───────────────────────────────────────────────────

/**
 * Normalize a raw ServiceTitan appointment status to an entity-compatible
 * lifecycle status.
 *
 * ALL sync paths must call this function. Domain adapters must NEVER
 * contain inline status-mapping or classification logic.
 *
 * Behavior:
 *   - "invalid": empty/null/whitespace-only incoming value. normalizedStatus
 *     is null; the caller leaves the existing lifecycle status unchanged
 *     (or relies on the entity default for new records).
 *   - "mapped": the raw status maps to a known lifecycle state.
 *     normalizedStatus is the entity-enum-compatible value.
 *   - "unsupported": the raw status is well-formed but has no mapping.
 *     normalizedStatus is null; the caller leaves the existing lifecycle
 *     status unchanged and logs the unsupported status for review.
 *   - The raw status is ALWAYS preserved in the result.
 *   - Classification booleans are ALWAYS populated, even for invalid/unsupported.
 */
export function normalizeAppointmentStatus(
  rawStatus: unknown
): AppointmentStatusNormalization {
  const { raw, isValidType } = coerceInput(rawStatus);
  // Classification booleans are always populated. For non-string/invalid
  // types, classification is all-false to prevent accidental matches.
  const classification = classifyStatus(isValidType ? raw : "");

  // ── Invalid: empty / missing / malformed / non-string incoming value ──
  if (!isValidType || !raw) {
    return {
      rawStatus: raw,
      normalizedStatus: null,
      mappingResult: "invalid",
      reason: isValidType
        ? "Incoming status is empty or missing"
        : `Incoming status is not a usable string (type: ${typeof rawStatus})`,
      ...classification,
    };
  }

  const s = raw.toLowerCase();

  // Cancellation (both American and British spellings → "cancelled")
  if (classification.isCancellation) {
    return { rawStatus: raw, normalizedStatus: "cancelled", mappingResult: "mapped", ...classification };
  }

  // Completion
  if (classification.isCompletion) {
    return { rawStatus: raw, normalizedStatus: "completed", mappingResult: "mapped", ...classification };
  }

  // In progress / working / started → entity enum "started"
  if (s.includes("in progress") || s.includes("working") || s.includes("started")) {
    return { rawStatus: raw, normalizedStatus: "started", mappingResult: "mapped", ...classification };
  }

  // On hold → entity enum "on_hold"
  if (classification.isHold) {
    return { rawStatus: raw, normalizedStatus: "on_hold", mappingResult: "mapped", ...classification };
  }

  // Dispatched
  if (s.includes("dispatch")) {
    return { rawStatus: raw, normalizedStatus: "dispatched", mappingResult: "mapped", ...classification };
  }

  // Confirmed
  if (s.includes("confirm")) {
    return { rawStatus: raw, normalizedStatus: "confirmed", mappingResult: "mapped", ...classification };
  }

  // Scheduled / booked / pending
  if (s.includes("schedule") || s.includes("booked") || s.includes("pending")) {
    return { rawStatus: raw, normalizedStatus: "scheduled", mappingResult: "mapped", ...classification };
  }

  // ── Unsupported: well-formed but no mapping ──
  return {
    rawStatus: raw,
    normalizedStatus: null,
    mappingResult: "unsupported",
    reason: `No mapping found for ServiceTitan status '${raw}'`,
    ...classification,
  };
}

/**
 * Normalize a raw ServiceTitan appointment status to an entity-compatible
 * dispatch status.
 *
 * Behavior mirrors normalizeAppointmentStatus:
 *   - "invalid" for empty/missing values.
 *   - "mapped" for known statuses.
 *   - "unsupported" for well-formed but unmapped statuses.
 *   - Classification booleans are always populated.
 */
export function normalizeDispatchStatus(
  rawStatus: unknown
): DispatchStatusNormalization {
  const { raw, isValidType } = coerceInput(rawStatus);
  const classification = classifyStatus(isValidType ? raw : "");

  // ── Invalid: empty / missing / malformed / non-string incoming value ──
  if (!isValidType || !raw) {
    return {
      rawStatus: raw,
      normalizedDispatchStatus: null,
      mappingResult: "invalid",
      reason: isValidType
        ? "Incoming status is empty or missing"
        : `Incoming status is not a usable string (type: ${typeof rawStatus})`,
      ...classification,
    };
  }

  const s = raw.toLowerCase();

  // Cancellation
  if (classification.isCancellation) {
    return { rawStatus: raw, normalizedDispatchStatus: "cancelled", mappingResult: "mapped", ...classification };
  }

  // Completion
  if (classification.isCompletion) {
    return { rawStatus: raw, normalizedDispatchStatus: "completed", mappingResult: "mapped", ...classification };
  }

  // In progress / working / started
  if (s.includes("in progress") || s.includes("working") || s.includes("started")) {
    return { rawStatus: raw, normalizedDispatchStatus: "started", mappingResult: "mapped", ...classification };
  }

  // Dispatched / en route / arrived
  if (s.includes("dispatch") || s.includes("en route") || s.includes("arrived")) {
    return { rawStatus: raw, normalizedDispatchStatus: "dispatched", mappingResult: "mapped", ...classification };
  }

  // Confirmed / assigned
  if (s.includes("confirm") || s.includes("assign")) {
    return { rawStatus: raw, normalizedDispatchStatus: "assigned", mappingResult: "mapped", ...classification };
  }

  // Scheduled / booked / pending
  if (s.includes("schedule") || s.includes("booked") || s.includes("pending")) {
    return { rawStatus: raw, normalizedDispatchStatus: "unassigned", mappingResult: "mapped", ...classification };
  }

  // ── Unsupported: well-formed but no mapping ──
  return {
    rawStatus: raw,
    normalizedDispatchStatus: null,
    mappingResult: "unsupported",
    reason: `No dispatch mapping found for ServiceTitan status '${raw}'`,
    ...classification,
  };
}

// ─── Backward-compatible predicate helpers ──────────────────────────────────
// These delegate to classifyStatus — the single classification authority.
// Existing webhook handlers may continue to use them. New code should prefer
// the booleans returned by normalizeAppointmentStatus / normalizeDispatchStatus.

/**
 * Determine if a status change represents a cancellation.
 */
export function isCancellationStatus(rawStatus: unknown): boolean {
  const { raw, isValidType } = coerceInput(rawStatus);
  return classifyStatus(isValidType ? raw : "").isCancellation;
}

/**
 * Determine if a status change represents a completion.
 */
export function isCompletionStatus(rawStatus: unknown): boolean {
  const { raw, isValidType } = coerceInput(rawStatus);
  return classifyStatus(isValidType ? raw : "").isCompletion;
}

/**
 * Determine if a status represents a hold.
 */
export function isHoldStatus(rawStatus: unknown): boolean {
  const { raw, isValidType } = coerceInput(rawStatus);
  return classifyStatus(isValidType ? raw : "").isHold;
}