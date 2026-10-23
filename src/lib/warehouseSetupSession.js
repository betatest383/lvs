import { base44 } from '@/api/base44Client';

const LOCAL_SESSION_KEY = 'wh-setup-session';

// ─── Session-scoped localStorage cache (namespaced by session ID) ───
function countsKey(sessionId) {
  return sessionId ? `wh-setup-counts-${sessionId}` : 'wh-setup-counts';
}

export function loadLocalCounts(sessionId) {
  try {
    const key = countsKey(sessionId);
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch { return {}; }
}
export function saveLocalCounts(sessionId, counts) {
  try { localStorage.setItem(countsKey(sessionId), JSON.stringify(counts)); } catch {}
}
export function clearLocal(sessionId) {
  try {
    if (sessionId) localStorage.removeItem(countsKey(sessionId));
    // Also clear legacy global keys
    localStorage.removeItem('wh-setup-counts');
    localStorage.removeItem(LOCAL_SESSION_KEY);
    localStorage.removeItem('wh-setup-migrated');
  } catch {}
}
export function clearAllLocalSessions() {
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('wh-setup-counts-') || k === 'wh-setup-counts' || k === 'wh-setup-session' || k === 'wh-setup-migrated') {
        localStorage.removeItem(k);
      }
    });
  } catch {}
}

// ═════════════════════════════════════════════════════════════════
// ALL session operations route through the protected backend function
// manageInventoryCountSession — no direct entity CRUD from the browser.
// ═════════════════════════════════════════════════════════════════

async function invoke(action, payload = {}) {
  const res = await base44.functions.invoke('manageInventoryCountSession', { action, ...payload });
  return res.data || res;
}

export async function loadActiveSession() {
  try {
    const data = await invoke('load_active');
    const session = data.session;
    const counts = data.counts || {};

    if (session) saveLocalCounts(session.id, counts);
    return { session, counts, hasUnfinished: data.has_unfinished || false };
  } catch (e) {
    console.error('Failed to load session:', e);
    return { session: null, counts: {}, hasUnfinished: false };
  }
}

export async function loadSessionById(sessionId) {
  const data = await invoke('get', { session_id: sessionId });
  let session = data.session;
  const counts = data.counts || {};

  // ── Sync: if awaiting_review but the approval task is already completed,
  // sync the session to approved state. This prevents the desync that occurs
  // when an approver completes the task from the Task Center instead of
  // using the wizard's Approve button. ──
  if (session && session.status === 'awaiting_review') {
    try {
      const syncRes = await invoke('sync_task_approval', { session_id: sessionId });
      if (syncRes.synced && syncRes.session) {
        session = syncRes.session;
      }
    } catch (e) {
      console.error('Failed to sync task approval:', e);
    }
  }

  if (session) saveLocalCounts(session.id, counts);
  return { session, counts };
}

export async function createSession(archiveExistingId = null) {
  const data = await invoke('create_session', { archive_existing_session_id: archiveExistingId });
  const session = data.session;
  // Clear ALL legacy localStorage for the new session
  clearAllLocalSessions();
  if (session) saveLocalCounts(session.id, data.counts || {});
  return { session, counts: data.counts || {} };
}

export async function archiveSession(sessionId) {
  const data = await invoke('archive_session', { session_id: sessionId });
  return data.session;
}

export async function duplicateSession(sessionId) {
  const data = await invoke('duplicate_session', { session_id: sessionId });
  return { session: data.session, counts: data.counts || {} };
}

export async function deleteSession(sessionId) {
  await invoke('delete_session', { session_id: sessionId });
  return true;
}

export async function persistStep(sessionId, step) {
  if (!sessionId) return;
  try {
    await invoke('update_step', { session_id: sessionId, step });
  } catch (e) {
    console.error('Failed to persist step:', e);
  }
}

export async function setWarehouse(sessionId, locationId, locationName) {
  if (!sessionId) return null;
  const data = await invoke('set_warehouse', { session_id: sessionId, warehouse_location_id: locationId, warehouse_location_name: locationName });
  return data.session;
}

