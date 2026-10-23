import React, { useState, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronRight, Package, AlertCircle, CheckCircle2, Loader2, ClipboardList, MapPin, Hash } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';

function CountRow({ item, countData, onCount, onNotes, blindCount }) {
  const hasCount = countData?.count !== undefined && countData?.count !== '';
  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.item_name}</p>
        <p className="text-xs text-muted-foreground">
          {item.sku || item.inventory_id} · {item.unit || 'ea'}
          {item.bin_location && <span className="ml-1">· Bin: {item.bin_location}</span>}
        </p>
      </div>
      {!blindCount && (
        <div className="text-right text-xs text-muted-foreground">
          <p>Expected: {item.quantity_owned ?? 0}</p>
        </div>
      )}
      <input
        type="number"
        min="0"
        value={countData?.count ?? ''}
        onChange={(e) => onCount(item.id, e.target.value)}
        placeholder="0"
        className={cn(
          'w-20 h-8 rounded-md border border-input bg-transparent px-2 text-sm text-center font-medium shadow-sm focus-visible:ring-1 focus-visible:ring-ring',
          hasCount ? 'border-green-400 bg-green-50' : 'border-amber-300 bg-amber-50'
        )}
      />
      <input
        type="text"
        value={countData?.notes ?? ''}
        onChange={(e) => onNotes(item.id, e.target.value)}
        placeholder="Notes..."
        className="w-32 h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
      />
      {hasCount ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" /> : <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />}
    </div>
  );
}

