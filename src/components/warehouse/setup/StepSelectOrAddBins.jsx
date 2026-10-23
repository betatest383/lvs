import React, { useState, useMemo } from 'react';
import { Plus, Loader2, Grid3x3, AlertCircle, CheckCircle2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';

export default function StepSelectOrAddBins({ locations, bins, session, permissions, onDataChange }) {
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ aisle: '', rack: '', shelf: '', bin: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const canCreateBin = permissions?.can_create_bin;
  const warehouseId = session?.warehouse_location_id;
  const selectedLocation = locations.find(l => l.id === warehouseId);

  const warehouseBins = useMemo(() => {
    return bins
      .filter(b => b.warehouse_location_id === warehouseId)
      .sort((a, b) => {
        const aActive = a.is_active !== false ? 0 : 1;
        const bActive = b.is_active !== false ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return (a.bin_code || '').localeCompare(b.bin_code || '');
      });
  }, [bins, warehouseId]);

  const activeBinCount = warehouseBins.filter(b => b.is_active !== false).length;
  const locationCode = selectedLocation?.location_code || 'WH';

  const binCode = useMemo(() => {
    if (!addForm.aisle && !addForm.rack && !addForm.shelf && !addForm.bin) return '';
    const a = addForm.aisle ? `A${String(addForm.aisle).padStart(2, '0')}` : '';
    const r = addForm.rack ? `R${String(addForm.rack).padStart(2, '0')}` : '';
    const s = addForm.shelf ? `S${String(addForm.shelf).padStart(2, '0')}` : '';
    const b = addForm.bin ? `B${String(addForm.bin).padStart(2, '0')}` : '';
    return [locationCode, a, r, s, b].filter(Boolean).join('-');
  }, [addForm, locationCode]);

  const handleCreateBin = async () => {
    if (!binCode) {
      toast({ variant: 'destructive', title: 'Fill in at least one bin component' });
      return;
    }
    setSaving(true);
    try {
      await base44.functions.invoke('manageBinLocation', {
        action: 'create',
        data: {
          bin_code: binCode,
          warehouse_location_id: warehouseId,
          warehouse_location_name: selectedLocation?.name || '',
          zone: addForm.rack,
          aisle: addForm.aisle ? `A${String(addForm.aisle).padStart(2, '0')}` : '',
          shelf: addForm.shelf ? `S${String(addForm.shelf).padStart(2, '0')}` : '',
          is_active: true,
          notes: addForm.notes.trim(),
        },
      });
      toast({ title: 'Bin created', description: binCode });
      setAddForm({ aisle: '', rack: '', shelf: '', bin: '', notes: '' });
      setShowAddForm(false);
      onDataChange();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Failed to create bin', description: e.response?.data?.error || e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Select or Add Bins</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {selectedLocation ? (
            <>Using bins from <span className="font-medium">{selectedLocation.name}</span>.{' '}
              {activeBinCount > 0
                ? <span className="text-green-600 font-medium">{activeBinCount} active bin(s) ready.</span>
                : <span className="text-amber-600 font-medium">No active bins yet — add at least one to continue.</span>}
            </>
          ) : 'Go back to Step 1 and select a warehouse first.'}
        </p>
      </div>

      {!warehouseId ? (
        <div className="p-4 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Go back to Step 1 and select a warehouse first.
        </div>
      ) : (
        <>
          <div>
            <h3 className="text-sm font-semibold mb-2">Bins in {selectedLocation?.name} ({warehouseBins.length})</h3>
            {warehouseBins.length === 0 ? (
              <div className="p-6 text-center rounded-lg border-2 border-dashed bg-muted/20">
                <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-1">No bins in this warehouse yet.</p>
                <p className="text-xs text-muted-foreground">At least one active bin is required before you can stock and count materials.</p>
                {canCreateBin && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowAddForm(true)}>
                    <Plus className="w-4 h-4" /> Add First Bin
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-w-4xl">
                {warehouseBins.map(b => (
                  <div key={b.id} className={`flex items-center gap-2 p-2.5 rounded-md border ${b.is_active !== false ? 'bg-card' : 'bg-muted/30 opacity-60'}`}>
                    <Grid3x3 className={`w-3.5 h-3.5 shrink-0 ${b.is_active !== false ? 'text-muted-foreground' : 'text-muted-foreground/50'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono font-medium">{b.bin_code}</p>
                      {b.zone && <p className="text-xs text-muted-foreground">Zone {b.zone}</p>}
                    </div>
                    {b.is_active !== false && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                  </div>
                ))}
              </div>
            )}
          </div>

          {canCreateBin && !showAddForm && (
            <Button variant="outline" onClick={() => setShowAddForm(true)}>
              <Plus className="w-4 h-4" /> Add Bin
            </Button>
          )}

          {showAddForm && (
            <div className="space-y-4 p-4 rounded-lg border bg-card">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Add Bin</h3>
                <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>Cancel</Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl">
                <div>
                  <label className="text-sm font-medium">Aisle</label>
                  <input type="number" min="1" value={addForm.aisle} onChange={(e) => setAddForm(f => ({ ...f, aisle: e.target.value }))} placeholder="1" className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">Rack</label>
                  <input type="number" min="1" value={addForm.rack} onChange={(e) => setAddForm(f => ({ ...f, rack: e.target.value }))} placeholder="1" className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">Shelf</label>
                  <input type="number" min="1" value={addForm.shelf} onChange={(e) => setAddForm(f => ({ ...f, shelf: e.target.value }))} placeholder="1" className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">Bin</label>
                  <input type="number" min="1" value={addForm.bin} onChange={(e) => setAddForm(f => ({ ...f, bin: e.target.value }))} placeholder="1" className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm" />
                </div>
              </div>
              {binCode && (
                <div className="p-3 rounded-md bg-muted/50 max-w-2xl">
                  <span className="text-xs uppercase text-muted-foreground">Generated Bin Code: </span>
                  <span className="font-mono font-bold text-sm">{binCode}</span>
                </div>
              )}
              <Button onClick={handleCreateBin} disabled={saving || !binCode}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create Bin
              </Button>
            </div>
          )}

          {!canCreateBin && activeBinCount === 0 && (
            <div className="p-3 rounded-md border border-amber-200 bg-amber-50 text-sm text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              This warehouse has no active bins. You don't have permission to create bins — contact a Warehouse Manager.
            </div>
          )}
        </>
      )}
    </div>
  );
}