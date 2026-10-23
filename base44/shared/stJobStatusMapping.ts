/**
 * ServiceTitan Job Status Normalization Service
 *
 * THE single authority for ALL ServiceTitan job status interpretation.
 *
 * Based on the verified ServiceTitan JPM v2 Jobs API JSON schema:
 *   jobStatus enum: "Scheduled", "Dispatched", "InProgress", "Hold",
 *                  "Completed", "Canceled"
 *
 * Design principles (mirrors stAppointmentStatusMapping.ts):
 *   1. Raw ServiceTitan status is ALWAYS preserved exactly as received.
 *   2. Normalized lifecycle status maps to entity-enum-compatible values only.
 *   3. mappingResult is one of:
 *        "mapped"      — status has a known mapping (normalizedStatus may be null for Hold)
 *        "unsupported" — status is well-formed but has no mapping (normalizedStatus is null)
 *        "invalid"     — incoming value is empty, malformed, or unusable (normalizedStatus is null)
 *   4. When normalizedStatus is null (unsupported, invalid, or Hold), the caller
 *      MUST leave the existing lifecycle status unchanged.
 *   5. No "unknown" lifecycle status is ever produced.
 *   6. Classification booleans (isCompleted, isCancelled, isOnHold, isActive)
 *      are determined HERE, never by inspecting raw strings in adapters/handlers.
 *
 * Job entity status enum (for reference):
 *   scheduled, assigned, in_progress, inspection_complete, estimate_sent,
 *   approved, invoiced, completed, cancelled
 *
 * Note: "Hold" maps to normalizedStatus=null because the Job entity has no
 * "on_hold" enum value. The LVC workflow status is preserved — only the
 * hold classification boolean and raw status are updated.
 */

// ─── Entity-compatible normalized lifecycle statuses ────────────────────────

export type NormalizedJobStatus =
  | "scheduled"
  | "assigned"
  | "in_progress"
  | "completed"
  | "cancelled";

// ─── Mapping result ─────────────────────────────────────────────────────────

export type JobStatusMappingResult = "mapped" | "unsupported" | "invalid";

// ─── Classification booleans ────────────────────────────────────────────────

export interface JobStatusClassification {
  isCompleted: boolean;
  isCancelled: boolean;
  isOnHold: boolean;
  isActive: boolean;
}

/**
 * Result of normalizing a job lifecycle status.
 *
 * - rawStatus: The exact ServiceTitan status string, never modified.
 * - normalizedStatus: The entity-enum-compatible value, or null if
 *   unsupported/invalid/Hold. When null, the caller MUST leave the existing
 *   lifecycle status unchanged.
 * - mappingResult: "mapped" | "unsupported" | "invalid".
 * - reason: Human-readable explanation (only when not mapped).
 * - isCompleted / isCancelled / isOnHold / isActive: Classification booleans
 *   determined by this service. Adapters and handlers must use these
 *   instead of inspecting the raw status string.
 */
export interface JobStatusNormalization extends JobStatusClassification {
  rawStatus: string;
  normalizedStatus: NormalizedJobStatus | null;
  mappingResult: JobStatusMappingResult;
  reason?: string;
}

// ─── Internal single-source classification ──────────────────────────────────
// THE single authority for status classification. No other code may inspect
// raw ServiceTitan status strings to determine completion, cancellation, or
// hold state — it must use the booleans returned by the normalization function.

function classifyJobStatus(raw: string): JobStatusClassification {
  // Exact canonical matching only — no substring/prefix logic.
  // ServiceTitan JPM v2 jobStatus enum: Scheduled, Dispatched, InProgress,
  // Hold, Completed, Canceled. Any other nonempty value is "unsupported"
  // (handled by the caller, not here).
  switch (raw) {
    case "Completed":
      return { isCompleted: true, isCancelled: false, isOnHold: false, isActive: false };
    case "Canceled":
      return { isCompleted: false, isCancelled: true, isOnHold: false, isActive: false };
    case "Hold":
      return { isCompleted: false, isCancelled: false, isOnHold: true, isActive: false };
    case "Scheduled":
    case "Dispatched":
    case "InProgress":
      return { isCompleted: false, isCancelled: false, isOnHold: false, isActive: true };
    default:
      return { isCompleted: false, isCancelled: false, isOnHold: false, isActive: false };
  }
}

