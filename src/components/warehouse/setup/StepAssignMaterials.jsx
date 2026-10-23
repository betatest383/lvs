import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Loader2, Package, Search, ChevronDown, MapPin, PackageX, AlertTriangle, ArrowRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { useWarehouseMaterials } from '@/hooks/useWarehouseMaterials';
import { recordAssignments, confirmNoMaterials } from '@/lib/warehouseSetupSession';
import { MoveConfirmationDialog, AssignmentCompleteCard, WarehouseSummaryCard, UndoBanner, NoMaterialsConfirmDialog } from './AssignmentDialogs';

function MaterialRow({ item, selected, onToggleSelect }) {
  const isStocked = item.is_stocked_inventory_item;
  const hasBin = !!item.bin_location_id;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-md border bg-card ${!isStocked ? 'opacity-60' : ''}`}>
      <input type="checkbox" checked={selected} onChange={onToggleSelect} className="w-4 h-4 rounded shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.item_name}</p>
        <p className="text-xs text-muted-foreground">
          {item.sku || item.inventory_id || 'No SKU'} · {item.inventory_type}
        </p>
      </div>
      {isStocked && hasBin ? (
        <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
          <MapPin className="w-3 h-3 inline mr-1" />{item.warehouse_location} · {item.bin_location}
        </span>
      ) : isStocked ? (
        <span className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
          Stocked — Missing Bin
        </span>
      ) : (
        <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground whitespace-nowrap">
          Not Stocked
        </span>
      )}
    </div>
  );
}

export default function StepAssignMaterials({ locations, bins, onDataChange, permissions, onContinue, session, onSessionUpdate, onValidityChange }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkLocId, setBulkLocId] = useState('');
  const [bulkBinId, setBulkBinId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [moveDialog, setMoveDialog] = useState(null);
  const [undoData, setUndoData] = useState(null);
  const [autoSelectPending, setAutoSelectPending] = useState(false);
  const [showNoMaterialsDialog, setShowNoMaterialsDialog] = useState(false);
  const [assignedItems, setAssignedItems] = useState([]);
  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const undoTimerRef = useRef(null);

  // ── Session warehouse lock: all assignments must go to the session's warehouse ──
  const sessionWarehouseId = session?.warehouse_location_id || '';
  const sessionWarehouseName = session?.warehouse_location_name || '';

  // Only bins belonging to the session warehouse are valid destinations
  const sessionBins = useMemo(() => (bins || []).filter(b => b.warehouse_location_id === sessionWarehouseId), [bins, sessionWarehouseId]);
  const binsById = useMemo(() => new Map((bins || []).map(b => [b.id, b])), [bins]);

  // Lock bulkLocId to the session warehouse
  useEffect(() => {
    if (sessionWarehouseId) setBulkLocId(sessionWarehouseId);
  }, [sessionWarehouseId]);

  // Fetch assigned items to validate their bin assignments
  useEffect(() => {
    const ids = session?.assigned_item_ids || [];
    if (ids.length === 0) { setAssignedItems([]); return; }
    let cancelled = false;
    setLoadingAssigned(true);
    (async () => {
      try {
        const fetched = await Promise.all(ids.map(id => base44.entities.InventoryMaster.get(id).catch(() => null)));
        if (!cancelled) setAssignedItems(fetched.filter(Boolean));
      } catch (e) { console.error('Failed to fetch assigned items:', e); }
      finally { if (!cancelled) setLoadingAssigned(false); }
    })();
    return () => { cancelled = true; };
  }, [session?.assigned_item_ids, session?.id]);

  // Items whose bin is invalid for this session's warehouse
  const invalidBinItems = useMemo(() => {
    return assignedItems.filter(item => {
      const binId = item.bin_location_id;
      if (!binId) return true;
      const bin = binsById.get(binId);
      if (!bin) return true;
      if (sessionWarehouseId && bin.warehouse_location_id !== sessionWarehouseId) return true;
      return false;
    }).map(item => ({
      ...item,
      invalid_reason: !item.bin_location_id ? 'No bin assigned' :
        !binsById.has(item.bin_location_id) ? 'Referenced bin no longer exists' :
        'Bin belongs to another warehouse',
    }));
  }, [assignedItems, binsById, sessionWarehouseId]);

  const {
    materials, totals, loading, error, hasMore, loadMore, refresh,
    search, setSearch, stockedFilter, setStockedFilter,
    assignedFilter, setAssignedFilter, locationId, setLocationId,
  } = useWarehouseMaterials({ initialStockedFilter: 'stocked_only', initialPageSize: 50 });

  const [localMaterials, setLocalMaterials] = useState([]);
  const [localTotals, setLocalTotals] = useState(totals);

  useEffect(() => { setLocalMaterials(materials); }, [materials]);
  useEffect(() => { setLocalTotals(totals); }, [totals]);

  // Auto-select next items after assignment
  useEffect(() => {
    if (autoSelectPending && localMaterials.length > 0) {
      const toCheck = localMaterials.slice(0, 3);
      setSelectedIds(new Set(toCheck.map(m => m.id)));
      setAutoSelectPending(false);
    }
  }, [autoSelectPending, localMaterials]);

  const canAssign = permissions?.can_assign ?? false;
  // Only show bins belonging to the session warehouse — never bins from other warehouses
  const filteredBulkBins = sessionBins;

  // Session-scoped assignment count
  const sessionAssignmentCount = session?.assigned_item_ids?.length || 0;
  const noMaterialsConfirmed = session?.no_materials_confirmed || false;

  // Path A: materials were intentionally assigned in this session AND all have valid bins
  const hasSessionAssignments = sessionAssignmentCount > 0;
  const hasValidBins = invalidBinItems.length === 0 && !loadingAssigned;
  // Path B: user explicitly confirmed no materials
  const isCompleteViaNoMaterials = noMaterialsConfirmed && !hasSessionAssignments;
  const isStepComplete = (hasSessionAssignments && hasValidBins) || isCompleteViaNoMaterials;

  // ── Notify parent wizard of assignment validity (blocks Continue until all bins are valid) ──
  useEffect(() => {
    onValidityChange?.(hasSessionAssignments && hasValidBins);
  }, [hasSessionAssignments, hasValidBins, onValidityChange]);

  // Warehouse summary from current page
  const warehouseSummary = useMemo(() => {
    const map = {};
    localMaterials.forEach(m => {
      if (m.warehouse_location && m.bin_location_id) {
        map[m.warehouse_location] = (map[m.warehouse_location] || 0) + 1;
      }
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [localMaterials]);

  const handleToggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === localMaterials.length && localMaterials.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(localMaterials.map(m => m.id)));
    }
  };

  const performAssignment = async (itemsToAssign, locId, binId) => {
    const loc = locations.find(l => l.id === locId);
    const bin = bins.find(b => b.id === binId);
    const assignedIds = new Set(itemsToAssign.map(i => i.id));

    // Store previous states for undo
    const previousStates = itemsToAssign.map(item => ({
      id: item.id,
      is_stocked_inventory_item: item.is_stocked_inventory_item,
      warehouse_location_id: item.warehouse_location_id || null,
      warehouse_location: item.warehouse_location || null,
      bin_location_id: item.bin_location_id || null,
      bin_location: item.bin_location || null,
      inventory_status: item.inventory_status || 'not_stocked',
      assignment_history_json: item.assignment_history_json || '[]',
    }));

    setAssigning(true);
    try {
      const now = new Date().toISOString();
      const updates = itemsToAssign.map(item => {
        // Build assignment history entry for audit trail
        let existingHistory = [];
        try { existingHistory = JSON.parse(item.assignment_history_json || '[]'); } catch { existingHistory = []; }
        const historyEntry = {
          action: 'warehouse_move',
          previous_warehouse: item.warehouse_location || null,
          previous_bin: item.bin_location || null,
          new_warehouse: loc?.name || '',
          new_bin: bin?.bin_code || '',
          session_id: session?.session_id || session?.id || '',
          user: user?.email || '',
          timestamp: now,
        };
        return {
          id: item.id,
          is_stocked_inventory_item: true,
          warehouse_location_id: locId,
          warehouse_location: loc?.name || '',
          bin_location_id: binId,
          bin_location: bin?.bin_code || '',
          inventory_status: 'stocked_assigned',
          default_inventory_location_id: locId,
          default_bin_location_id: binId,
          assignment_history_json: JSON.stringify([...existingHistory, historyEntry]),
        };
      });
      await base44.entities.InventoryMaster.bulkUpdate(updates);

      // ── Record assignments in the session (session-scoped tracking) ──
      const newItemIds = itemsToAssign.map(i => i.id);
      const updatedSession = await recordAssignments(session?.id, newItemIds);
      if (updatedSession && onSessionUpdate) {
        onSessionUpdate(updatedSession);
      }

      // Optimistic update — remove assigned rows, don't full refresh
      const remaining = localMaterials.filter(m => !assignedIds.has(m.id));
      setLocalMaterials(remaining);

      // Update local totals
      const wasUnassigned = itemsToAssign.filter(i => !i.bin_location_id).length;
      const wasReassigned = itemsToAssign.length - wasUnassigned;
      setLocalTotals(prev => ({
        ...prev,
        stocked_unassigned: Math.max(0, (prev.stocked_unassigned || 0) - wasUnassigned),
        stocked_assigned: (prev.stocked_assigned || 0) + wasUnassigned,
      }));

      setSelectedIds(new Set());

      if (remaining.length < 5 && hasMore) {
        loadMore();
      }

      setAutoSelectPending(true);

      setUndoData({ previousStates, binCode: bin?.bin_code, count: itemsToAssign.length });
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => setUndoData(null), 30000);

      toast({
        title: wasReassigned > 0 && wasUnassigned === 0
          ? `${itemsToAssign.length} item(s) updated`
          : `${itemsToAssign.length} item(s) assigned`,
        description: `→ ${loc?.name} · ${bin?.bin_code}`,
      });

      onDataChange?.();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Assignment failed', description: e.message });
    } finally {
      setAssigning(false);
      setMoveDialog(null);
    }
  };

  const handleAssignSelected = () => {
    if (selectedIds.size === 0) return;
    if (!sessionWarehouseId) {
      toast({ variant: 'destructive', title: 'No warehouse set', description: 'Set a warehouse location in Step 1 first.' });
      return;
    }

    const selectedItems = localMaterials.filter(m => selectedIds.has(m.id));

    // Detect items whose current bin belongs to a DIFFERENT warehouse — these must be moved explicitly
    const crossWarehouseItems = selectedItems.filter(m =>
      m.bin_location_id && m.warehouse_location_id !== sessionWarehouseId
    );

    if (crossWarehouseItems.length > 0) {
      // Show MoveConfirmationDialog with destination bin selector (requires explicit bin choice)
      setMoveDialog({
        items: crossWarehouseItems,
        allItems: selectedItems,
      });
    } else if (!bulkBinId) {
      toast({ variant: 'destructive', title: 'Select a bin', description: `Choose a destination bin in ${sessionWarehouseName} before assigning.` });
    } else {
      performAssignment(selectedItems, sessionWarehouseId, bulkBinId);
    }
  };

  const handleUndo = async () => {
    if (!undoData) return;
    try {
      const updates = undoData.previousStates.map(s => ({
        id: s.id,
        is_stocked_inventory_item: s.is_stocked_inventory_item,
        warehouse_location_id: s.warehouse_location_id,
        warehouse_location: s.warehouse_location,
        bin_location_id: s.bin_location_id,
        bin_location: s.bin_location,
        inventory_status: s.inventory_status,
        default_inventory_location_id: s.warehouse_location_id,
        default_bin_location_id: s.bin_location_id,
      }));
      await base44.entities.InventoryMaster.bulkUpdate(updates);
      setUndoData(null);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      toast({ title: 'Assignment undone', description: `${undoData.count} item(s) reverted.` });
      refresh();
      onDataChange?.();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Undo failed', description: e.message });
    }
  };

  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); }, []);

  if (locations.length === 0 || bins.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Assign Materials to Bins</h2>
        <div className="p-4 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Complete Steps 1 and 2 first — you need at least one warehouse location and one bin.
        </div>
      </div>
    );
  }

  // ── Path A: Session-scoped assignments completed (only when ALL bins are valid) ──
  if (hasSessionAssignments && hasValidBins && !loading && stockedFilter === 'stocked_only') {
    return <AssignmentCompleteCard assignedCount={sessionAssignmentCount} onContinue={onContinue} />;
  }

  // ── Path B: User confirmed no materials ──
  if (isCompleteViaNoMaterials) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
          <PackageX className="w-10 h-10 text-blue-600" />
        </div>
        <h2 className="text-xl font-bold">No Materials Assigned</h2>
        <p className="text-sm text-muted-foreground">
          You confirmed that no materials will be stocked in this warehouse setup. Inventory Count will contain zero items.
        </p>
        <div className="flex gap-2 mt-2">
          <Button variant="outline" onClick={() => { onSessionUpdate?.({ ...session, no_materials_confirmed: false }); }}>
            Assign Materials Instead
          </Button>
          <Button onClick={onContinue} size="lg">
            Continue to Inventory Count
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Assign Materials to Bins</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Select items, choose a warehouse and bin, then click Assign Selected. Stocked status is set automatically.
        </p>
      </div>

      {/* Session-scoped metrics — separated from global catalog counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg border bg-blue-50 border-blue-200">
          <p className="text-2xl font-bold text-blue-600">{sessionAssignmentCount}</p>
          <p className="text-xs text-blue-700">Assigned in This Setup</p>
        </div>
        <div className="p-3 rounded-lg border bg-card">
          <p className="text-2xl font-bold">{localTotals.stocked_assigned?.toLocaleString() || 0}</p>
          <p className="text-xs text-muted-foreground">Catalog Assigned (All)</p>
        </div>
        <div className="p-3 rounded-lg border bg-green-50 border-green-200">
          <p className="text-2xl font-bold text-green-600">{localTotals.stocked?.toLocaleString() || 0}</p>
          <p className="text-xs text-green-700">Stocked Items (Catalog)</p>
        </div>
        <div className="p-3 rounded-lg border bg-amber-50 border-amber-200">
          <p className="text-2xl font-bold text-amber-600">{localTotals.stocked_unassigned?.toLocaleString() || 0}</p>
          <p className="text-xs text-amber-700">Missing Bin (Catalog)</p>
        </div>
      </div>

      <WarehouseSummaryCard warehouses={warehouseSummary} />

      {undoData && <UndoBanner count={undoData.count} binCode={undoData.binCode} onUndo={handleUndo} />}

      {/* ── Invalid bin warning: assigned items with bins in other warehouses or missing bins ── */}
      {invalidBinItems.length > 0 && (
        <div className="p-4 rounded-md border border-red-300 bg-red-50 space-y-2">
          <div className="flex items-center gap-2 text-sm text-red-900">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-semibold">{invalidBinItems.length} assigned item(s) have invalid bin assignments</p>
              <p>These items must be moved to a bin in <strong>{sessionWarehouseName}</strong> before this setup can proceed to Inventory Count.</p>
            </div>
          </div>
          <ul className="text-xs text-red-800 space-y-1 ml-7">
            {invalidBinItems.map(item => (
              <li key={item.id} className="flex items-center gap-2">
                <span className="font-medium">{item.item_name}</span>
                {item.sku ? <span className="text-red-600">({item.sku})</span> : null}
                <span className="text-muted-foreground">
                  {item.warehouse_location || 'No warehouse'} · {item.bin_location || 'No bin'}
                </span>
                <ArrowRight className="w-3 h-3 text-red-500 shrink-0" />
                <span className="text-red-700">{item.invalid_reason}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-red-700">Select the item(s) below, choose a destination bin in {sessionWarehouseName}, and click Assign Selected to move them.</p>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, SKU, description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-transparent pl-8 pr-3 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <select value={stockedFilter} onChange={(e) => setStockedFilter(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm">
          <option value="stocked_only">Stocked Items Only</option>
          <option value="not_stocked">Not Stocked</option>
          <option value="all">All Materials</option>
        </select>
        <select value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm">
          <option value="all">All</option>
          <option value="assigned">Assigned to Bin</option>
          <option value="unassigned">Missing Bin</option>
        </select>
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm">
          <option value="">All Locations</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {/* Assignment action bar */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-md bg-accent/10 border border-accent/20 sticky top-0 z-10">
        <button onClick={handleSelectAll} className="text-xs font-medium text-muted-foreground hover:text-foreground mr-1">
          {selectedIds.size === localMaterials.length && localMaterials.length > 0 ? 'Deselect All' : 'Select All'}
        </button>
        <span className="text-sm font-medium">{selectedIds.size} selected</span>
        <span className="text-xs font-medium text-muted-foreground px-2 py-1 rounded-md border border-input bg-muted/30 whitespace-nowrap">
          <MapPin className="w-3 h-3 inline mr-1" />{sessionWarehouseName || 'No warehouse set'}
        </span>
        <select value={bulkBinId} onChange={(e) => setBulkBinId(e.target.value)} disabled={!canAssign || !sessionWarehouseId} className="h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm disabled:opacity-40">
          <option value="">Bin...</option>
          {filteredBulkBins.map(b => <option key={b.id} value={b.id}>{b.bin_code}</option>)}
        </select>
        <button
          onClick={handleAssignSelected}
          disabled={assigning || !canAssign || selectedIds.size === 0 || !bulkLocId || !bulkBinId}
          className="inline-flex items-center gap-1.5 h-8 px-4 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/90 disabled:opacity-40"
        >
          {assigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Assign Selected
        </button>
        {/* Path B: No Materials button */}
        <button
          onClick={() => setShowNoMaterialsDialog(true)}
          disabled={assigning || sessionAssignmentCount > 0}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-input text-xs font-medium text-muted-foreground hover:bg-muted/50 disabled:opacity-40 ml-auto"
        >
          <PackageX className="w-3.5 h-3.5" />
          No Materials to Assign
        </button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && localMaterials.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && localMaterials.length === 0 && !error && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Package className="w-10 h-10 text-muted-foreground" />
          <p className="font-medium">No materials match the current filters.</p>
          {stockedFilter === 'stocked_only' && (
            <p className="text-sm text-muted-foreground">Try changing the filter to "All Materials" to see non-stocked items.</p>
          )}
        </div>
      )}

      {localMaterials.length > 0 && (
        <div className="space-y-2 max-w-3xl">
          {localMaterials.map(item => (
            <MaterialRow
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              onToggleSelect={() => handleToggleSelect(item.id)}
            />
          ))}
        </div>
      )}

      {hasMore && !loading && (
        <button onClick={loadMore} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md border border-input text-sm font-medium hover:bg-accent/10">
          <ChevronDown className="w-4 h-4" /> Load More
        </button>
      )}

      {moveDialog && (
        <MoveConfirmationDialog
          open={true}
          items={moveDialog.items}
          sessionWarehouseName={sessionWarehouseName}
          availableBins={sessionBins}
          initialBinId={bulkBinId}
          onConfirm={(binId) => performAssignment(moveDialog.allItems, sessionWarehouseId, binId)}
          onCancel={() => setMoveDialog(null)}
        />
      )}

      <NoMaterialsConfirmDialog
        open={showNoMaterialsDialog}
        onConfirm={async () => {
          setShowNoMaterialsDialog(false);
          try {
            const updated = await confirmNoMaterials(session?.id);
            if (updated && onSessionUpdate) onSessionUpdate(updated);
          } catch (e) {
            toast({ variant: 'destructive', title: 'Failed to confirm', description: e.message });
          }
        }}
        onCancel={() => setShowNoMaterialsDialog(false)}
      />
    </div>
  );
}