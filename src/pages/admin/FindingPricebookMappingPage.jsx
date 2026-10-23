import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Pencil, Trash2, Search, ArrowUpDown } from 'lucide-react';
import { toast } from 'sonner';

const DEFICIENCY_TYPES = [
  'cracked_crown', 'damaged_flue_liner', 'spalling_bricks', 'missing_cap',
  'deteriorated_mortar_joints', 'flue_obstruction', 'creosote_buildup',
  'chimney_leak', 'damaged_chimney_cap', 'cracked_flue_tiles', 'water_damage',
  'animal_infestation', 'structural_cracks', 'damaged_flashings', 'other',
];

const TIER_OPTIONS = [
  { value: 'standalone', label: 'Standalone' },
  { value: 'good', label: 'Good' },
  { value: 'better', label: 'Better' },
  { value: 'best', label: 'Best' },
];

const APPLIANCE_TYPES = [
  '__none__', 'fireplace', 'furnace_flue', 'chimney_structure', 'chimney_cap',
  'wood_stove', 'insert', 'boiler', 'water_heater',
];

function MappingFormDialog({ open, onClose, onSaved, mapping }) {
  const [form, setForm] = useState({
    deficiency_type: '',
    pricebook_item_name: '',
    unit_price: 0,
    unit: 'ea',
    option_tier: 'standalone',
    default_quantity: 1,
    quantity_multiplier: 1,
    is_active: true,
    sort_order: 0,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(mapping || {
        deficiency_type: '',
        pricebook_item_name: '',
        unit_price: 0,
        unit: 'ea',
        option_tier: 'standalone',
        default_quantity: 1,
        quantity_multiplier: 1,
        is_active: true,
        sort_order: 0,
      });
    }
  }, [open, mapping]);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.deficiency_type || !form.pricebook_item_name) {
      toast.error('Deficiency type and pricebook item are required');
      return;
    }
    setSaving(true);
    try {
      let result;
      const payload = {
        ...form,
        mapping_name: form.mapping_name || `${form.deficiency_type} → ${form.pricebook_item_name}`,
      };
      if (mapping?.id) {
        result = await base44.entities.FindingPricebookMapping.update(mapping.id, payload);
      } else {
        result = await base44.entities.FindingPricebookMapping.create(payload);
      }
      onSaved(result);
      onClose();
      toast.success(mapping?.id ? 'Mapping updated' : 'Mapping created');
    } catch {
      toast.error('Failed to save mapping');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mapping?.id ? 'Edit Mapping' : 'New Finding → Pricebook Mapping'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Deficiency Type *</label>
              <Select value={form.deficiency_type} onValueChange={v => set('deficiency_type', v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {DEFICIENCY_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium">Appliance / System Type</label>
              <Select value={form.appliance_system_type || '__none__'} onValueChange={v => set('appliance_system_type', v === '__none__' ? '' : v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  {APPLIANCE_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t === '__none__' ? 'Any' : t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Pricebook Item Name *</label>
              <Input value={form.pricebook_item_name || ''} onChange={e => set('pricebook_item_name', e.target.value)} className="h-9" placeholder="e.g. Crown Seal Application" />
            </div>
            <div>
              <label className="text-xs font-medium">Pricebook Item ID</label>
              <Input value={form.pricebook_item_id || ''} onChange={e => set('pricebook_item_id', e.target.value)} className="h-9" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium">Unit Price ($)</label>
              <Input type="number" value={form.unit_price || 0} onChange={e => set('unit_price', parseFloat(e.target.value) || 0)} className="h-9" />
            </div>
            <div>
              <label className="text-xs font-medium">Unit</label>
              <Input value={form.unit || 'ea'} onChange={e => set('unit', e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="text-xs font-medium">Default Qty</label>
              <Input type="number" min="1" value={form.default_quantity || 1} onChange={e => set('default_quantity', parseInt(e.target.value) || 1)} className="h-9" />
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Option Grouping (Good / Better / Best)</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium">Option Group</label>
                <Input value={form.option_group || ''} onChange={e => set('option_group', e.target.value)} className="h-9" placeholder="e.g. Cracked Crown Repair" />
              </div>
              <div>
                <label className="text-xs font-medium">Option Tier</label>
                <Select value={form.option_tier || 'standalone'} onValueChange={v => set('option_tier', v)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIER_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium">Option Label</label>
                <Input value={form.option_label || ''} onChange={e => set('option_label', e.target.value)} className="h-9" placeholder="e.g. Crown Seal (Good)" />
              </div>
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Quantity from Measurement</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Measurement Field</label>
                <Input value={form.quantity_from_measurement || ''} onChange={e => set('quantity_from_measurement', e.target.value)} className="h-9" placeholder="e.g. flue_height" />
              </div>
              <div>
                <label className="text-xs font-medium">Multiplier</label>
                <Input type="number" step="0.01" value={form.quantity_multiplier || 1} onChange={e => set('quantity_multiplier', parseFloat(e.target.value) || 1)} className="h-9" />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium">Customer Description Template</label>
            <Textarea
              value={form.customer_description_template || ''}
              onChange={e => set('customer_description_template', e.target.value)}
              rows={2}
              placeholder="Pre-written customer-facing description for this line item"
            />
          </div>
          <div>
            <label className="text-xs font-medium">Report Language</label>
            <Textarea
              value={form.report_language || ''}
              onChange={e => set('report_language', e.target.value)}
              rows={2}
              placeholder="Language used in the inspection report for this finding"
            />
          </div>
          <div>
            <label className="text-xs font-medium">Material Calculation (JSON)</label>
            <Textarea
              value={form.material_calculation || ''}
              onChange={e => set('material_calculation', e.target.value)}
              rows={2}
              placeholder='{"material":"SS Liner Kit","formula":"flue_height","unit":"ft"}'
              className="font-mono text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {mapping?.id ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FindingPricebookMappingPage() {
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.FindingPricebookMapping.list('-created_date', 200);
      setMappings(data);
    } catch {
      toast.error('Failed to load mappings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!confirm('Delete this mapping?')) return;
    try {
      await base44.entities.FindingPricebookMapping.delete(id);
      setMappings(prev => prev.filter(m => m.id !== id));
      toast.success('Mapping deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleToggle = async (mapping) => {
    try {
      const updated = await base44.entities.FindingPricebookMapping.update(mapping.id, { is_active: !mapping.is_active });
      setMappings(prev => prev.map(m => m.id === mapping.id ? updated : m));
    } catch {
      toast.error('Failed to toggle');
    }
  };

  const filtered = mappings.filter(m => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (m.deficiency_type || '').toLowerCase().includes(s) ||
      (m.pricebook_item_name || '').toLowerCase().includes(s) ||
      (m.option_group || '').toLowerCase().includes(s);
  });

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">Inspection Finding → Pricebook Mapping</h1>
          <p className="text-xs text-muted-foreground">Map deficiency types to pricebook items, option groups, and material calculations</p>
        </div>
        <Button className="gap-1.5" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> New Mapping
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by deficiency type, pricebook item, or option group..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
          No mappings yet. Create your first mapping to start generating estimate recommendations.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(m => (
            <Card key={m.id} className={!m.is_active ? 'opacity-60' : ''}>
              <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">{m.deficiency_type?.replace(/_/g, ' ')}</Badge>
                    {m.appliance_system_type && <Badge variant="outline" className="text-xs text-muted-foreground">{m.appliance_system_type}</Badge>}
                    {m.option_tier && m.option_tier !== 'standalone' && (
                      <Badge className={`text-xs ${
                        m.option_tier === 'good' ? 'bg-green-100 text-green-700' :
                        m.option_tier === 'better' ? 'bg-blue-100 text-blue-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>{m.option_tier}</Badge>
                    )}
                    <span className="font-medium text-sm">{m.pricebook_item_name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    ${m.unit_price || 0}/{m.unit || 'ea'}
                    {m.option_group && ` · Group: ${m.option_group}`}
                    {m.quantity_from_measurement && ` · Qty from: ${m.quantity_from_measurement}`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(m); setDialogOpen(true); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggle(m)}>
                    <ArrowUpDown className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => handleDelete(m.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <MappingFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={(saved) => {
          setMappings(prev => {
            const idx = prev.findIndex(m => m.id === saved.id);
            if (idx >= 0) { const copy = [...prev]; copy[idx] = saved; return copy; }
            return [saved, ...prev];
          });
        }}
        mapping={editing}
      />
    </div>
  );
}