// ─── Input coercion (safe for unknown types) ────────────────────────────────

interface CoercedJobInput {
  raw: string;
  isValidType: boolean;
}

function coerceJobInput(input: unknown): CoercedJobInput {
  if (typeof input === "string") {
    return { raw: input.trim(), isValidType: true };
  }
  if (input == null) {
    return { raw: "", isValidType: false };
  }
  if (typeof input === "number" || typeof input === "boolean" || typeof input === "bigint") {
    return { raw: String(input), isValidType: false };
  }
  try {
    const json = JSON.stringify(input);
    return { raw: json ?? "", isValidType: false };
  } catch {
    return { raw: String(input), isValidType: false };
  }
}

// ─── Normalization Service ───────────────────────────────────────────────────

/**
 * Normalize a raw ServiceTitan job status to an entity-compatible
 * lifecycle status.
 *
 * Verified mappings from ServiceTitan JPM v2 Jobs API schema:
 *   "Scheduled"  → "scheduled"
 *   "Dispatched" → "assigned"
 *   "InProgress" → "in_progress"
 *   "Hold"       → null (leave existing unchanged; isOnHold=true)
 *   "Completed"  → "completed"
 *   "Canceled"   → "cancelled"
 *
 * ALL sync paths must call this function. Domain adapters must NEVER
 * contain inline status-mapping or classification logic.
 */
export function normalizeJobStatus(rawStatus: unknown): JobStatusNormalization {
  const { raw, isValidType } = coerceJobInput(rawStatus);
  const classification = classifyJobStatus(isValidType ? raw : "");

  // ── Invalid: empty / missing / malformed / non-string incoming value ──
  if (!isValidType || !raw) {
    return {
      rawStatus: raw,
      normalizedStatus: null,
      mappingResult: "invalid",
      reason: isValidType
        ? "Incoming job status is empty or missing"
        : `Incoming job status is not a usable string (type: ${typeof rawStatus})`,
      ...classification,
    };
  }

  // Exact canonical matching against the ServiceTitan JPM v2 jobStatus enum.
  switch (raw) {
    case "Scheduled":
      return { rawStatus: raw, normalizedStatus: "scheduled", mappingResult: "mapped", ...classification };
    case "Dispatched":
      return { rawStatus: raw, normalizedStatus: "assigned", mappingResult: "mapped", ...classification };
    case "InProgress":
      return { rawStatus: raw, normalizedStatus: "in_progress", mappingResult: "mapped", ...classification };
    case "Hold":
      // Hold → null (Job entity has no "on_hold" enum; preserve existing LVC status)
      return {
        rawStatus: raw,
        normalizedStatus: null,
        mappingResult: "mapped",
        reason: "Hold status preserves existing LVC lifecycle status",
        ...classification,
      };
    case "Completed":
      return { rawStatus: raw, normalizedStatus: "completed", mappingResult: "mapped", ...classification };
    case "Canceled":
      return { rawStatus: raw, normalizedStatus: "cancelled", mappingResult: "mapped", ...classification };
    default:
      // ── Unsupported: well-formed but no mapping ──
      return {
        rawStatus: raw,
        normalizedStatus: null,
        mappingResult: "unsupported",
        reason: `No mapping found for ServiceTitan job status '${raw}'`,
        ...classification,
      };
  }
}

// ─── Backward-compatible predicate helpers ──────────────────────────────────

export function isJobCancellationStatus(rawStatus: unknown): boolean {
  const { raw, isValidType } = coerceJobInput(rawStatus);
  return classifyJobStatus(isValidType ? raw : "").isCancelled;
}

export function isJobCompletionStatus(rawStatus: unknown): boolean {
  const { raw, isValidType } = coerceJobInput(rawStatus);
  return classifyJobStatus(isValidType ? raw : "").isCompleted;
}

export function isJobHoldStatus(rawStatus: unknown): boolean {
  const { raw, isValidType } = coerceJobInput(rawStatus);
  return classifyJobStatus(isValidType ? raw : "").isOnHold;
}