function BinGroup({ binCode, locationName, items, counts, onCount, onNotes, blindCount }) {
  const [open, setOpen] = useState(true);
  const counted = items.filter(i => counts[i.id]?.count !== undefined && counts[i.id]?.count !== '').length;

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50">
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{locationName}</span>
          <span className="font-mono font-medium text-sm">{binCode}</span>
          <span className="text-xs text-muted-foreground">{counted}/{items.length} counted</span>
        </div>
        <span className={cn('text-xs px-2 py-0.5 rounded-full', counted === items.length ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>
          {counted === items.length ? 'Complete' : 'In Progress'}
        </span>
      </button>
      {open && items.map(item => (
        <CountRow key={item.id} item={item} countData={counts[item.id]} onCount={onCount} onNotes={onNotes} blindCount={blindCount} />
      ))}
    </div>
  );
}

export default function StepInventoryCount({ locations, bins, counts, onCountChange, permissions, session }) {
  const [countEligible, setCountEligible] = useState([]);
  const [invalidItems, setInvalidItems] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [blindCount, setBlindCount] = useState(true);
  const [countMode] = useState('initial_opening_balance');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // ── Session-scoped: only load items assigned in THIS setup session ──
        const assignedIds = session?.assigned_item_ids || [];
        const sessionWarehouseId = session?.warehouse_location_id;
        const binsById = new Map((bins || []).map(b => [b.id, b]));

        if (assignedIds.length === 0) {
          setCountEligible([]);
          setInvalidItems([]);
          setTotals({ total_active: 0, stocked: 0, stocked_assigned: 0, stocked_unassigned: 0 });
          setLoading(false);
          return;
        }

        // Fetch only items assigned in this session
        const items = await base44.entities.InventoryMaster.filter({
          id: { $in: assignedIds },
          is_stocked_inventory_item: true,
        }, null, 10000);

        // ── Revalidate: partition items into valid (can be counted) and invalid (missing bin) ──
        const valid = [];
        const invalid = [];
        for (const item of items) {
          const binId = item.bin_location_id;
          let isValid = false;
          if (binId) {
            const bin = binsById.get(binId);
            if (bin && (!sessionWarehouseId || bin.warehouse_location_id === sessionWarehouseId)) {
              isValid = true;
            }
          }
          if (isValid) {
            valid.push(item);
          } else {
            invalid.push({
              id: item.id,
              name: item.item_name || 'Unknown',
              sku: item.sku || '',
              current_warehouse: item.warehouse_location || 'None',
              current_bin: item.bin_location || 'None',
              reason: !binId ? 'No bin assigned' :
                !binsById.has(binId) ? 'Referenced bin no longer exists' :
                'Bin belongs to another warehouse',
            });
          }
        }

        // Sort valid items by: location, bin, material name
        const sorted = valid.sort((a, b) => {
          const locA = a.warehouse_location || '';
          const locB = b.warehouse_location || '';
          if (locA !== locB) return locA.localeCompare(locB);
          const binA = a.bin_location || '';
          const binB = b.bin_location || '';
          if (binA !== binB) return binA.localeCompare(binB);
          return (a.item_name || '').localeCompare(b.item_name || '');
        });
        setCountEligible(sorted);
        setInvalidItems(invalid);
        setTotals({
          total_active: items.length,
          stocked: items.length,
          stocked_assigned: valid.length,
          stocked_unassigned: invalid.length,
        });
      } catch (e) {
        setError(e.response?.data?.error || e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [session?.id, session?.assigned_item_ids?.length, session?.warehouse_location_id, bins]);

  const grouped = useMemo(() => {
    const map = {};
    countEligible.forEach(item => {
      const binCode = item.bin_location || 'Unassigned';
      const locName = item.warehouse_location || 'Unknown';
      const key = `${locName}|||${binCode}`;
      if (!map[key]) map[key] = { locationName: locName, binCode, items: [] };
      map[key].items.push(item);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [countEligible]);

  const handleCount = (itemId, value) => {
    onCountChange(prev => ({ ...prev, [itemId]: { ...prev[itemId], count: value } }));
  };
  const handleNotes = (itemId, value) => {
    onCountChange(prev => ({ ...prev, [itemId]: { ...prev[itemId], notes: value } }));
  };

  const totalCounted = countEligible.filter(i => counts[i.id]?.count !== undefined && counts[i.id]?.count !== '').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Inventory Count</h2>
        <div className="p-4 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">{error}</div>
      </div>
    );
  }

  // Pre-count readiness summary
  if (countEligible.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold">Inventory Count</h2>
          <p className="text-sm text-muted-foreground mt-1">No items are ready for counting.</p>
        </div>
        {invalidItems.length > 0 ? (
          <div className="p-4 rounded-md bg-red-50 border border-red-200 text-sm text-red-800 space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="font-semibold">{invalidItems.length} assigned item(s) have invalid bin assignments and cannot be counted.</p>
            </div>
            <ul className="ml-7 space-y-1 text-xs">
              {invalidItems.map(item => (
                <li key={item.id}>
                  <span className="font-medium">{item.name}</span>
                  {item.sku ? ` (${item.sku})` : ''} — {item.reason}
                  {' '}(currently: {item.current_warehouse} · {item.current_bin})
                </li>
              ))}
            </ul>
            <p className="text-xs">Return to Step 3 (Assign Materials) to fix these assignments before counting.</p>
          </div>
        ) : (
          <div className="p-4 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
            No stocked materials with bin assignments found. Go back to Step 3 (Assign Materials) to mark items as stocked and assign bins.
          </div>
        )}
        {totals && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg border bg-card">
              <p className="text-xl font-bold">{totals.total_active?.toLocaleString() || 0}</p>
              <p className="text-xs text-muted-foreground">Total Active Materials</p>
            </div>
            <div className="p-3 rounded-lg border bg-green-50 border-green-200">
              <p className="text-xl font-bold text-green-600">{totals.stocked || 0}</p>
              <p className="text-xs text-green-700">Stocked</p>
            </div>
            <div className="p-3 rounded-lg border bg-blue-50 border-blue-200">
              <p className="text-xl font-bold text-blue-600">{totals.stocked_assigned || 0}</p>
              <p className="text-xs text-blue-700">Ready to Count</p>
            </div>
            <div className="p-3 rounded-lg border bg-amber-50 border-amber-200">
              <p className="text-xl font-bold text-amber-600">{totals.stocked_unassigned || 0}</p>
              <p className="text-xs text-amber-700">Missing Bin</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold">Inventory Count</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Count Mode: <span className="font-medium capitalize">{countMode.replace(/_/g, ' ')}</span>. Physically count each material.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={blindCount} onChange={(e) => setBlindCount(e.target.checked)} className="w-4 h-4 rounded" />
          Blind Count (hide expected)
        </label>
      </div>

      {/* Pre-count readiness summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg border bg-card">
          <p className="text-xl font-bold">{totals?.total_active?.toLocaleString() || 0}</p>
          <p className="text-xs text-muted-foreground">Total Active Materials</p>
        </div>
        <div className="p-3 rounded-lg border bg-green-50 border-green-200">
          <p className="text-xl font-bold text-green-600">{totals?.stocked || 0}</p>
          <p className="text-xs text-green-700">Stocked Items</p>
        </div>
        <div className="p-3 rounded-lg border bg-blue-50 border-blue-200">
          <p className="text-xl font-bold text-blue-600">{countEligible.length}</p>
          <p className="text-xs text-blue-700">Ready to Count</p>
        </div>
        <div className="p-3 rounded-lg border bg-amber-50 border-amber-200">
          <p className="text-xl font-bold text-amber-600">{(totals?.stocked || 0) - countEligible.length}</p>
          <p className="text-xs text-amber-700">Missing Bin</p>
        </div>
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-muted-foreground">{totalCounted} of {countEligible.length} counted</span>
          <span className="text-muted-foreground">{countEligible.length > 0 ? Math.round((totalCounted / countEligible.length) * 100) : 0}%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div className="bg-accent h-full transition-all" style={{ width: `${countEligible.length > 0 ? (totalCounted / countEligible.length) * 100 : 0}%` }} />
        </div>
      </div>

      {/* Invalid items warning — items that failed bin revalidation */}
      {invalidItems.length > 0 && (
        <div className="p-4 rounded-md bg-red-50 border border-red-200 text-sm text-red-800 space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="font-semibold">{invalidItems.length} assigned item(s) have invalid bin assignments and cannot be counted.</p>
          </div>
          <ul className="ml-7 space-y-1 text-xs">
            {invalidItems.map(item => (
              <li key={item.id}>
                <span className="font-medium">{item.name}</span>
                {item.sku ? ` (${item.sku})` : ''} — {item.reason}
                {' '}(currently: {item.current_warehouse} · {item.current_bin})
              </li>
            ))}
          </ul>
          <p className="text-xs">Return to Step 3 (Assign Materials) to fix these assignments. These items are excluded from the count below.</p>
        </div>
      )}

      {/* Count list grouped by location/bin */}
      <div className="space-y-3 max-w-4xl">
        {grouped.map(([key, group]) => (
          <BinGroup
            key={key}
            binCode={group.binCode}
            locationName={group.locationName}
            items={group.items}
            counts={counts}
            onCount={handleCount}
            onNotes={handleNotes}
            blindCount={blindCount}
          />
        ))}
      </div>
    </div>
  );
}