export async function selectWarehouse(sessionId, warehouseLocationId, forceReset = false) {
  if (!sessionId || !warehouseLocationId) return null;
  const data = await invoke('select_warehouse', { session_id: sessionId, warehouse_location_id: warehouseLocationId, force_reset: forceReset });
  return data;
}

export async function checkWarehouseSession(warehouseLocationId, excludeSessionId = null) {
  const data = await invoke('check_warehouse_session', { warehouse_location_id: warehouseLocationId, exclude_session_id: excludeSessionId });
  return data;
}

export async function startAnotherSession(warehouseLocationId, warehouseLocationName, existingSessionIds, reason) {
  const data = await invoke('start_another_session', {
    warehouse_location_id: warehouseLocationId,
    warehouse_location_name: warehouseLocationName,
    existing_session_ids: existingSessionIds || [],
    reason: reason || '',
  });
  const session = data.session;
  if (session) saveLocalCounts(session.id, data.counts || {});
  return { session, counts: data.counts || {} };
}

export async function recordAssignments(sessionId, itemIds) {
  if (!sessionId || !itemIds?.length) return null;
  const data = await invoke('record_assignments', { session_id: sessionId, item_ids: itemIds });
  return data.session;
}

export async function confirmNoMaterials(sessionId) {
  if (!sessionId) return null;
  const data = await invoke('confirm_no_materials', { session_id: sessionId });
  return data.session;
}

export async function persistCounts(sessionId, counts) {
  if (!sessionId) return;
  try {
    await invoke('save_counts', { session_id: sessionId, counts });
    saveLocalCounts(sessionId, counts);
  } catch (e) {
    console.error('Failed to persist counts:', e);
    saveLocalCounts(sessionId, counts);
  }
}

export async function submitForReview(sessionId) {
  const data = await invoke('submit_for_review', { session_id: sessionId });
  return data.session;
}

// ─── Canonical approval action — all entry points must call this ───
// Replaces direct manageInventoryCountSession approve/reject for the
// opening-balance approval decision. Coordinates session + task +
// notification reconciliation in one server-side operation.
export async function approveWarehouseOpeningBalance(sessionId, decision, reason = '') {
  const res = await base44.functions.invoke('approveWarehouseOpeningBalance', {
    session_id: sessionId,
    decision,
    reason,
    idempotency_key: `warehouse-opening-approval:${sessionId}:${decision}`,
  });
  return res.data || res;
}

// Legacy wrappers — route through the canonical action
export async function approveCounts(sessionId) {
  const data = await approveWarehouseOpeningBalance(sessionId, 'approve');
  return { session: data.session, summary: data.server_calculated };
}

export async function rejectCounts(sessionId, reason) {
  const data = await approveWarehouseOpeningBalance(sessionId, 'return_for_correction', reason);
  return data.session;
}

export async function activateSession(sessionId) {
  const data = await invoke('activate', { session_id: sessionId });
  return { session: data.session, results: data.results, summary: data.summary };
}

export async function resolveActivationException(sessionId, itemId, resolutionNotes) {
  const data = await invoke('resolve_activation_exception', { session_id: sessionId, item_id: itemId, resolution_notes: resolutionNotes });
  return data.session;
}

export async function classifySession(sessionId, classification, reason) {
  const data = await invoke('classify_session', { session_id: sessionId, classification, reason });
  return data.session;
}

// ─── Stock & Count: atomic bin assignment + count save via dedicated backend function ───
export async function stockAndCount(sessionId, inventoryMasterId, destinationBinId, openingQuantity, photoIds, notes) {
  const res = await base44.functions.invoke('stock_and_count_session_item', {
    session_id: sessionId,
    inventory_master_id: inventoryMasterId,
    destination_bin_id: destinationBinId,
    opening_quantity: openingQuantity,
    photo_ids: photoIds || [],
    notes: notes || '',
  });
  return res.data || res;
}