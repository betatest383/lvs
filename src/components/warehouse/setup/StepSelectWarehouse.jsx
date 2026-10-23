import React, { useState, useMemo, useEffect } from 'react';
import { Search, Plus, Loader2, CheckCircle2, X, AlertTriangle, Building2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';
import { selectWarehouse } from '@/lib/warehouseSetupSession';
import DuplicateSessionDialog from './DuplicateSessionDialog';
import WarehouseChangeWarningDialog from './WarehouseChangeWarningDialog';

const RECENT_KEY = 'wh-setup-recent-warehouses';

function getRecentWarehouseIds() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
function addRecentWarehouse(id) {
  try {
    const recent = getRecentWarehouseIds().filter(wid => wid !== id);
    recent.unshift(id);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 10)));
  } catch {}
}

export default function StepSelectWarehouse({ locations, bins, session, permissions, onDataChange, onSessionUpdate, preselectedWarehouseId }) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', location_code: '', address: '', city: '', state: '', zip_code: '', notes: '' });
  const [creating, setCreating] = useState(false);
  const [selecting, setSelecting] = useState(null);
  const [duplicateInfo, setDuplicateInfo] = useState(null);
  const [changeWarning, setChangeWarning] = useState(null);
  const [addressWarnings, setAddressWarnings] = useState([]);

  const canCreate = permissions?.can_create_location;
  const canReactivate = permissions?.can_reactivate_warehouse;
  const recentIds = useMemo(() => getRecentWarehouseIds(), []);
  const selectedWarehouse = locations.find(l => l.id === session?.warehouse_location_id);

  useEffect(() => {
    if (preselectedWarehouseId && session?.id && session.warehouse_location_id !== preselectedWarehouseId) {
      handleSelect(preselectedWarehouseId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedWarehouseId, session?.id]);

  const filteredLocations = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = locations;
    if (q) {
      list = list.filter(l =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.location_code || '').toLowerCase().includes(q) ||
        (l.address || '').toLowerCase().includes(q) ||
        (l.city || '').toLowerCase().includes(q) ||
        (l.notes || '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const aActive = a.is_active !== false ? 0 : 1;
      const bActive = b.is_active !== false ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      const aRecent = recentIds.indexOf(a.id);
      const bRecent = recentIds.indexOf(b.id);
      if (aRecent !== -1 && bRecent !== -1) return aRecent - bRecent;
      if (aRecent !== -1) return -1;
      if (bRecent !== -1) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [locations, search, recentIds]);

  const binCountFor = (warehouseId) => bins.filter(b => b.warehouse_location_id === warehouseId && b.is_active !== false).length;

  const handleSelect = async (warehouseId) => {
    if (!session?.id || !warehouseId) return;
    if (session.warehouse_location_id === warehouseId) return;

    setSelecting(warehouseId);
    try {
      const result = await selectWarehouse(session.id, warehouseId);
      if (result.session) onSessionUpdate(result.session);
      addRecentWarehouse(warehouseId);
      if (result.duplicate_sessions?.length > 0) {
        setDuplicateInfo({ warehouse: result.warehouse, sessions: result.duplicate_sessions });
      }
      toast({ title: 'Warehouse selected', description: result.warehouse?.name });
    } catch (e) {
      const errData = e.response?.data || {};
      if (errData.requires_reset) {
        setChangeWarning({
          warehouseId,
          warehouseName: filteredLocations.find(l => l.id === warehouseId)?.name || 'this warehouse',
          hasItems: errData.has_assigned_items,
          hasCounts: errData.has_counts,
          currentWarehouse: errData.current_warehouse_name,
        });
      } else if (errData.warehouse_inactive) {
        toast({ variant: 'destructive', title: 'Cannot reactivate warehouse', description: errData.error });
      } else {
        toast({ variant: 'destructive', title: 'Failed to select warehouse', description: errData.error || e.message });
      }
    } finally {
      setSelecting(null);
    }
  };

  const handleForceReset = async () => {
    const warehouseId = changeWarning?.warehouseId;
    if (!warehouseId) { setChangeWarning(null); return; }
    setChangeWarning(null);
    setSelecting(warehouseId);
    try {
      const result = await selectWarehouse(session.id, warehouseId, true);
      if (result.session) onSessionUpdate(result.session);
      addRecentWarehouse(warehouseId);
      toast({ title: 'Warehouse changed', description: `Previous assignments and counts cleared. Now using ${result.warehouse?.name}.` });
      onDataChange();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Failed to change warehouse', description: e.response?.data?.error || e.message });
    } finally {
      setSelecting(null);
    }
  };

  const handleCreate = async (bypassAddressCheck = false) => {
    if (!createForm.name.trim()) {
      toast({ variant: 'destructive', title: 'Name is required' });
      return;
    }
    setCreating(true);
    if (!bypassAddressCheck) {
      setAddressWarnings([]);
      const normalizedAddress = (createForm.address || '').trim().toLowerCase();
      if (normalizedAddress) {
        const matches = locations.filter(l =>
          (l.address || '').trim().toLowerCase() === normalizedAddress && l.is_active !== false
        );
        if (matches.length > 0) {
          setAddressWarnings(matches.map(m => `${m.name} (${m.location_code})`));
          setCreating(false);
          return;
        }
      }
    }
    try {
      const res = await base44.functions.invoke('manageWarehouseLocation', {
        action: 'create',
        data: {
          name: createForm.name.trim(),
          location_code: createForm.location_code.trim() || undefined,
          location_type: 'warehouse',
          address: createForm.address.trim(),
          city: createForm.city.trim(),
          state: createForm.state.trim(),
          zip_code: createForm.zip_code.trim(),
          is_active: true,
          notes: createForm.notes.trim(),
        },
      });
      const newLoc = (res.data || res).location;
      toast({ title: 'Warehouse created', description: newLoc.name });
      setCreateForm({ name: '', location_code: '', address: '', city: '', state: '', zip_code: '', notes: '' });
      setShowCreateForm(false);
      setAddressWarnings([]);
      await onDataChange();
      if (newLoc.id && session?.id) {
        const result = await selectWarehouse(session.id, newLoc.id);
        if (result.session) onSessionUpdate(result.session);
        addRecentWarehouse(newLoc.id);
      }
    } catch (e) {
      const errData = e.response?.data || {};
      toast({ variant: 'destructive', title: 'Failed to create warehouse', description: errData.error || e.message });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Select Warehouse</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose an existing warehouse to stock and count inventory.
          {locations.length > 0 && <span className="text-green-600 font-medium"> {locations.length} warehouse(s) available.</span>}
        </p>
      </div>

      {/* Selected Warehouse Details */}
      {selectedWarehouse && (
        <div className="p-4 rounded-lg border-2 border-accent bg-accent/5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <div className="space-y-2 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-base">{selectedWarehouse.name}</h3>
                {selectedWarehouse.is_active === false && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Inactive</span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Code:</span>{' '}
                  <span className="font-mono font-medium">{selectedWarehouse.location_code || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Address:</span>{' '}
                  <span className="font-medium">{[selectedWarehouse.address, selectedWarehouse.city, selectedWarehouse.state].filter(Boolean).join(', ') || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>{' '}
                  <span className="font-medium">{selectedWarehouse.is_active === false ? 'Inactive' : 'Active'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Active Bins:</span>{' '}
                  <span className="font-medium">{binCountFor(selectedWarehouse.id)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Form or Search + List */}
      {showCreateForm ? (
        <div className="space-y-4 p-4 rounded-lg border bg-card">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Add New Warehouse</h3>
            <Button variant="ghost" size="sm" onClick={() => { setShowCreateForm(false); setAddressWarnings([]); }}>
              <X className="w-4 h-4" /> Cancel
            </Button>
          </div>
          {addressWarnings.length > 0 && (
            <div className="p-3 rounded-md border border-amber-200 bg-amber-50 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 inline mr-1" />
              Possible address match: {addressWarnings.join(', ')}. Continue anyway if this is a different location.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Name *</label>
              <input value={createForm.name} onChange={(e) => setCreateForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Main Warehouse" className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
            <div>
              <label className="text-sm font-medium">Code</label>
              <input value={createForm.location_code} onChange={(e) => setCreateForm(f => ({ ...f, location_code: e.target.value }))} placeholder="Auto-generated if blank" className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Address</label>
              <input value={createForm.address} onChange={(e) => setCreateForm(f => ({ ...f, address: e.target.value }))} placeholder="Street address" className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
            <div>
              <label className="text-sm font-medium">City</label>
              <input value={createForm.city} onChange={(e) => setCreateForm(f => ({ ...f, city: e.target.value }))} className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
            <div>
              <label className="text-sm font-medium">State</label>
              <input value={createForm.state} onChange={(e) => setCreateForm(f => ({ ...f, state: e.target.value }))} className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
            <div>
              <label className="text-sm font-medium">Zip Code</label>
              <input value={createForm.zip_code} onChange={(e) => setCreateForm(f => ({ ...f, zip_code: e.target.value }))} className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => handleCreate(false)} disabled={creating || !createForm.name.trim()}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create &amp; Select
            </Button>
            {addressWarnings.length > 0 && (
              <Button variant="outline" onClick={() => handleCreate(true)} disabled={creating}>
                Create Anyway
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, code, address, city..."
              className="w-full h-9 pl-9 rounded-md border border-input bg-transparent text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-2">
            {filteredLocations.length === 0 ? (
              <div className="p-6 text-center rounded-lg border bg-muted/30">
                <p className="text-sm text-muted-foreground">
                  {search ? 'No warehouses match your search.' : 'No warehouses created yet.'}
                </p>
              </div>
            ) : (
              filteredLocations.map(loc => {
                const isSelected = session?.warehouse_location_id === loc.id;
                const isInactive = loc.is_active === false;
                const binCount = binCountFor(loc.id);
                const isRecent = recentIds.includes(loc.id);
                const inactiveLocked = isInactive && !canReactivate;
                return (
                  <button
                    key={loc.id}
                    onClick={() => !inactiveLocked && handleSelect(loc.id)}
                    disabled={inactiveLocked || selecting === loc.id}
                    className={`w-full flex items-center gap-3 p-3 rounded-md border text-left transition-colors ${
                      isSelected ? 'border-accent bg-accent/10' : 'bg-card hover:bg-accent/5'
                    } ${inactiveLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className={`flex items-center justify-center w-10 h-10 rounded-md shrink-0 ${isSelected ? 'bg-accent text-accent-foreground' : 'bg-muted'}`}>
                      {selecting === loc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : isSelected ? <CheckCircle2 className="w-5 h-5" /> : <Building2 className="w-5 h-5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{loc.name}</p>
                        {isRecent && !isSelected && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">Recent</span>}
                        {isInactive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Inactive{canReactivate ? ' · Click to reactivate' : ''}</span>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span className="font-mono">{loc.location_code || 'No code'}</span>
                        {(loc.address || loc.city) && <span className="truncate">· {[loc.address, loc.city].filter(Boolean).join(', ')}</span>}
                        <span>· {binCount} bin{binCount !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    {!isSelected && !inactiveLocked && <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          {canCreate ? (
            <Button variant="outline" onClick={() => setShowCreateForm(true)} className="w-full max-w-md">
              <Plus className="w-4 h-4" /> Add New Warehouse
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              You don't have permission to create new warehouses. Contact an administrator if you need one added.
            </p>
          )}
        </>
      )}

      <DuplicateSessionDialog info={duplicateInfo} onClose={() => setDuplicateInfo(null)} />
      <WarehouseChangeWarningDialog warning={changeWarning} onCancel={() => setChangeWarning(null)} onConfirm={handleForceReset} />
    </div>
  );
}