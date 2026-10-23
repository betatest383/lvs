import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, MapPin, Plus, Pencil, Trash2, Building2 } from 'lucide-react';
import { toast } from 'sonner';

const locationFields = [
  { key: 'crm_location_id', label: 'CRM Location ID', type: 'text', placeholder: 'External CRM system ID…' },
  { key: 'location_label', label: 'Location Label', type: 'text', placeholder: 'Main Office, Warehouse #2…' },
  { key: 'contact_name', label: 'On-Site Contact Name', type: 'text' },
  { key: 'contact_phone', label: 'On-Site Contact Phone', type: 'text' },
  { key: 'contact_email', label: 'On-Site Contact Email', type: 'text' },
  { key: 'address', label: 'Service Address', type: 'text' },
  { key: 'city', label: 'City', type: 'text' },
  { key: 'state', label: 'State', type: 'text' },
  { key: 'zip', label: 'Zip', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
];

export default function LocationsManager({ customer, open, onOpenChange }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editLoc, setEditLoc] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!customer?.id) return;
    setLoading(true);
    try {
      const locs = await base44.entities.Location.filter({ customer_id: customer.customer_number || customer.id });
      setLocations(locs);
    } catch (err) {
      toast.error('Failed to load locations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open, customer?.id]);

  const openAdd = () => {
    setForm({ bill_to_customer: true, is_active: true });
    setEditLoc('new');
  };

  const openEdit = (loc) => {
    setForm({ ...loc });
    setEditLoc(loc);
  };

  const handleSave = async () => {
    if (!form.contact_name) {
      toast.error('On-site contact name is required');
      return;
    }
    setSaving(true);
    try {
      // Auto-generate location ID
      const linkKey = customer.customer_number || customer.id;
      const payload = { ...form, customer_id: linkKey, customer_name: customer.name };
      if (editLoc === 'new' && !payload.location_id) {
        const existing = await base44.entities.Location.filter({ customer_id: linkKey }, '-created_date', 1);
        const lastNum = existing.length > 0 && existing[0].location_id
          ? parseInt(existing[0].location_id.replace(/\D/g, '')) || 0 : 0;
        payload.location_id = `${customer.customer_number || 'C'}-L${String(lastNum + 1).padStart(2, '0')}`;
      }
      if (editLoc && editLoc !== 'new') {
        await base44.entities.Location.update(editLoc.id, payload);
        toast.success('Location updated');
      } else {
        await base44.entities.Location.create(payload);
        toast.success('Location added');
      }
      setEditLoc(null);
      setForm({});
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to save location');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (loc) => {
    if (!confirm(`Delete location "${loc.location_label || loc.location_id}"?`)) return;
    try {
      await base44.entities.Location.delete(loc.id);
      toast.success('Location deleted');
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to delete location');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4" /> Locations — {customer?.name}
          </DialogTitle>
        </DialogHeader>

        {!editLoc ? (
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {locations.length} location{locations.length !== 1 ? 's' : ''} for this customer.
                Billing is tied to the customer record, not the location.
              </p>
              <Button size="sm" onClick={openAdd} className="flex items-center gap-1 bg-accent text-accent-foreground hover:bg-accent/90">
                <Plus className="w-3.5 h-3.5" /> Add Location
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : locations.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-xl">
                <MapPin className="w-7 h-7 mx-auto mb-2 opacity-40" />
                <p>No locations yet. Add one above.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {locations.map(loc => (
                  <div key={loc.id} className="border rounded-lg p-3 bg-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{loc.location_label || 'Unnamed Location'}</span>
                          <span className="px-1.5 py-0.5 rounded text-xs font-mono bg-slate-100 text-slate-600">{loc.location_id}</span>
                          {loc.bill_to_customer && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700">Bills to Customer</span>
                          )}
                        </div>
                        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                          <div><span className="font-medium text-foreground">Contact:</span> {loc.contact_name || '—'}</div>
                          <div><span className="font-medium text-foreground">Phone:</span> {loc.contact_phone || '—'}</div>
                          <div className="col-span-2"><span className="font-medium text-foreground">Email:</span> {loc.contact_email || '—'}</div>
                          <div className="col-span-2"><span className="font-medium text-foreground">Address:</span> {loc.address ? `${loc.address}, ${loc.city || ''} ${loc.state || ''} ${loc.zip || ''}` : '—'}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(loc)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(loc)} className="text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {locationFields.map(field => (
              <div key={field.key} className="space-y-1.5">
                <Label className="text-sm font-medium">{field.label}</Label>
                {field.type === 'textarea' ? (
                  <Textarea value={form[field.key] || ''} onChange={e => setForm({ ...form, [field.key]: e.target.value })} placeholder={field.placeholder} rows={2} />
                ) : (
                  <Input value={form[field.key] || ''} onChange={e => setForm({ ...form, [field.key]: e.target.value })} placeholder={field.placeholder} />
                )}
              </div>
            ))}
            <div className="flex items-center gap-2 py-1">
              <Switch checked={form.bill_to_customer !== false} onCheckedChange={v => setForm({ ...form, bill_to_customer: v })} />
              <div>
                <p className="text-sm font-medium">Bill to Customer</p>
                <p className="text-xs text-muted-foreground">Invoices and emails use the customer's billing info, not this location's.</p>
              </div>
            </div>
          </div>
        )}

        {editLoc && (
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditLoc(null); setForm({}); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Location
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}