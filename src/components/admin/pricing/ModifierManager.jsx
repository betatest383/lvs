import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Copy, Archive, RotateCcw, FlaskConical, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import ModifierFormDialog from './ModifierFormDialog';
import ModifierSimulator from './ModifierSimulator';
import { MODIFIER_STATUS_OPTIONS, CALCULATION_METHOD_OPTIONS, SOURCE_FIELD_OPTIONS } from './pricingConstants';
import { buildTriggerSummary, buildCalculationSummary } from '@/lib/pricingModifierEngine';

const statusBadge = (status) => {
  const map = { draft: 'bg-gray-100 text-gray-700', testing: 'bg-blue-100 text-blue-700', active: 'bg-green-100 text-green-700', archived: 'bg-red-100 text-red-700' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100'}`}>{status}</span>;
};

export default function ModifierManager() {
  const [modifiers, setModifiers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [simModifier, setSimModifier] = useState(null);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const [mods, cats] = await Promise.all([
        base44.entities.PricingModifier.filter({}, 'display_order', 500),
        base44.entities.PricingModifierCategory.filter({ status: 'active' }, 'display_order', 200),
      ]);
      setModifiers(mods);
      setCategories(cats);
    } catch (e) {
      toast.error('Failed to load modifiers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.PricingModifier.update(editing.id, data);
      toast.success('Modifier updated');
    } else {
      await base44.entities.PricingModifier.create(data);
      toast.success('Modifier created');
    }
    setEditing(null);
    load();
  };

  const duplicate = async (mod) => {
    const { id, created_date, updated_date, created_by_id, ...rest } = mod;
    await base44.entities.PricingModifier.create({ ...rest, name: `${mod.name} (Copy)`, status: 'draft' });
    toast.success('Modifier duplicated');
    load();
  };

  const archive = async (mod) => {
    await base44.entities.PricingModifier.update(mod.id, { status: 'archived' });
    toast.success('Modifier archived');
    load();
  };

  const restore = async (mod) => {
    await base44.entities.PricingModifier.update(mod.id, { status: 'active' });
    toast.success('Modifier restored');
    load();
  };

  const openSimulator = (mod = null) => {
    setSimModifier(mod);
    setSimulatorOpen(true);
  };

  const filtered = modifiers.filter(m => {
    if (search && !(`${m.name} ${m.code || ''}`.toLowerCase().includes(search.toLowerCase()))) return false;
    if (catFilter !== 'all' && m.category_id !== catFilter) return false;
    if (statusFilter !== 'all' && m.status !== statusFilter) return false;
    if (methodFilter !== 'all' && m.calculation_method !== methodFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search modifiers..." className="w-56 pl-8 h-9" />
          </div>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {MODIFIER_STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Method" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Methods</SelectItem>
              {CALCULATION_METHOD_OPTIONS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{filtered.length} modifiers</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => openSimulator()} className="h-9">
            <FlaskConical className="w-4 h-4 mr-1" /> Test All
          </Button>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90 h-9">
            <Plus className="w-4 h-4 mr-1" /> Add Modifier
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">No modifiers found. Click "Add Modifier" to create one.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(mod => (
            <div key={mod.id} className="rounded-lg border p-3 hover:bg-accent/5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{mod.name}</span>
                    {mod.code && <Badge variant="outline" className="text-[10px]">{mod.code}</Badge>}
                    {mod.category_name && <Badge variant="secondary" className="text-[10px]">{mod.category_name}</Badge>}
                    {statusBadge(mod.status)}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                    <span><span className="font-medium text-foreground">Trigger:</span> {buildTriggerSummary(mod)}</span>
                    <span><span className="font-medium text-foreground">Calc:</span> {buildCalculationSummary(mod)}</span>
                    <span><span className="font-medium text-foreground">Applies to:</span> {mod.applies_to || '—'}</span>
                    {(mod.effective_start_date || mod.effective_end_date) && (
                      <span><span className="font-medium text-foreground">Effective:</span> {mod.effective_start_date || '...'} → {mod.effective_end_date || '...'}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openSimulator(mod)} title="Test"><FlaskConical className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(mod); setDialogOpen(true); }} title="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicate(mod)} title="Duplicate"><Copy className="w-3.5 h-3.5" /></Button>
                  {mod.status === 'archived' ? (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => restore(mod)} title="Restore"><RotateCcw className="w-3.5 h-3.5" /></Button>
                  ) : (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => archive(mod)} title="Archive"><Archive className="w-3.5 h-3.5" /></Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <ModifierFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Edit Modifier' : 'New Modifier'}
        initialData={editing || { status: 'draft', applies_automatically: true, affects_customer_price: true, stacking_method: 'additive', display_order: 0, multiplier_value: 1 }}
        onSave={handleSave}
      />
      <ModifierSimulator open={simulatorOpen} onOpenChange={setSimulatorOpen} singleModifier={simModifier} />
    </div>
  );
}