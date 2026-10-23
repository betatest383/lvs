import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, AlertCircle, CheckCircle2, MapPin, Search, ArrowRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { stockAndCount } from '@/lib/warehouseSetupSession';

export default function StepReviewExceptions({ locations, bins, permissions, session, onSessionUpdate, onCountChange, onValidityChange, onContinue }) {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState({});
  const [saving, setSaving] = useState(false);

  const sessionWarehouseId = session?.warehouse_location_id || '';
  const sessionWarehouseName = session?.warehouse_location_name || '';
  const sessionBins = useMemo(() => (bins || []).filter(b => b.warehouse_location_id === sessionWarehouseId), [bins, sessionWarehouseId]);
  const binsById = useMemo(() => new Map((bins || []).map(b => [b.id, b])), [bins]);

  const counts = useMemo(() => {
    try { return JSON.parse(session?.count_data_json || '{}'); } catch { return {}; }
  }, [session?.count_data_json]);

  const fetchItems = useCallback(async () => {
    const ids = session?.assigned_item_ids || [];
    if (ids.length === 0) { setItems([]); setLoading(false); return; }
    setLoading(true);
    try {
      const fetched = await Promise.all(ids.map(id => base44.entities.InventoryMaster.get(id).catch(() => null)));
      setItems(fetched.filter(Boolean));
    } catch (e) { console.error('Failed:', e); }
    finally { setLoading(false); }
  }, [session?.assigned_item_ids, session?.id]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Compute item statuses and filter to exceptions only
  const exceptionItems = useMemo(() => {
    return items.map(item => {
      const binObj = item.bin_location_id ? binsById.get(item.bin_location_id) : null;
      const hasValidBin = binObj && binObj.warehouse_location_id === sessionWarehouseId;
      const hasCount = counts[item.id]?.count !== undefined && counts[item.id]?.count !== '';
      let status = 'unprocessed';
      if (hasValidBin && hasCount) status = 'ready_for_review';
      else if (hasCount && !hasValidBin) status = 'missing_bin';
      else if (hasValidBin && !hasCount) status = 'missing_count';
      return { ...item, status, hasValidBin, hasCount, count_data: counts[item.id] };
    }).filter(item => item.status !== 'ready_for_review' && item.status !== 'completed');
  }, [items, binsById, counts, sessionWarehouseId]);

  const noExceptions = exceptionItems.length === 0 && items.length > 0;

  useEffect(() => {
    onValidityChange?.(noExceptions);
  }, [noExceptions, onValidityChange]);

  // Initialize editing state for each exception item
  useEffect(() => {
    const newEditing = {};
    exceptionItems.forEach(item => {
      if (!editing[item.id]) {
        newEditing[item.id] = {
          binId: item.hasValidBin ? item.bin_location_id : '',
          quantity: item.count_data?.count ?? '',
          notes: item.count_data?.notes || '',
        };
      }
    });
    if (Object.keys(newEditing).length > 0) {
      setEditing(prev => ({ ...prev, ...newEditing }));
    }
  }, [exceptionItems]);

  const handleSaveException = async (item) => {
    const ed = editing[item.id];
    if (!ed?.binId) {
      toast({ variant: 'destructive', title: 'Select a bin' });
      return;
    }
    setSaving(true);
    try {
      const result = await stockAndCount(
        session.id, item.id, ed.binId,
        ed.quantity === '' ? 0 : Number(ed.quantity),
        [], ed.notes || ''
      );
      if (result.error) throw new Error(result.error);

      let newCounts = {};
      try { newCounts = JSON.parse(result.session?.count_data_json || '{}'); } catch { newCounts = {}; }
      onCountChange?.(newCounts);
      if (onSessionUpdate) onSessionUpdate(result.session);
      await fetchItems();
      toast({ title: 'Fixed', description: `${item.item_name} is now ready for review.` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Fix failed', description: e.message });
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Review Exceptions</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Fix only items with missing bins, missing counts, or invalid assignments. Ready items are hidden.
        </p>
      </div>

      {noExceptions && (
        <div className="p-6 rounded-md border border-green-300 bg-green-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-500" />
            <div>
              <p className="font-semibold text-green-900">All items are stocked and counted.</p>
              <p className="text-sm text-green-700">No exceptions found. Proceed to Review for approval.</p>
            </div>
          </div>
          <Button onClick={onContinue} size="sm">Continue to Review <ArrowRight className="w-4 h-4" /></Button>
        </div>
      )}

      {!noExceptions && exceptionItems.length === 0 && items.length === 0 && (
        <div className="p-4 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
          No items assigned to this session. Go back to Stock & Count Materials to add items.
        </div>
      )}

      {exceptionItems.length > 0 && (
        <div className="space-y-3 max-w-3xl">
          {exceptionItems.map(item => {
            const ed = editing[item.id] || { binId: '', quantity: '', notes: '' };
            const isCrossWarehouse = item.warehouse_location_id && item.warehouse_location_id !== sessionWarehouseId;
            return (
              <div key={item.id} className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{item.item_name}</p>
                    <p className="text-xs text-muted-foreground">{item.sku || item.inventory_id} · {item.unit || 'ea'}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                    item.status === 'missing_bin' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                    item.status === 'missing_count' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {item.status === 'missing_bin' ? 'Missing Bin' : item.status === 'missing_count' ? 'Missing Count' : 'Unprocessed'}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5" />
                  Currently: {item.warehouse_location || 'None'} · {item.bin_location || 'None'}
                </div>

                {isCrossWarehouse && (
                  <div className="p-2 rounded-md border border-amber-300 bg-amber-50 text-xs text-amber-900">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    Cross-warehouse: item is in {item.warehouse_location}, session warehouse is {sessionWarehouseName}.
                  </div>
                )}

                <div className="grid grid-cols-[1fr_100px] gap-2">
                  <select
                    value={ed.binId}
                    onChange={(e) => setEditing(prev => ({ ...prev, [item.id]: { ...ed, binId: e.target.value } }))}
                    disabled={saving}
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm disabled:opacity-40"
                  >
                    <option value="">Bin in {sessionWarehouseName}...</option>
                    {sessionBins.map(b => <option key={b.id} value={b.id}>{b.bin_code}</option>)}
                  </select>
                  <input
                    type="number"
                    min="0"
                    value={ed.quantity}
                    onChange={(e) => setEditing(prev => ({ ...prev, [item.id]: { ...ed, quantity: e.target.value } }))}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !saving) handleSaveException(item); }}
                    placeholder="Qty"
                    disabled={saving}
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-sm text-center shadow-sm disabled:opacity-40"
                  />
                </div>

                <Button size="sm" onClick={() => handleSaveException(item)} disabled={saving || !ed.binId}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Fix & Save
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}