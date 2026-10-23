import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, SlidersHorizontal, Search, Check } from 'lucide-react';
import { toast } from 'sonner';
import { CONSUMABLE_ADJUSTMENT_REASONS } from '@/lib/consumableConstants';

export default function ConsumableAdjust() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState({});

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const recs = await base44.entities.ConsumableCatalog.list('item_name', 500);
      setItems(recs);
    } catch {
      toast.error('Failed to load catalog');
    } finally {
      setLoading(false);
    }
  };

  const filtered = items.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (item.item_name || '').toLowerCase().includes(q) || (item.sku || '').toLowerCase().includes(q);
  });

  const activeEntries = Object.entries(entries).filter(([, v]) => v.new_quantity != null && v.new_quantity !== '');

  const handleSubmit = async () => {
    if (activeEntries.length === 0) { toast.error('Add at least one adjustment'); return; }
    setSaving(true);
    try {
      for (const [itemId, entry] of activeEntries) {
        const item = items.find(i => i.id === itemId);
        if (!item) continue;
        const newQty = Number(entry.new_quantity);
        const currentQty = item.quantity_on_hand || 0;
        const delta = newQty - currentQty;
        if (delta === 0) continue;
        await base44.functions.invoke('processConsumableTransaction', {
          consumable_catalog_id: itemId,
          quantity_delta: delta,
          transaction_type: 'consumable_adjust',
          reason: entry.reason || 'Manual adjustment',
          notes: entry.notes || '',
        });
      }
      toast.success(`${activeEntries.length} item(s) adjusted`);
      setEntries({});
      load();
    } catch (err) {
      toast.error('Failed to adjust inventory');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Adjust Consumable Inventory</h2>
        <p className="text-xs text-muted-foreground">Set new quantities after physical counts or corrections. Each adjustment creates an audit transaction.</p>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items..." className="pl-9 max-w-md" />
      </div>

      {activeEntries.length > 0 && (
        <Card>
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-sm font-medium">{activeEntries.length} item(s) ready to adjust</span>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Apply Adjustments
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {filtered.map(item => {
          const entry = entries[item.id] || { new_quantity: '', reason: '', notes: '' };
          const hasEntry = entry.new_quantity !== '' && entry.new_quantity != null;
          const currentQty = item.quantity_on_hand || 0;
          const newQty = hasEntry ? Number(entry.new_quantity) : currentQty;
          const delta = newQty - currentQty;
          return (
            <Card key={item.id} className={hasEntry && delta !== 0 ? (delta > 0 ? 'border-green-400' : 'border-red-400') : ''}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{item.item_name}</p>
                      <span className="text-xs text-muted-foreground font-mono">{item.sku || '—'}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.category} · Current: {currentQty} {item.unit}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">New qty:</Label>
                    <Input
                      type="number"
                      min="0"
                      value={entry.new_quantity}
                      onChange={e => setEntries(prev => ({ ...prev, [item.id]: { ...entry, new_quantity: e.target.value } }))}
                      placeholder={String(currentQty)}
                      className="w-28 text-right"
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{item.unit}</span>
                  </div>
                </div>
                {hasEntry && delta !== 0 && (
                  <div className="flex items-center gap-3 pt-1">
                    <span className={`text-xs font-medium ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {delta > 0 ? '+' : ''}{delta} {item.unit}
                    </span>
                    <Select value={entry.reason} onValueChange={v => setEntries(prev => ({ ...prev, [item.id]: { ...entry, reason: v } }))}>
                      <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Reason" /></SelectTrigger>
                      <SelectContent>
                        {CONSUMABLE_ADJUSTMENT_REASONS.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {hasEntry && delta !== 0 && (
                  <Textarea value={entry.notes} onChange={e => setEntries(prev => ({ ...prev, [item.id]: { ...entry, notes: e.target.value } }))} placeholder="Optional notes..." rows={1} className="text-xs" />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <SlidersHorizontal className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No consumables found</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}