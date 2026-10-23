import React, { useState, useMemo, useEffect } from 'react';
import { Loader2, CheckCircle2, Zap, Package, AlertCircle, RotateCcw } from 'lucide-react';

export default function StepActivate({ session, onActivate }) {
  const [activating, setActivating] = useState(false);

  // Parse activation results from session
  const results = useMemo(() => {
    try {
      return session?.activation_results_json ? JSON.parse(session.activation_results_json) : [];
    } catch { return []; }
  }, [session?.activation_results_json]);

  // Parse approval snapshot for item count
  const snapshot = useMemo(() => {
    try {
      return session?.approval_snapshot_json ? JSON.parse(session.approval_snapshot_json) : {};
    } catch { return {}; }
  }, [session?.approval_snapshot_json]);

  const snapshotItemIds = Object.keys(snapshot);
  const postedIds = new Set(results.filter(r => r.success).map(r => r.item_id));
  const failedItems = results.filter(r => !r.success);
  const pendingCount = snapshotItemIds.filter(id => !postedIds.has(id)).length;
  const allPosted = snapshotItemIds.length > 0 && postedIds.size >= snapshotItemIds.length;
  const isCompleted = session?.status === 'completed' || (allPosted && session?.activation_completed);

  const handleActivate = async () => {
    setActivating(true);
    try {
      await onActivate();
    } finally {
      setActivating(false);
    }
  };

  // ─── Completed state ───
  if (isCompleted) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 className="w-14 h-14 text-green-500" />
          <h2 className="text-xl font-bold">Inventory Activated!</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {postedIds.size} opening balance transactions created. All counted items are now Active and Available.
          </p>
          {session?.activated_by && (
            <p className="text-xs text-muted-foreground">Activated by {session.activated_by}</p>
          )}
        </div>
        <div className="max-w-2xl space-y-2">
          <h3 className="text-sm font-semibold">Posted Items</h3>
          {results.filter(r => r.success).map((r, i) => (
            <div key={i} className="flex items-center gap-2 p-2.5 rounded-md border bg-card text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              <span className="flex-1 truncate">{r.item_name}</span>
              <span className="text-muted-foreground">Qty: {r.count}</span>
              <span className="text-xs font-mono text-muted-foreground">{r.transaction_id}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Not approved yet ───
  if (session?.status !== 'approved' && session?.status !== 'partially_posted') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 p-4 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800 max-w-2xl">
          <AlertCircle className="w-5 h-5" />
          Counts must be approved before posting. Go back to the Review step and submit for review, then have an Owner/Admin approve.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Post Opening Balances</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Server-processed activation: each item gets an Opening Balance transaction with compensating rollback protection.
          Items already posted will not be duplicated.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-md">
        <div className="p-4 rounded-lg border bg-green-50 border-green-200">
          <p className="text-2xl font-bold text-green-600">{postedIds.size}</p>
          <p className="text-xs text-green-700">Posted</p>
        </div>
        <div className="p-4 rounded-lg border bg-blue-50 border-blue-200">
          <p className="text-2xl font-bold text-blue-600">{pendingCount}</p>
          <p className="text-xs text-blue-700">Pending</p>
        </div>
        <div className="p-4 rounded-lg border bg-red-50 border-red-200">
          <p className="text-2xl font-bold text-red-600">{failedItems.length}</p>
          <p className="text-xs text-red-700">Failed</p>
        </div>
      </div>

      {/* Server-calculated totals (from approval) */}
      <div className="grid grid-cols-3 gap-2 text-sm max-w-md">
        <div className="p-2 rounded bg-muted/50"><p className="text-xs text-muted-foreground">Server Items</p><p className="font-bold">{session?.server_total_items ?? '—'}</p></div>
        <div className="p-2 rounded bg-muted/50"><p className="text-xs text-muted-foreground">Server Qty</p><p className="font-bold">{session?.server_total_quantity ?? '—'}</p></div>
        <div className="p-2 rounded bg-muted/50"><p className="text-xs text-muted-foreground">Server Value</p><p className="font-bold">${(session?.server_total_value ?? 0).toFixed(2)}</p></div>
      </div>

      {activating && (
        <div className="space-y-2 max-w-md">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-accent" />
            <p className="text-sm text-muted-foreground">Processing opening balances on the server...</p>
          </div>
        </div>
      )}

      {failedItems.length > 0 && !activating && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-800 max-w-2xl">
          <p className="font-medium mb-1">Failed items (click "Retry Failed" to attempt again):</p>
          <ul className="space-y-0.5">
            {failedItems.map((r, i) => <li key={i}>• {r.item_name}: {r.error}</li>)}
          </ul>
        </div>
      )}

      {postedIds.size > 0 && !activating && (
        <div className="max-w-2xl space-y-1">
          <h3 className="text-sm font-semibold">Successfully Posted</h3>
          {results.filter(r => r.success).slice(0, 5).map((r, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-md border bg-card text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              <span className="flex-1 truncate">{r.item_name}</span>
              <span className="text-muted-foreground">Qty: {r.count}</span>
              <span className="text-xs font-mono text-muted-foreground">{r.transaction_id}</span>
            </div>
          ))}
          {postedIds.size > 5 && <p className="text-xs text-muted-foreground pl-6">...and {postedIds.size - 5} more</p>}
        </div>
      )}

      <div className="flex gap-2 max-w-md">
        <button
          onClick={handleActivate}
          disabled={activating || pendingCount === 0}
          className="inline-flex items-center gap-1.5 h-10 px-6 rounded-md bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-40"
        >
          {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : failedItems.length > 0 ? <RotateCcw className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
          {activating ? 'Posting...' : failedItems.length > 0 ? `Retry ${failedItems.length} Failed Item(s)` : `Post ${pendingCount} Opening Balance(s)`}
        </button>
      </div>

      <p className="text-xs text-muted-foreground max-w-md">
        <Package className="w-3 h-3 inline mr-1" />
        {postedIds.size} item(s) already posted — they will not be duplicated.
        A page refresh resumes at the first unposted item. Audit-record failures cannot leave inventory changed without a ledger entry.
      </p>
    </div>
  );
}