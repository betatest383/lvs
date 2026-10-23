import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Loader2, Search, MapPin, PackageX, AlertTriangle, ArrowRight, CheckCircle2, Package, Scan, Camera, X, Plus, ChevronDown } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { useWarehouseMaterials } from '@/hooks/useWarehouseMaterials';
import { recordAssignments, confirmNoMaterials, stockAndCount } from '@/lib/warehouseSetupSession';
import { MoveConfirmationDialog, NoMaterialsConfirmDialog } from './AssignmentDialogs';

const STATUS_CONFIG = {
  unprocessed: { label: 'Unprocessed', color: 'bg-muted text-muted-foreground', dot: 'bg-gray-400' },
  missing_bin: { label: 'Missing Bin', color: 'bg-amber-50 text-amber-700 border border-amber-200', dot: 'bg-amber-500' },
  missing_count: { label: 'Missing Count', color: 'bg-blue-50 text-blue-700 border border-blue-200', dot: 'bg-blue-500' },
  ready_for_review: { label: 'Ready', color: 'bg-green-50 text-green-700 border border-green-200', dot: 'bg-green-500' },
  completed: { label: 'Completed', color: 'bg-purple-50 text-purple-700 border border-purple-200', dot: 'bg-purple-500' },
};

export default function StepStockAndCount({ locations, bins, onDataChange, permissions, onContinue, session, onSessionUpdate, onValidityChange, onCountChange }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [assignedItems, setAssignedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentItemId, setCurrentItemId] = useState(null);
  const [binId, setBinId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState(new Set());
  const [showNoMaterialsDialog, setShowNoMaterialsDialog] = useState(false);
  const [showMoveConfirm, setShowMoveConfirm] = useState(false);
  const [pendingAdvance, setPendingAdvance] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const qtyRef = useRef(null);
  const binRef = useRef(null);

  const sessionWarehouseId = session?.warehouse_location_id || '';
  const sessionWarehouseName = session?.warehouse_location_name || '';
  const sessionBins = useMemo(() => (bins || []).filter(b => b.warehouse_location_id === sessionWarehouseId), [bins, sessionWarehouseId]);
  const binsById = useMemo(() => new Map((bins || []).map(b => [b.id, b])), [bins]);

  // Parse counts from session.count_data_json
  const counts = useMemo(() => {
    try { return JSON.parse(session?.count_data_json || '{}'); } catch { return {}; }
  }, [session?.count_data_json]);

  // Fetch assigned items
  const fetchAssignedItems = useCallback(async () => {
    const ids = session?.assigned_item_ids || [];
    if (ids.length === 0) { setAssignedItems([]); setLoading(false); return; }
    setLoading(true);
    try {
      const fetched = await Promise.all(ids.map(id => base44.entities.InventoryMaster.get(id).catch(() => null)));
      setAssignedItems(fetched.filter(Boolean));
    } catch (e) { console.error('Failed to fetch assigned items:', e); }
    finally { setLoading(false); }
  }, [session?.assigned_item_ids, session?.id]);

  useEffect(() => { fetchAssignedItems(); }, [fetchAssignedItems]);

  // Compute item statuses
  const itemsWithStatus = useMemo(() => {
    return assignedItems.map(item => {
      const binObj = item.bin_location_id ? binsById.get(item.bin_location_id) : null;
      const hasValidBin = binObj && binObj.warehouse_location_id === sessionWarehouseId;
      const hasCount = counts[item.id]?.count !== undefined && counts[item.id]?.count !== '';
      let status = 'unprocessed';
      if (hasValidBin && hasCount) status = 'ready_for_review';
      else if (hasCount && !hasValidBin) status = 'missing_bin';
      else if (hasValidBin && !hasCount) status = 'missing_count';
      return { ...item, status, count_data: counts[item.id], hasValidBin, hasCount, binObj };
    });
  }, [assignedItems, binsById, counts, sessionWarehouseId]);

  // Progress
  const progress = useMemo(() => {
    let ready = 0, missingBin = 0, missingCount = 0, unprocessed = 0;
    itemsWithStatus.forEach(item => {
      if (item.status === 'ready_for_review') ready++;
      else if (item.status === 'missing_bin') missingBin++;
      else if (item.status === 'missing_count') missingCount++;
      else unprocessed++;
    });
    return { total: itemsWithStatus.length, ready, missingBin, missingCount, unprocessed };
  }, [itemsWithStatus]);

  // Notify wizard of validity (all items ready_for_review or no_materials_confirmed)
  const noMaterialsConfirmed = session?.no_materials_confirmed || false;
  const allReady = progress.total > 0 && progress.ready === progress.total;
  useEffect(() => {
    onValidityChange?.(allReady);
  }, [allReady, onValidityChange]);

  // Auto-select first unprocessed item
  useEffect(() => {
    if (!currentItemId && itemsWithStatus.length > 0) {
      const firstUnprocessed = itemsWithStatus.find(i => i.status === 'unprocessed') || itemsWithStatus.find(i => i.status === 'missing_bin') || itemsWithStatus.find(i => i.status === 'missing_count') || itemsWithStatus[0];
      if (firstUnprocessed) selectItem(firstUnprocessed);
    }
  }, [itemsWithStatus, currentItemId]);

  const selectItem = (item) => {
    setCurrentItemId(item.id);
    setBinId(item.bin_location_id && item.hasValidBin ? item.bin_location_id : '');
    setQuantity(item.count_data?.count ?? '');
    setPhotoUrl(item.count_data?.photo_ids?.[0] || '');
    setNotes(item.count_data?.notes || '');
    // Focus bin or quantity after render
    setTimeout(() => {
      if (!item.hasValidBin && binRef.current) binRef.current.focus();
      else if (qtyRef.current) qtyRef.current.focus();
    }, 50);
  };

  const currentItem = itemsWithStatus.find(i => i.id === currentItemId);
  const isCrossWarehouse = currentItem?.warehouse_location_id && currentItem.warehouse_location_id !== sessionWarehouseId;

  // ── Handle photo upload ──
  const handlePhotoUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      const data = res.data || res;
      setPhotoUrl(data.file_url);
      toast({ title: 'Photo uploaded' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Upload failed', description: e.message });
    } finally { setUploading(false); }
  };

  // ── Handle save (core logic for both Save and Save & Next) ──
  const handleSave = async (advance) => {
    if (!currentItem) return;
    if (!binId) {
      toast({ variant: 'destructive', title: 'Select a bin', description: `Choose a bin in ${sessionWarehouseName}.` });
      return;
    }

    // Cross-warehouse confirmation
    if (isCrossWarehouse && !showMoveConfirm) {
      setShowMoveConfirm(true);
      setPendingAdvance(advance);
      return;
    }

    setSaving(true);
    setShowMoveConfirm(false);
    try {
      const result = await stockAndCount(
        session.id, currentItem.id, binId,
        quantity === '' ? 0 : Number(quantity),
        photoUrl ? [photoUrl] : [],
        notes
      );

      if (result.error) throw new Error(result.error);

      // Update wizard counts state from the returned session
      let newCounts = {};
      try { newCounts = JSON.parse(result.session?.count_data_json || '{}'); } catch { newCounts = {}; }
      onCountChange?.(newCounts);
      if (onSessionUpdate) onSessionUpdate(result.session);

      // Refresh assigned items
      await fetchAssignedItems();
      onDataChange?.();

      toast({ title: 'Saved', description: `${currentItem.item_name} → ${sessionBins.find(b => b.id === binId)?.bin_code || ''}, qty: ${quantity === '' ? 0 : quantity}` });

      if (advance) {
        // Find next unprocessed item
        const next = itemsWithStatus.find(i => i.id !== currentItem.id && (i.status === 'unprocessed' || i.status === 'missing_bin' || i.status === 'missing_count'));
        if (next) {
          selectItem(next);
        } else {
          toast({ title: 'All items stocked and counted!', description: 'Proceed to Review Exceptions.' });
        }
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'Save failed', description: e.message });
    } finally {
      setSaving(false);
      setPendingAdvance(false);
    }
  };

  const handleSkip = () => {
    const next = itemsWithStatus.find(i => i.id !== currentItemId && (i.status === 'unprocessed' || i.status === 'missing_bin' || i.status === 'missing_count'));
    if (next) selectItem(next);
    else toast({ title: 'No more unprocessed items' });
  };

  // ── Barcode scan ──
  const handleBarcodeSearch = (e) => {
    if (e.key === 'Enter' && barcodeInput.trim()) {
      e.preventDefault();
      const matched = itemsWithStatus.find(i => i.barcode === barcodeInput.trim() || i.sku === barcodeInput.trim());
      if (matched) {
        selectItem(matched);
        setBarcodeInput('');
      } else {
        toast({ variant: 'destructive', title: 'No match', description: `No session item matches "${barcodeInput}".` });
      }
    }
  };

  // ── Add items panel (bulk selection) ──
  const { materials: catalogItems, loading: catalogLoading, search: catalogSearch, setSearch: setCatalogSearch, hasMore, loadMore } = useWarehouseMaterials({ initialStockedFilter: 'all', initialPageSize: 30 });

  const handleAddSelectedToSession = async () => {
    if (selectedToAdd.size === 0) return;
    setSaving(true);
    try {
      const ids = Array.from(selectedToAdd);
      const updated = await recordAssignments(session.id, ids);
      if (updated && onSessionUpdate) onSessionUpdate(updated);
      setSelectedToAdd(new Set());
      setShowAddPanel(false);
      await fetchAssignedItems();
      toast({ title: `${ids.length} item(s) added to session` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Failed to add items', description: e.message });
    } finally { setSaving(false); }
  };

  // ── Early returns ──
  if (locations.length === 0 || bins.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Stock & Count Materials</h2>
        <div className="p-4 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Complete Steps 1 and 2 first — you need at least one warehouse location and one bin.
        </div>
      </div>
    );
  }

  if (noMaterialsConfirmed && assignedItems.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
          <PackageX className="w-10 h-10 text-blue-600" />
        </div>
        <h2 className="text-xl font-bold">No Materials to Stock</h2>
        <p className="text-sm text-muted-foreground">You confirmed that no materials will be stocked in this warehouse setup.</p>
        <div className="flex gap-2 mt-2">
          <Button variant="outline" onClick={async () => {
            const updated = await confirmNoMaterials(session.id);
            // Toggle off by calling the function - it will set no_materials_confirmed to false
            if (onSessionUpdate) onSessionUpdate({ ...session, no_materials_confirmed: false });
          }}>Add Materials Instead</Button>
          <Button onClick={onContinue} size="lg">Continue to Review Exceptions</Button>
        </div>
      </div>
    );
  }

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
        <h2 className="text-xl font-bold">Stock & Count Materials</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Select a material, assign a bin in <strong>{sessionWarehouseName}</strong>, enter its opening quantity, and save — all in one step.
        </p>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">{progress.ready} of {progress.total} stocked and counted</span>
            <span className="text-muted-foreground">{progress.total > 0 ? Math.round((progress.ready / progress.total) * 100) : 0}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
            <div className="bg-green-500 h-full transition-all" style={{ width: `${progress.total > 0 ? (progress.ready / progress.total) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="flex gap-2 text-xs">
          {progress.missingBin > 0 && <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">{progress.missingBin} missing bin</span>}
          {progress.missingCount > 0 && <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">{progress.missingCount} missing count</span>}
          {progress.unprocessed > 0 && <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground">{progress.unprocessed} unprocessed</span>}
        </div>
      </div>

      {/* Barcode scan + Add items toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Scan className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Scan barcode or enter SKU..."
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            onKeyDown={handleBarcodeSearch}
            className="w-full h-9 rounded-md border border-input bg-transparent pl-8 pr-3 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowAddPanel(!showAddPanel)}>
          <Plus className="w-4 h-4" /> {showAddPanel ? 'Hide' : 'Add Items'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowNoMaterialsDialog(true)} disabled={assignedItems.length > 0}>
          <PackageX className="w-4 h-4" /> No Materials
        </Button>
      </div>

      {/* Add items panel */}
      {showAddPanel && (
        <div className="p-3 rounded-md border bg-muted/30 space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by SKU, name, manufacturer, vendor part number..."
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-transparent pl-8 pr-3 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {catalogLoading && <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" /></div>}
            {!catalogLoading && catalogItems.filter(m => !assignedItems.find(a => a.id === m.id)).map(item => (
              <label key={item.id} className="flex items-center gap-2 p-2 rounded-md border bg-card cursor-pointer hover:bg-accent/5">
                <input
                  type="checkbox"
                  checked={selectedToAdd.has(item.id)}
                  onChange={() => {
                    setSelectedToAdd(prev => {
                      const next = new Set(prev);
                      if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                      return next;
                    });
                  }}
                  className="w-4 h-4 rounded shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.item_name}</p>
                  <p className="text-xs text-muted-foreground">{item.sku || item.inventory_id} · {item.inventory_type}</p>
                </div>
              </label>
            ))}
            {!catalogLoading && hasMore && (
              <button onClick={loadMore} className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-2">
                <ChevronDown className="w-4 h-4 inline" /> Load More
              </button>
            )}
          </div>
          {selectedToAdd.size > 0 && (
            <Button size="sm" onClick={handleAddSelectedToSession} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add {selectedToAdd.size} item(s) to Session
            </Button>
          )}
        </div>
      )}

      {/* Two-column layout: item list + detail */}
      <div className="grid md:grid-cols-[300px_1fr] gap-4">
        {/* Item list */}
        <div className="space-y-1 max-h-[500px] overflow-y-auto">
          {itemsWithStatus.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Package className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No items in session yet.</p>
              <p className="text-xs text-muted-foreground">Click "Add Items" to select materials.</p>
            </div>
          )}
          {itemsWithStatus.map(item => {
            const cfg = STATUS_CONFIG[item.status];
            const isCurrent = item.id === currentItemId;
            return (
              <button
                key={item.id}
                onClick={() => selectItem(item)}
                className={`w-full text-left flex items-center gap-2 p-2.5 rounded-md border transition-colors ${
                  isCurrent ? 'border-accent bg-accent/10' : 'border-border bg-card hover:bg-accent/5'
                }`}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.item_name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {item.sku || 'No SKU'}
                    {item.bin_location ? ` · ${item.bin_location}` : ''}
                  </p>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${cfg.color}`}>{cfg.label}</span>
              </button>
            );
          })}
        </div>

        {/* Item detail panel */}
        {currentItem ? (
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold">{currentItem.item_name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {currentItem.sku || currentItem.inventory_id || 'No SKU'} · {currentItem.inventory_type} · {currentItem.unit || 'ea'}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${STATUS_CONFIG[currentItem.status].color}`}>
                  {STATUS_CONFIG[currentItem.status].label}
                </span>
              </div>
            </div>

            {/* Current assignment */}
            <div className="p-3 rounded-md bg-muted/30 text-sm">
              <p className="text-xs text-muted-foreground mb-1">Current Assignment</p>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span>{currentItem.warehouse_location || 'No warehouse'} · {currentItem.bin_location || 'No bin'}</span>
              </div>
            </div>

            {/* Cross-warehouse warning */}
            {isCrossWarehouse && (
              <div className="p-3 rounded-md border border-amber-300 bg-amber-50 flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-900">
                  <p className="font-semibold">Cross-warehouse move required</p>
                  <p>This item is currently in <strong>{currentItem.warehouse_location}</strong>. Moving it to <strong>{sessionWarehouseName}</strong> will be recorded in the assignment history.</p>
                </div>
              </div>
            )}

            {/* Bin selector (session warehouse only) */}
            <div>
              <label className="text-sm font-medium mb-1 block">Destination Bin (in {sessionWarehouseName})</label>
              <select
                ref={binRef}
                value={binId}
                onChange={(e) => setBinId(e.target.value)}
                disabled={saving}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
              >
                <option value="">Select a bin...</option>
                {sessionBins.map(b => <option key={b.id} value={b.id}>{b.bin_code}</option>)}
              </select>
              {sessionBins.length === 0 && (
                <p className="text-xs text-destructive mt-1">No bins found in {sessionWarehouseName}. Add bins in Step 2.</p>
              )}
            </div>

            {/* Quantity */}
            <div>
              <label className="text-sm font-medium mb-1 block">Opening Quantity (0 is valid)</label>
              <input
                ref={qtyRef}
                type="number"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !saving) handleSave(true); }}
                placeholder="0"
                disabled={saving}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
              />
            </div>

            {/* Photo upload */}
            <div>
              <label className="text-sm font-medium mb-1 block">Stocked-Shelf Photo (optional)</label>
              {photoUrl ? (
                <div className="flex items-center gap-2">
                  <img src={photoUrl} alt="shelf" className="w-16 h-16 rounded-md object-cover border" />
                  <Button variant="ghost" size="sm" onClick={() => setPhotoUrl('')}><X className="w-4 h-4" /> Remove</Button>
                </div>
              ) : (
                <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                  <Camera className="w-4 h-4" />
                  {uploading ? 'Uploading...' : 'Upload Photo'}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && handlePhotoUpload(e.target.files[0])} disabled={uploading || saving} />
                </label>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="text-sm font-medium mb-1 block">Notes (optional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes..."
                disabled={saving}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-2">
              <Button variant="ghost" onClick={handleSkip} disabled={saving}>Skip</Button>
              <Button variant="outline" onClick={() => handleSave(false)} disabled={saving || !binId}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save
              </Button>
              <Button onClick={() => handleSave(true)} disabled={saving || !binId} className="flex-1">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Save & Next
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border bg-card flex flex-col items-center justify-center py-12 text-center">
            <Package className="w-10 h-10 text-muted-foreground mb-2" />
            <p className="font-medium">Select an item from the list</p>
            <p className="text-sm text-muted-foreground">Or add new items using "Add Items" above.</p>
          </div>
        )}
      </div>

      {/* All ready card */}
      {allReady && progress.total > 0 && (
        <div className="p-4 rounded-md border border-green-300 bg-green-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <p className="text-sm font-medium text-green-900">All {progress.total} item(s) are stocked and counted.</p>
          </div>
          <Button onClick={onContinue} size="sm">Continue to Review Exceptions <ArrowRight className="w-4 h-4" /></Button>
        </div>
      )}

      {/* Move confirmation dialog for cross-warehouse transfers */}
      {showMoveConfirm && currentItem && (
        <MoveConfirmationDialog
          open={true}
          items={[currentItem]}
          sessionWarehouseName={sessionWarehouseName}
          availableBins={sessionBins}
          initialBinId={binId}
          onConfirm={(confirmedBinId) => { setBinId(confirmedBinId); handleSave(pendingAdvance); }}
          onCancel={() => { setShowMoveConfirm(false); setPendingAdvance(false); }}
        />
      )}

      <NoMaterialsConfirmDialog
        open={showNoMaterialsDialog}
        onConfirm={async () => {
          setShowNoMaterialsDialog(false);
          try {
            const updated = await confirmNoMaterials(session.id);
            if (updated && onSessionUpdate) onSessionUpdate(updated);
          } catch (e) { toast({ variant: 'destructive', title: 'Failed', description: e.message }); }
        }}
        onCancel={() => setShowNoMaterialsDialog(false)}
      />
    </div>
  );
}