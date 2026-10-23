import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Archive, RotateCcw, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import ModifierCategoryFormDialog from './ModifierCategoryFormDialog';
import { CATEGORY_STATUS_OPTIONS } from './pricingConstants';

const statusBadge = (status) => {
  const map = { active: 'bg-green-100 text-green-700', inactive: 'bg-gray-100 text-gray-700', archived: 'bg-red-100 text-red-700' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100'}`}>{status}</span>;
};

export default function ModifierCategoryManager() {
  const [categories, setCategories] = useState([]);
  const [modifierCounts, setModifierCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const [cats, mods] = await Promise.all([
        base44.entities.PricingModifierCategory.filter({}, 'display_order', 200),
        base44.entities.PricingModifier.filter({}, 'display_order', 500),
      ]);
      setCategories(cats);
      const counts = {};
      mods.forEach(m => { if (m.category_id) counts[m.category_id] = (counts[m.category_id] || 0) + 1; });
      setModifierCounts(counts);
    } catch (e) {
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.PricingModifierCategory.update(editing.id, data);
      toast.success('Category updated');
    } else {
      await base44.entities.PricingModifierCategory.create(data);
      toast.success('Category created');
    }
    setEditing(null);
    load();
  };

  const archive = async (cat) => {
    await base44.entities.PricingModifierCategory.update(cat.id, { status: 'archived' });
    toast.success('Category archived');
    load();
  };

  const restore = async (cat) => {
    await base44.entities.PricingModifierCategory.update(cat.id, { status: 'active' });
    toast.success('Category restored');
    load();
  };

  const move = async (cat, direction) => {
    const sorted = [...categories].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    const idx = sorted.findIndex(c => c.id === cat.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    await Promise.all([
      base44.entities.PricingModifierCategory.update(cat.id, { display_order: other.display_order || 0 }),
      base44.entities.PricingModifierCategory.update(other.id, { display_order: cat.display_order || 0 }),
    ]);
    load();
  };

  const sorted = [...categories].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  const filtered = statusFilter === 'all' ? sorted : sorted.filter(c => c.status === statusFilter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {CATEGORY_STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{filtered.length} categories</span>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="w-4 h-4 mr-1" /> Add Category
        </Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">No categories found. Click "Add Category" to create one.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((cat, idx) => (
            <div key={cat.id} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent/5">
              <div className="flex flex-col">
                <button onClick={() => move(cat, 'up')} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                <button onClick={() => move(cat, 'down')} disabled={idx === filtered.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{cat.name}</span>
                  {cat.code && <Badge variant="outline" className="text-[10px]">{cat.code}</Badge>}
                  {statusBadge(cat.status)}
                </div>
                {cat.description && <p className="text-sm text-muted-foreground truncate">{cat.description}</p>}
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">{modifierCounts[cat.id] || 0}</p>
                <p className="text-xs text-muted-foreground">modifiers</p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(cat); setDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                {cat.status === 'archived' ? (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => restore(cat)} title="Restore"><RotateCcw className="w-3.5 h-3.5" /></Button>
                ) : (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => archive(cat)} title="Archive"><Archive className="w-3.5 h-3.5" /></Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <ModifierCategoryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Edit Category' : 'New Category'}
        initialData={editing || { status: 'active', allow_multiple_modifiers: true, display_order: 0 }}
        onSave={handleSave}
      />
    </div>
  );
}