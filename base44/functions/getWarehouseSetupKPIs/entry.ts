import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ─── Role authorization ───
// KPI access is read-only and must NOT grant inventory mutation rights.
// Oversight roles can view KPIs; only Owner/Admin can configure targets.
const KPI_VIEW_ROLES = [
  'admin', 'owner', 'director_of_operations', 'operations_manager',
  'warehouse_manager', 'inventory_specialist',
];
const KPI_CONFIG_ROLES = ['admin', 'owner'];

function normalizeRole(raw) {
  if (!raw) return '';
  return String(raw).trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

async function resolveUserRole(base44, user) {
  if (user.role === 'admin') return 'admin';
  const employees = await base44.asServiceRole.entities.EmployeeRegistry.filter({
    $or: [{ email: user.email }, { login_email: user.email }],
  });
  const employee = employees[0];
  if (!employee) return normalizeRole(user.role) || 'user';
  return normalizeRole(employee.primary_role || '');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const {
      action = 'get_kpis',
      warehouse, session_id, employee, category, status,
      date_from, date_to,
      target_key, target_value, alert_threshold,
    } = body;
    const roleKey = await resolveUserRole(base44, user);

    // ─── Permission gate ───
    if (!KPI_VIEW_ROLES.includes(roleKey)) {
      console.log(`[BYPASS AUDIT] DENIED user=${user.email} role=${roleKey} action=kpi_${action}`);
      return Response.json({ error: 'Access denied. KPI access requires an oversight role.' }, { status: 403 });
    }

    // ═══════════════════════════════════════════════════════════════
    // CONFIGURE KPI TARGETS — Owner/Admin only
    // ═══════════════════════════════════════════════════════════════
    if (action === 'configure_target') {
      if (!KPI_CONFIG_ROLES.includes(roleKey)) {
        return Response.json({ error: 'Only Owner/Admin can configure KPI targets' }, { status: 403 });
      }
      // Store KPI targets in CompanyPricingSettings-like singleton or KpiRegistry
      // For now, we store in KpiRegistry
      const existing = await base44.asServiceRole.entities.KpiRegistry.filter({ kpi_id: target_key }, null, 1);
      if (existing.length > 0) {
        const updated = await base44.asServiceRole.entities.KpiRegistry.update(existing[0].id, {
          target_value: target_value,
          alert_threshold: alert_threshold,
          notes: `Configured by ${user.email} on ${new Date().toISOString()}`,
        });
        return Response.json({ success: true, target: updated });
      }
      const created = await base44.asServiceRole.entities.KpiRegistry.create({
        kpi_id: target_key,
        title: target_key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        target_value: target_value,
        alert_threshold: alert_threshold,
        notes: `Configured by ${user.email} on ${new Date().toISOString()}`,
      });
      return Response.json({ success: true, target: created });
    }

    // ═══════════════════════════════════════════════════════════════
    // GET KPIs — server-calculated, never direct entity queries from frontend
    // ═══════════════════════════════════════════════════════════════

    // Build session filter from request
    const sessionFilter = {};
    if (status) sessionFilter.status = status;
    if (employee) sessionFilter.started_by = employee;
    if (warehouse) sessionFilter.warehouse_location_id = warehouse;
    if (session_id) sessionFilter.id = session_id;
    if (date_from || date_to) {
      sessionFilter.started_at = {};
      if (date_from) sessionFilter.started_at.$gte = date_from;
      if (date_to) sessionFilter.started_at.$lte = date_to;
    }

    // Fetch data in parallel — locations, bins, transactions are small datasets
    const [sessions, locations, bins, transactions, kpiTargets] = await Promise.all([
      base44.asServiceRole.entities.InventoryCountSession.filter(sessionFilter, '-created_date', 200),
      base44.asServiceRole.entities.WarehouseLocation.filter({ is_active: true }, null, 500),
      base44.asServiceRole.entities.BinLocation.filter({}, null, 500),
      base44.asServiceRole.entities.InventoryTransaction.filter({}, '-created_date', 500),
      base44.asServiceRole.entities.KpiRegistry.filter({}, null, 50),
    ]);

    // ─── Paginated count of InventoryMaster (SDK caps at 500 per call) ───
    let totalInventoryItems = 0;
    let itemsWithBins = 0;
    const inventoryItemMap = new Map();
    {
      let skip = 0;
      const batchSize = 500;
      while (true) {
        const batch = await base44.asServiceRole.entities.InventoryMaster.filter(
          {}, '-created_date', batchSize, skip
        );
        for (const m of batch) {
          const isActive = m.is_active !== false && m.status !== 'Inactive' && m.status !== 'Discontinued';
          if (isActive) {
            totalInventoryItems++;
            if (m.bin_location_id || m.default_bin_location_id) itemsWithBins++;
            inventoryItemMap.set(m.id, m);
          }
        }
        if (batch.length < batchSize) break;
        skip += batchSize;
        if (skip > 20000) break;
      }
    }
    const inventoryItems = Array.from(inventoryItemMap.values());

    // ─── Calculate KPIs ───
    const totalSessions = sessions.length;
    const completedSessions = sessions.filter(s => s.status === 'completed').length;
    const awaitingReviewSessions = sessions.filter(s => s.status === 'awaiting_review').length;
    const partiallyPostedSessions = sessions.filter(s => s.status === 'partially_posted').length;
    const approvedSessions = sessions.filter(s => s.status === 'approved').length;
    const inProgressSessions = sessions.filter(s => s.status === 'in_progress').length;
    const abandonedSessions = sessions.filter(s => s.status === 'abandoned').length;

    // 1. Overall setup completion %
    const overallCompletion = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;

    // 2. Locations and bins created
    const locationsCreated = locations.length;
    const binsCreated = bins.length;

    // 3. Items counted / total (totalInventoryItems computed by paginated loop above)
    const countedItemIds = new Set();
    for (const s of sessions) {
      const counts = s.count_data_json ? JSON.parse(s.count_data_json) : {};
      Object.keys(counts).forEach(id => countedItemIds.add(id));
    }
    const itemsCounted = countedItemIds.size;
    const itemsCountedPct = totalInventoryItems > 0 ? Math.round((itemsCounted / totalInventoryItems) * 100) : 0;

    // 4. Items assigned to bins / total (itemsWithBins computed by paginated loop above)
    const itemsAssignedPct = totalInventoryItems > 0 ? Math.round((itemsWithBins / totalInventoryItems) * 100) : 0;

    // 5. Items posted / counted
    const postedTxnItemIds = new Set(
      transactions
        .filter(t => t.transaction_type === 'opening_balance' || t.source_document_type === 'count_session')
        .map(t => t.inventory_master_id)
    );
    const itemsPosted = postedTxnItemIds.size;
    const itemsPostedPct = itemsCounted > 0 ? Math.round((itemsPosted / itemsCounted) * 100) : 0;

    // 6. Sessions awaiting approval (already calculated)

    // 7. Partial and failed sessions
    const partialAndFailed = partiallyPostedSessions;
    const failedItemsCount = sessions.reduce((sum, s) => {
      const results = s.activation_results_json ? JSON.parse(s.activation_results_json) : [];
      return sum + results.filter(r => !r.success).length;
    }, 0);

    // 8. Items processed per hour
    let totalProcessingMs = 0;
    let totalProcessedItems = 0;
    for (const s of sessions) {
      if (s.activation_started_at && (s.status === 'completed' || s.status === 'partially_posted')) {
        const results = s.activation_results_json ? JSON.parse(s.activation_results_json) : [];
        totalProcessedItems += results.filter(r => r.success).length;
        const endTime = s.completed_at || s.updated_date;
        if (endTime) {
          totalProcessingMs += new Date(endTime) - new Date(s.activation_started_at);
        }
      }
    }
    const totalProcessingHours = totalProcessingMs / (1000 * 60 * 60);
    const itemsPerHour = totalProcessingHours > 0 ? Math.round(totalProcessedItems / totalProcessingHours) : 0;

    // 9. Average session duration
    let totalDurationMs = 0;
    let durationCount = 0;
    for (const s of sessions) {
      if (s.started_at && s.completed_at) {
        totalDurationMs += new Date(s.completed_at) - new Date(s.started_at);
        durationCount++;
      }
    }
    const avgSessionDurationMin = durationCount > 0 ? Math.round(totalDurationMs / durationCount / (1000 * 60)) : 0;

    // 10. Quantity variance rate and total absolute variance
    let totalAbsoluteVariance = 0;
    let varianceCount = 0;
    for (const s of sessions) {
      if (s.status === 'completed' && s.approval_snapshot_json) {
        const snapshot = JSON.parse(s.approval_snapshot_json);
        for (const itemId of Object.keys(snapshot)) {
          const item = inventoryItems.find(i => i.id === itemId);
          if (item) {
            const countedQty = snapshot[itemId].count || 0;
            const actualQty = item.quantity_owned || 0;
            const variance = Math.abs(actualQty - countedQty);
            totalAbsoluteVariance += variance;
            if (variance > 0) varianceCount++;
          }
        }
      }
    }
    const varianceRate = itemsCounted > 0 ? Math.round((varianceCount / itemsCounted) * 100) : 0;

    // 11. Unresolved discrepancies
    const unresolvedDiscrepancies = sessions.filter(s =>
      s.status === 'partially_posted' ||
      (s.activation_results_json && JSON.parse(s.activation_results_json).some(r => !r.success))
    ).length;

    // 12. Audit-record coverage %
    const auditCoverage = itemsCounted > 0 ? Math.round((itemsPosted / itemsCounted) * 100) : 0;

    // 13. Rework rate (sessions returned for correction / total)
    const reworkSessions = sessions.filter(s => (s.return_count || 0) > 0).length;
    const reworkRate = totalSessions > 0 ? Math.round((reworkSessions / totalSessions) * 100) : 0;

    // ─── KPI targets map ───
    const targetMap = {};
    for (const t of kpiTargets) {
      targetMap[t.kpi_id] = {
        target_value: t.target_value,
        alert_threshold: t.alert_threshold,
      };
    }

    return Response.json({
      success: true,
      kpis: {
        overall_completion_pct: { value: overallCompletion, target: targetMap.overall_completion_pct?.target_value || 100 },
        locations_created: { value: locationsCreated, target: targetMap.locations_created?.target_value || null },
        bins_created: { value: binsCreated, target: targetMap.bins_created?.target_value || null },
        items_counted: { value: itemsCounted, total: totalInventoryItems, pct: itemsCountedPct, target: targetMap.items_counted?.target_value || null },
        items_assigned_to_bins: { value: itemsWithBins, total: totalInventoryItems, pct: itemsAssignedPct, target: targetMap.items_assigned_to_bins?.target_value || null },
        items_posted: { value: itemsPosted, counted: itemsCounted, pct: itemsPostedPct, target: targetMap.items_posted?.target_value || null },
        sessions_awaiting_approval: { value: awaitingReviewSessions, target: targetMap.sessions_awaiting_approval?.target_value || 0 },
        partial_and_failed_sessions: { value: partialAndFailed, failed_items: failedItemsCount, target: targetMap.partial_and_failed_sessions?.target_value || 0 },
        items_per_hour: { value: itemsPerHour, target: targetMap.items_per_hour?.target_value || null },
        avg_session_duration_minutes: { value: avgSessionDurationMin, target: targetMap.avg_session_duration_minutes?.target_value || null },
        quantity_variance_rate_pct: { value: varianceRate, target: targetMap.quantity_variance_rate_pct?.target_value || 0 },
        total_absolute_variance: { value: totalAbsoluteVariance, target: targetMap.total_absolute_variance?.target_value || 0 },
        unresolved_discrepancies: { value: unresolvedDiscrepancies, target: targetMap.unresolved_discrepancies?.target_value || 0 },
        audit_record_coverage_pct: { value: auditCoverage, target: targetMap.audit_record_coverage_pct?.target_value || 100 },
        rework_rate_pct: { value: reworkRate, target: targetMap.rework_rate_pct?.target_value || 0 },
      },
      session_summary: {
        total: totalSessions,
        in_progress: inProgressSessions,
        awaiting_review: awaitingReviewSessions,
        approved: approvedSessions,
        partially_posted: partiallyPostedSessions,
        completed: completedSessions,
        abandoned: abandonedSessions,
      },
      filters_applied: { warehouse, session_id, employee, category, status, date_from, date_to },
      computed_at: new Date().toISOString(),
      computed_by: user.email,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});