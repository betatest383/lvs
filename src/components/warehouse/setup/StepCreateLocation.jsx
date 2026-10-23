import React, { useState } from 'react';
import { Plus, MapPin, Loader2, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';

export default function StepCreateLocation({ locations, onDataChange, permissions }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: '', location_code: '', notes: '', is_active: true });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ variant: 'destructive', title: 'Location name is required' });
      return;
    }
    setSaving(true);
    try {
      await base44.functions.invoke('manageWarehouseLocation', {
        action: 'create',
        data: {
          name: form.name.trim(),
          location_code: form.location_code.trim() || form.name.trim().toUpperCase().replace(/\s+/g, '-'),
          location_type: 'warehouse',
          notes: form.notes.trim(),
          is_active: form.is_active,
        },
      });
      toast({ title: 'Location created', description: form.name });
      setForm({ name: '', location_code: '', notes: '', is_active: true });
      onDataChange();
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      toast({ variant: 'destructive', title: 'Failed to create location', description: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Create Inventory Location</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Create a new location or use an existing one below. You only need one location to continue to Step 2.
          {locations.length > 0 && <span className="text-green-600 font-medium"> — {locations.length} location(s) already exist. You can continue to Step 2.</span>}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        <div>
          <label className="text-sm font-medium">Location Name *</label>
          <input
            value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Main Warehouse"
            className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Location Code</label>
          <input
            value={form.location_code}
            onChange={(e) => setForm(f => ({ ...f, location_code: e.target.value }))}
            placeholder="e.g. WH-MAIN (auto-generated if blank)"
            className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm font-medium">Description</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Optional description..."
            rows={2}
            className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm(f => ({ ...f, is_active: e.target.checked }))} />
          Active
        </label>
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !form.name.trim()}
        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        Create Location
      </button>

      <div>
        <h3 className="text-sm font-semibold mb-2">Existing Locations ({locations.length})</h3>
        {locations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No locations created yet.</p>
        ) : (
          <div className="space-y-2 max-w-2xl">
            {locations.map(loc => (
              <div key={loc.id} className="flex items-center gap-3 p-3 rounded-md border bg-card">
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{loc.name}</p>
                  <p className="text-xs text-muted-foreground">{loc.location_code || 'No code'}</p>
                </div>
                {loc.is_active && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}