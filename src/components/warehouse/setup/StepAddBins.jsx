import React, { useState, useMemo } from 'react';
import { Plus, Loader2, Grid3x3 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';

export default function StepAddBins({ locations, bins, onDataChange }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ warehouse_location_id: '', aisle: '', rack: '', shelf: '', bin: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const selectedLocation = locations.find(l => l.id === form.warehouse_location_id);
  const locationCode = selectedLocation?.location_code || 'WH';

  const binCode = useMemo(() => {
    if (!form.aisle && !form.rack && !form.shelf && !form.bin) return '';
    const a = form.aisle ? `A${String(form.aisle).padStart(2, '0')}` : '';
    const r = form.rack ? `R${String(form.rack).padStart(2, '0')}` : '';
    const s = form.shelf ? `S${String(form.shelf).padStart(2, '0')}` : '';
    const b = form.bin ? `B${String(form.bin).padStart(2, '0')}` : '';
    return [locationCode, a, r, s, b].filter(Boolean).join('-');
  }, [form.aisle, form.rack, form.shelf, form.bin, locationCode]);

  const handleSave = async () => {
    if (!form.warehouse_location_id) {
      toast({ variant: 'destructive', title: 'Select a warehouse location' });
      return;
    }
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
          warehouse_location_id: form.warehouse_location_id,
          warehouse_location_name: selectedLocation?.name || '',
          zone: form.rack,
          aisle: form.aisle ? `A${String(form.aisle).padStart(2, '0')}` : '',
          shelf: form.shelf ? `S${String(form.shelf).padStart(2, '0')}` : '',
          is_active: true,
          notes: form.notes.trim(),
        },
      });
      toast({ title: 'Bin created', description: binCode });
      setForm({ warehouse_location_id: form.warehouse_location_id, aisle: '', rack: '', shelf: '', bin: '', notes: '' });
      onDataChange();
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      toast({ variant: 'destructive', title: 'Failed to create bin', description: msg });
    } finally {
      setSaving(false);
    }
  };

  const suggestNextBin = () => {
    if (!form.warehouse_location_id || bins.length === 0) return null;
    const locBins = bins.filter(b => b.warehouse_location_id === form.warehouse_location_id);
    if (locBins.length === 0) return { aisle: '1', rack: '1', shelf: '1', bin: '1' };
    const last = locBins[locBins.length - 1];
    const parseNum = (str) => parseInt(String(str).replace(/\D/g, ''), 10) || 1;
    return {
      aisle: String(parseNum(last.aisle)),
      rack: String(parseNum(last.zone)),
      shelf: String(parseNum(last.shelf)),
      bin: String(parseNum(last.bin_code) + 1 || 1),
    };
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Add Bin Locations</h2>
        <p className="text-sm text-muted-foreground mt-1">Physically label racks and shelves, then create the matching bin in the system.</p>
      </div>

      {locations.length === 0 ? (
        <div className="p-4 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Go back to Step 1 and create a warehouse location first.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 max-w-3xl">
            <div>
              <label className="text-sm font-medium">Warehouse *</label>
              <select
                value={form.warehouse_location_id}
                onChange={(e) => setForm(f => ({ ...f, warehouse_location_id: e.target.value }))}
                className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
              >
                <option value="">Select...</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Aisle</label>
              <input type="number" min="1" value={form.aisle} onChange={(e) => setForm(f => ({ ...f, aisle: e.target.value }))} placeholder="1" className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Rack</label>
              <input type="number" min="1" value={form.rack} onChange={(e) => setForm(f => ({ ...f, rack: e.target.value }))} placeholder="1" className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Shelf</label>
              <input type="number" min="1" value={form.shelf} onChange={(e) => setForm(f => ({ ...f, shelf: e.target.value }))} placeholder="1" className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Bin</label>
              <input type="number" min="1" value={form.bin} onChange={(e) => setForm(f => ({ ...f, bin: e.target.value }))} placeholder="1" className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm" />
            </div>
          </div>

          {binCode && (
            <div className="p-3 rounded-md bg-muted/50 max-w-3xl">
              <span className="text-xs uppercase text-muted-foreground">Generated Bin Code: </span>
              <span className="font-mono font-bold text-sm">{binCode}</span>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !form.warehouse_location_id} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create Bin
            </button>
            {suggestNextBin() && (
              <button onClick={() => setForm(f => ({ ...f, ...suggestNextBin() }))} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input text-sm hover:bg-accent/10">
                Suggest Next Bin
              </button>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">Existing Bins ({bins.length})</h3>
            {bins.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bins created yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-w-4xl">
                {bins.map(b => (
                  <div key={b.id} className="flex items-center gap-2 p-2.5 rounded-md border bg-card">
                    <Grid3x3 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-mono font-medium">{b.bin_code}</p>
                      <p className="text-xs text-muted-foreground">{b.warehouse_location_name}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}