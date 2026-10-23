import React, { useMemo, useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, Package, Hash, MapPin, ShieldCheck, Loader2, XCircle, Send, RotateCcw, Camera, TrendingDown, FileText } from 'lucide-react';
import { base44 } from '@/api/base44Client';

function StatCard({ label, value, icon: Icon, variant = 'default' }) {
  const colors = { default: 'text-foreground', success: 'text-green-600', warning: 'text-amber-600', danger: 'text-red-600' };
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg border bg-card">
      <div className="p-2 rounded-md bg-muted/50"><Icon className={`w-5 h-5 ${colors[variant]}`} /></div>
      <div><p className={`text-2xl font-bold ${colors[variant]}`}>{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
    </div>
  );
}

export default function StepReview({ counts, locations, bins, session, userEmail, onSubmitForReview, onApprove, onReject, onReturnToCounts, permissions, wizardSubmitting = false }) {
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [assignedItems, setAssignedItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Fetch actual InventoryMaster records for session-assigned item IDs to verify bin assignments
  useEffect(() => {
    const ids = session?.assigned_item_ids || [];
    if (ids.length === 0) { setAssignedItems([]); return; }
    let cancelled = false;
    setLoadingItems(true);
    (async () => {
      try {
        const fetched = await Promise.all(ids.map(id => base44.entities.InventoryMaster.get(id).catch(() => null)));
        if (!cancelled) setAssignedItems(fetched.filter(Boolean));
      } catch (e) { console.error('Failed to fetch assigned items:', e); }
      finally { if (!cancelled) setLoadingItems(false); }
    })();
    return () => { cancelled = true; };
  }, [session?.assigned_item_ids, session?.id]);

  const stats = useMemo(() => {
    // ── Fully session-scoped: derive all metrics from session.assigned_item_ids + counts ──
    const assignedIds = new Set(session?.assigned_item_ids || []);
    const noMaterialsConfirmed = session?.no_materials_confirmed || false;
    const sessionAssignedCount = noMaterialsConfirmed ? 0 : assignedIds.size;

    // Only count entries for items assigned in THIS session
    const sessionCountEntries = Object.entries(counts).filter(([itemId]) => assignedIds.has(itemId));
    const countedEntries = sessionCountEntries.filter(([, v]) => v?.count !== undefined && v?.count !== '');
    const countedCount = countedEntries.length;
    const totalQty = countedEntries.reduce((sum, [, v]) => sum + Number(v.count || 0), 0);
    const zeroCountItems = countedEntries.filter(([, v]) => Number(v.count) === 0).length;
    const missingCount = Math.max(0, sessionAssignedCount - countedCount);

    // ── Missing Bin: verify each assigned item has a valid bin in THIS session's warehouse ──
    const sessionWarehouseId = session?.warehouse_location_id;
    const binsById = new Map((bins || []).map(b => [b.id, b]));
    const countedIds = new Set(countedEntries.map(([id]) => id));
    const fetchedIds = new Set(assignedItems.map(i => i.id));

    const missingBinItems = [];
    for (const item of assignedItems) {
      if (!assignedIds.has(item.id)) continue;
      const binId = item.bin_location_id;
      const reasons = [];
      if (!binId) {
        reasons.push('No bin assigned');
      } else {
        const bin = binsById.get(binId);
        if (!bin) {
          reasons.push('Referenced bin no longer exists');
        } else if (sessionWarehouseId && bin.warehouse_location_id !== sessionWarehouseId) {
          reasons.push(`Bin belongs to another warehouse (${bin.warehouse_location_name || bin.warehouse_location_id})`);
        }
      }
      if (!item.is_stocked_inventory_item && !noMaterialsConfirmed) {
        reasons.push('Item no longer marked as stocked inventory');
      }
      if (reasons.length > 0) {
        missingBinItems.push({ id: item.id, name: item.item_name || 'Unknown', sku: item.sku || '', bin_id: binId || '', reasons });
      }
    }
    // Account for assigned IDs whose records could not be fetched (deleted/invalidated)
    for (const id of assignedIds) {
      if (!fetchedIds.has(id)) {
        missingBinItems.push({ id, name: 'Record not found', sku: '', bin_id: '', reasons: ['Assigned item record no longer exists'] });
      }
    }

    const missingCountIds = [...assignedIds].filter(id => !countedIds.has(id));

    return {
      assigned: sessionAssignedCount,
      counted: countedCount,
      remaining: missingCount,
      missingCountIds,
      totalQty,
      zeroCountItems,
      missingBin: missingBinItems.length,
      missingBinItems,
      totalValue: 0,
    };
  }, [session, counts, assignedItems, bins]);

  const status = session?.status || 'in_progress';
  const isCreator = session?.started_by === userEmail;
  const isApproved = status === 'approved';
  const isAwaitingReview = status === 'awaiting_review';
  const isInProgress = !isApproved && !isAwaitingReview;
  const hasMissingCounts = isInProgress && stats.remaining > 0;
  const hasMissingBins = isInProgress && stats.missingBin > 0;
  const isLoadingAssignments = loadingItems && (session?.assigned_item_ids?.length || 0) > 0;
  const submissionBlocked = hasMissingCounts || hasMissingBins || isLoadingAssignments;

  const serverItems = session?.server_total_items;
  const serverQty = session?.server_total_quantity;
  const serverValue = session?.server_total_value;
  const showServerTotals = isApproved && serverItems !== undefined;

  const warehouseName = session?.warehouse_location_name || locations[0]?.name || 'N/A';
  const evidenceUrls = session?.evidence_urls || [];

  const handleSubmit = async () => {
    if (submissionBlocked || submitting || wizardSubmitting) return;
    setSubmitting(true);
    try { await onSubmitForReview(); } finally { setSubmitting(false); }
  };

  const handleApprove = async () => {
    setApproving(true);
    try { await onApprove(); } finally { setApproving(false); }
  };

  const handleReturnForCorrection = () => {
    setShowReturnDialog(true);
  };

  const confirmReturn = async () => {
    if (!returnReason.trim()) return;
    setRejecting(true);
    try {
      await onReject(returnReason);
    } finally {
      setRejecting(false);
      setShowReturnDialog(false);
      setReturnReason('');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Review &amp; Approve Counts</h2>
        <p className="text-sm text-muted-foreground mt-1">Verify everything before posting opening inventory balances.</p>
      </div>

      {/* Stat cards — session-scoped, always visible */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 max-w-4xl">
        <StatCard label="Assigned in This Setup" value={stats.assigned} icon={Package} />
        <StatCard label="Counted" value={stats.counted} icon={Hash} variant={stats.remaining === 0 ? 'success' : 'warning'} />
        <StatCard label="Missing Counts" value={stats.remaining} icon={AlertTriangle} variant={stats.remaining > 0 ? 'warning' : 'success'} />
        <StatCard label="Missing Bin" value={stats.missingBin} icon={MapPin} variant={stats.missingBin > 0 ? 'warning' : 'success'} />
        <StatCard label="Total Quantity" value={stats.totalQty} icon={Hash} />
      </div>

      {/* ═══ IN PROGRESS STATE ═══ */}
      {isInProgress && (
        <>
          {/* Missing counts warning — blocks submission */}
          {hasMissingCounts ? (
            <div className="p-4 rounded-md border border-amber-300 bg-amber-50 max-w-2xl space-y-3">
              <div className="flex items-center gap-2 text-sm text-amber-900">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <div>
                  <p className="font-semibold">Inventory count incomplete.</p>
                  <p>{stats.remaining} assigned item(s) have not been counted. Please complete the missing counts before submitting.</p>
                </div>
              </div>
              {onReturnToCounts && (
                <button
                  onClick={onReturnToCounts}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
                >
                  <RotateCcw className="w-4 h-4" /> Return to Missing Counts
                </button>
              )}
            </div>
          ) : hasMissingBins ? (
            <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800 max-w-2xl flex items-center gap-2">
              <MapPin className="w-4 h-4 shrink-0" /> {stats.missingBin} assigned item(s) are missing valid bin assignments. See below.
            </div>
          ) : isLoadingAssignments ? (
            <div className="p-3 rounded-md bg-blue-50 border border-blue-200 text-sm text-blue-700 max-w-2xl flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Verifying bin assignments for assigned items...
            </div>
          ) : (
            <div className="p-3 rounded-md bg-green-50 border border-green-200 text-sm text-green-700 max-w-2xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> All assigned items have been counted and have valid bin assignments. Ready to submit for review.
            </div>
          )}

          {/* Missing bin warning — blocks submission */}
          {hasMissingBins && (
            <div className="p-4 rounded-md border border-amber-300 bg-amber-50 max-w-2xl space-y-2">
              <div className="flex items-center gap-2 text-sm text-amber-900">
                <MapPin className="w-5 h-5 shrink-0" />
                <div>
                  <p className="font-semibold">{stats.missingBin} assigned item(s) missing valid bin assignment</p>
                  <p>Each assigned item must have a bin in the warehouse being configured ({session?.warehouse_location_name || 'N/A'}). Submission is blocked until resolved.</p>
                </div>
              </div>
              <ul className="text-xs text-amber-800 space-y-1 ml-7">
                {stats.missingBinItems.map(item => (
                  <li key={item.id} className="flex flex-col gap-0.5">
                    <span className="font-medium">{item.name}{item.sku ? ` (${item.sku})` : ''}</span>
                    <span className="text-amber-700">{item.reasons.join('; ')}</span>
                  </li>
                ))}
              </ul>
              {onReturnToCounts && (
                <button
                  onClick={onReturnToCounts}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
                >
                  <RotateCcw className="w-4 h-4" /> Return to Fix Assignments
                </button>
              )}
            </div>
          )}

          {/* Submit section */}
          <div className="p-4 rounded-md border bg-card max-w-2xl space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Count Submission</h3>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="p-2 rounded bg-muted/50"><p className="text-xs text-muted-foreground">Items to Post</p><p className="font-bold">{stats.counted}</p></div>
              <div className="p-2 rounded bg-muted/50"><p className="text-xs text-muted-foreground">Total Qty</p><p className="font-bold">{stats.totalQty}</p></div>
              <div className="p-2 rounded bg-muted/50"><p className="text-xs text-muted-foreground">Zero-Count Items</p><p className="font-bold">{stats.zeroCountItems}</p></div>
            </div>

            {/* Disable checkbox when missing counts */}
            <div className={`p-3 rounded-md border text-sm ${hasMissingCounts ? 'bg-muted/30 border-muted opacity-50' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" id="submit-confirm" className="w-4 h-4 mt-0.5" disabled={hasMissingCounts} />
                <span className="font-medium">I confirm that these physical counts are accurate and ready for review.</span>
              </label>
            </div>

            {isCreator ? (
              <button
                onClick={handleSubmit}
                disabled={submitting || wizardSubmitting || submissionBlocked || stats.counted === 0}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting || wizardSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {submitting || wizardSubmitting
                  ? 'Submitting…'
                  : submissionBlocked
                    ? `Submit Blocked — ${stats.remaining} Missing Counts, ${stats.missingBin} Missing Bin`
                    : 'Submit for Review'}
              </button>
            ) : (
              <p className="text-sm text-muted-foreground">Only the session creator can submit counts for review.</p>
            )}
          </div>
        </>
      )}

      {/* ═══ AWAITING REVIEW STATE ═══ */}
      {isAwaitingReview && (
        <div className="space-y-4 max-w-2xl">
          {/* Inventory Count Complete banner */}
          <div className="p-4 rounded-md bg-green-50 border border-green-200">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <span className="font-semibold text-green-900">Inventory Count Complete</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div><p className="text-xs text-green-700">Items Counted</p><p className="text-xl font-bold text-green-900">{stats.counted}</p></div>
              <div><p className="text-xs text-green-700">Total Quantity</p><p className="text-xl font-bold text-green-900">{stats.totalQty}</p></div>
              <div><p className="text-xs text-green-700">Zero-Count Items</p><p className="text-xl font-bold text-green-900">{stats.zeroCountItems}</p></div>
            </div>
          </div>

          {/* Awaiting Owner Approval banner */}
          <div className="flex items-center gap-2 p-3 rounded-md bg-blue-50 border border-blue-200 text-sm text-blue-800">
            <Send className="w-4 h-4" />
            <span>Counts submitted for review by <strong>{session.submitted_by}</strong> on {session.submitted_at ? new Date(session.submitted_at).toLocaleString() : ''}.</span>
          </div>

          {/* Approval panel — only for non-creators (Owner/Admin) */}
          {isCreator ? (
            <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
              <ShieldCheck className="w-4 h-4 inline mr-1" />
              You submitted these counts, so you cannot approve them. An Owner or authorized Director must review and approve.
            </div>
          ) : (
            <div className="p-4 rounded-md border bg-card space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Owner or Authorized Director Approval Required</h3>

              {/* Approval details grid */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2 rounded bg-muted/50">
                  <p className="text-xs text-muted-foreground">Submitted By</p>
                  <p className="font-medium">{session.submitted_by || '—'}</p>
                </div>
                <div className="p-2 rounded bg-muted/50">
                  <p className="text-xs text-muted-foreground">Submitted Date</p>
                  <p className="font-medium">{session.submitted_at ? new Date(session.submitted_at).toLocaleString() : '—'}</p>
                </div>
                <div className="p-2 rounded bg-muted/50">
                  <p className="text-xs text-muted-foreground">Warehouse</p>
                  <p className="font-medium">{warehouseName}</p>
                </div>
                <div className="p-2 rounded bg-muted/50">
                  <p className="text-xs text-muted-foreground">Items Counted</p>
                  <p className="font-medium">{stats.counted} of {stats.assigned}</p>
                </div>
                <div className="p-2 rounded bg-muted/50">
                  <p className="text-xs text-muted-foreground">Missing Items</p>
                  <p className="font-medium">{stats.remaining === 0 ? <span className="text-green-600">0 — Complete</span> : <span className="text-red-600">{stats.remaining}</span>}</p>
                </div>
                <div className="p-2 rounded bg-muted/50">
                  <p className="text-xs text-muted-foreground">Total Quantity</p>
                  <p className="font-medium">{stats.totalQty}</p>
                </div>
              </div>

              {/* Item Detail Table */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Items, Bins &amp; Quantities ({assignedItems.length})</p>
                <div className="border rounded-md overflow-hidden max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left p-2">Item</th>
                        <th className="text-left p-2">Bin</th>
                        <th className="text-right p-2">Count</th>
                        <th className="text-right p-2">Unit Cost</th>
                        <th className="text-right p-2">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignedItems.map(item => {
                        const count = counts[item.id]?.count;
                        const qty = count !== undefined && count !== '' && count !== null ? Number(count) : null;
                        const unitCost = item.unit_cost || 0;
                        return (
                          <tr key={item.id} className="border-t hover:bg-muted/30">
                            <td className="p-2">{item.item_name}{item.sku ? ` (${item.sku})` : ''}</td>
                            <td className="p-2">{item.bin_location || '—'}</td>
                            <td className="text-right p-2 font-medium">{qty !== null ? qty : '—'}</td>
                            <td className="text-right p-2">${unitCost.toFixed(2)}</td>
                            <td className="text-right p-2 font-medium">{qty !== null ? `$${(qty * unitCost).toFixed(2)}` : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Photos / Evidence */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Camera className="w-3 h-3" /> Photos ({evidenceUrls.length})</p>
                {evidenceUrls.length > 0 ? (
                  <div className="flex gap-2 flex-wrap">
                    {evidenceUrls.slice(0, 6).map((url, i) => (
                      <img key={i} src={url} alt={`Evidence ${i + 1}`} className="w-16 h-16 rounded-md object-cover border" />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No photos attached.</p>
                )}
              </div>

              {/* Variance Summary */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Variance Summary</p>
                <div className="p-2 rounded bg-muted/30 text-xs space-y-0.5">
                  <div className="flex justify-between"><span className="text-muted-foreground">Items with zero count:</span><span className="font-medium">{stats.zeroCountItems}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Items with non-zero count:</span><span className="font-medium">{stats.counted - stats.zeroCountItems}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Total quantity counted:</span><span className="font-medium">{stats.totalQty}</span></div>
                  <p className="text-muted-foreground italic mt-1">Detailed per-item variance computed during server-side approval.</p>
                </div>
              </div>

              {/* AI Risk Summary */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><FileText className="w-3 h-3" /> AI Risk Summary</p>
                <div className="p-2 rounded bg-muted/30 text-xs space-y-0.5">
                  {stats.remaining > 0 && <p className="text-red-600">⚠ {stats.remaining} items missing counts — submission should have been blocked.</p>}
                  {stats.zeroCountItems > 0 && <p className="text-amber-600">⚠ {stats.zeroCountItems} items counted as zero — verify these are genuinely empty.</p>}
                  {stats.remaining === 0 && stats.zeroCountItems === 0 && <p className="text-green-600">✓ No anomalies detected — all items counted with non-zero quantities.</p>}
                  <p className="text-muted-foreground italic mt-1">Risk assessment based on count completeness and zero-count anomalies.</p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 flex-wrap pt-2 border-t">
                <button
                  onClick={handleApprove}
                  disabled={approving || rejecting}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40"
                >
                  {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  Approve Counts
                </button>
                <button
                  onClick={handleReturnForCorrection}
                  disabled={approving || rejecting}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md border border-destructive text-destructive text-sm font-medium hover:bg-destructive/10 disabled:opacity-40"
                >
                  {rejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  Return for Correction
                </button>
              </div>

              {/* Return for Correction reason dialog */}
              {showReturnDialog && (
                <div className="border-t pt-3 space-y-2">
                  <p className="text-sm font-semibold flex items-center gap-1.5"><RotateCcw className="w-4 h-4" /> Reason for Return</p>
                  <p className="text-xs text-muted-foreground">The submitter will be notified with this reason. All items, bins, counts, and evidence are preserved.</p>
                  <textarea
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder="Describe what needs correction..."
                    rows={3}
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={confirmReturn}
                      disabled={!returnReason.trim() || rejecting}
                      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md border border-destructive text-destructive text-sm font-medium hover:bg-destructive/10 disabled:opacity-40"
                    >
                      {rejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                      Confirm Return
                    </button>
                    <button
                      onClick={() => { setShowReturnDialog(false); setReturnReason(''); }}
                      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md border border-input text-sm font-medium hover:bg-accent/10"
                    >
                      <XCircle className="w-4 h-4" /> Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ APPROVED STATE ═══ */}
      {isApproved && (
        <div className="space-y-3 max-w-2xl">
          <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 border border-green-200 text-sm text-green-800">
            <CheckCircle2 className="w-4 h-4" />
            <span><strong>Approved — Awaiting Activation.</strong> Counts approved by <strong>{session.approved_by}</strong> on {session.approved_at ? new Date(session.approved_at).toLocaleString() : ''}. An Owner or authorized Director can now post opening balances.</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="p-2 rounded bg-muted/50"><p className="text-xs text-muted-foreground">Items (Server)</p><p className="font-bold">{serverItems ?? stats.counted}</p></div>
            <div className="p-2 rounded bg-muted/50"><p className="text-xs text-muted-foreground">Total Qty (Server)</p><p className="font-bold">{serverQty ?? stats.totalQty}</p></div>
            <div className="p-2 rounded bg-muted/50"><p className="text-xs text-muted-foreground">Total Value (Server)</p><p className="font-bold">${(serverValue ?? stats.totalValue).toFixed(2)}</p></div>
          </div>
          <p className="text-xs text-muted-foreground">If you edit any counts, the approval will be automatically revoked and you must re-submit and re-approve before posting.</p>
        </div>
      )}
    </div>
  );
}