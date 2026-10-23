/**
 * ServiceTitan Customer Conflict Detection
 *
 * Detects which ST-controlled fields changed between the current record
 * and incoming data, and records overwritten local values in the
 * sync_conflict_history_json append-only audit trail.
 */

// ─── Fields controlled by ServiceTitan (may overwrite local edits with audit) ─

export const ST_CONTROLLED_FIELDS = [
  "name",
  "company",
  "customer_type",
  "email",
  "alt_email",
  "phone",
  "alt_phone",
  "address",
  "city",
  "state",
  "zip",
  "billing_address",
  "billing_city",
  "billing_state",
  "billing_zip",
  "status",
  "servicetitan_customer_id",
  "servicetitan_tenant_id",
];

// ─── Conflict Detection ──────────────────────────────────────────────────────

/**
 * Detect which ST-controlled fields changed between the current record and
 * the incoming data.
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

/**
 * Append conflict records for overwritten local values.
 * Only records fields that had a non-empty local value that differs from the
 * incoming ServiceTitan value. Records both previous and new values for audit.
 *
 * No conflict record is created when:
 * - The value is unchanged
 * - The incoming field is omitted (not in changedFields)
 * - The incoming webhook is stale (caller must check before calling this)
 * - The existing value is empty
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