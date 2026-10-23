/**
 * ServiceTitan Sync — Shared Utilities
 *
 * Pure functions extracted from domain-specific modules where the logic
 * was identical across Customer Sync and Appointment Sync.
 *
 * These utilities do NOT depend on the Base44 SDK or any domain-specific
 * types — they are safe to use from any sync module or adapter.
 */

import type { SyncPaginationState, SourceVersionComparison } from "./stSyncAdapter.ts";

// ─── String Extraction ──────────────────────────────────────────────────────

/**
 * Extract a trimmed string value from a payload, trying multiple key names.
 * Returns the first non-empty value found, or "" if none match.
 */
export function getString(payload: any, ...keys: string[]): string {
  for (const k of keys) {
    if (payload[k] != null && String(payload[k]).trim()) {
      return String(payload[k]).trim();
    }
  }
  return "";
}

// ─── Timestamp Parsing ──────────────────────────────────────────────────────

/**
 * Parse a timestamp string and return the epoch milliseconds.
 * Returns NaN if the value is empty or unparseable.
 */
export function parseTimestamp(value: string | null | undefined): number {
  if (!value) return NaN;
  const str = String(value).trim();
  if (!str) return NaN;
  return new Date(str).getTime();
}

/**
 * Check if a timestamp string is valid (non-empty and parseable).
 */
export function isValidTimestamp(value: string | null | undefined): boolean {
  return !isNaN(parseTimestamp(value));
}

// ─── Stale-Source Comparison ─────────────────────────────────────────────────

/**
 * Compare incoming source modifiedOn against the local source modifiedOn.
 *
 * Rules:
 *   - Older incoming source data must be rejected ("older").
 *   - Equal timestamps may proceed to equality comparison ("equal").
 *   - Invalid incoming timestamps must fail closed when local data exists
 *     ("invalid_incoming").
 *   - Invalid local timestamps are reported but do not block ("invalid_local").
 *   - Missing timestamps on both sides must not silently overwrite newer
 *     records ("unavailable").
 *
 * @returns One of: newer, equal, older, invalid_incoming, invalid_local, unavailable
 */
export function compareSourceVersions(params: {
  incomingModifiedOn: string | null;
  localModifiedOn: string | null;
}): SourceVersionComparison {
  const { incomingModifiedOn, localModifiedOn } = params;

  const incomingTime = parseTimestamp(incomingModifiedOn);
  const localTime = parseTimestamp(localModifiedOn);

  const incomingValid = !isNaN(incomingTime);
  const localValid = !isNaN(localTime);

  // Both missing/invalid — cannot determine order
  if (!incomingValid && !localValid) return "unavailable";

  // Incoming is invalid but local exists — fail closed
  if (!incomingValid && localValid) return "invalid_incoming";

  // Incoming is valid but local is invalid — allow incoming (no local to protect)
  if (incomingValid && !localValid) return "newer";

  // Both valid — compare
  if (incomingTime > localTime) return "newer";
  if (incomingTime < localTime) return "older";
  return "equal";
}

// ─── Event Ordering (legacy field-name compat) ──────────────────────────────

/**
 * Check if an incoming webhook event is stale (older than the last
 * ServiceTitan event that updated the existing record).
 *
 * Uses servicetitan_last_event_at from the existing record.
 * For adapter-based domains, prefer compareSourceVersions() instead.
 *
 * @returns true if the event is stale and should be ignored
 */
export function isStaleEvent(
  existing: any,
  incomingEventAt: string | null
): boolean {
  if (!incomingEventAt) return false;
  const existingEventAt = existing?.servicetitan_last_event_at;
  if (!existingEventAt) return false;

  const incomingTime = parseTimestamp(incomingEventAt);
  const existingTime = parseTimestamp(existingEventAt);

  if (isNaN(incomingTime) || isNaN(existingTime)) return false;

  return incomingTime < existingTime;
}

// ─── Conflict Detection ─────────────────────────────────────────────────────

/**
 * Detect which ST-controlled fields changed between the current record
 * and the incoming data.
 *
 * Compares field values as strings (null → ""). Only fields present in
 * the incoming data AND in the fieldList are checked.
 *
 * @returns array of field names that changed
 */
export function detectChangedFields(
  current: any,
  incoming: Record<string, any>,
  fieldList: string[]
): string[] {
  const changed: string[] = [];
  for (const field of fieldList) {
    if (!(field in incoming)) continue;
    const currentVal = current[field] ?? null;
    const newVal = incoming[field] ?? null;

    const currentStr = currentVal === null ? "" : String(currentVal);
    const newValStr = newVal === null ? "" : String(newVal);

    if (currentStr !== newValStr) {
      changed.push(field);
    }
  }
  return changed;
}

// ─── Conflict History ───────────────────────────────────────────────────────

/**
 * Append conflict records for overwritten local values.
 *
 * Only records fields that had a non-empty local value that differs from
 * the incoming ServiceTitan value. Records both previous and new values.
 *
 * No conflict record is created when:
 *   - The value is unchanged
 *   - The incoming field is omitted (not in changedFields)
 *   - The existing value is empty
 *
 * @returns The updated JSON string, or null if no conflicts were added
 */
export function appendConflictHistory(
  current: any,
  incoming: Record<string, any>,
  changedFields: string[],
  event: any
): string | null {
  if (changedFields.length === 0) return current.sync_conflict_history_json || null;

  let history: any[] = [];
  try {
    history = current.sync_conflict_history_json ? JSON.parse(current.sync_conflict_history_json) : [];
  } catch {
    history = [];
  }

  const syncedAt = new Date().toISOString();
  for (const field of changedFields) {
    const prev = current[field];
    if (prev === null || prev === undefined || String(prev).trim() === "") continue;
    const newVal = incoming[field];
    history.push({
      webhook_event_id: event?.id || "",
      event_type: event?.event_type || "",
      field,
      previous_value: String(prev),
      new_value: String(newVal ?? ""),
      synced_at: syncedAt,
    });
  }

  return history.length > 0 ? JSON.stringify(history) : null;
}

// ─── Deterministic Record Sorting ──────────────────────────────────────────

/**
 * Sort records deterministically by createdOn (ascending), then by the
 * ServiceTitan entity ID (ascending as string).
 *
 * This stable ordering ensures that recovery scans process records in
 * the same order across retries, preventing cursor-advancement races.
 *
 * Records with null/missing createdOn sort last.
 */
export function sortRecordsDeterministic<TSource>(
  records: TSource[],
  getCreatedOn: (record: TSource) => string | null,
  getId: (record: TSource) => string | null
): TSource[] {
  return [...records].sort((a, b) => {
    const aCreated = getCreatedOn(a) || "";
    const bCreated = getCreatedOn(b) || "";
    if (aCreated !== bCreated) {
      // Empty createdOn sorts last
      if (!aCreated) return 1;
      if (!bCreated) return -1;
      return aCreated.localeCompare(bCreated);
    }
    const aId = getId(a) || "";
    const bId = getId(b) || "";
    return aId.localeCompare(bId);
  });
}

// ─── Pagination Helpers ──────────────────────────────────────────────────────

/**
 * Advance page-based pagination to the next page.
 */
export function nextPageState(state: Extract<SyncPaginationState, { mode: "page" }>): SyncPaginationState {
  return { mode: "page", page: state.page + 1, pageSize: state.pageSize };
}

/**
 * Advance continuation-token pagination with a new token.
 */
export function nextContinuationState(token: string | null, pageSize?: number): SyncPaginationState {
  return { mode: "continuation", continuationToken: token, pageSize };
}