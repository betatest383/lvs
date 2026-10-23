import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ArrowDownToLine, Search, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function ConsumableReceive() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState({});

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const recs = await base44.entities.ConsumableCatalog.filter({ status: 'Active' }, 'item_name', 500);
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

  const activeEntries = Object.entries(entries).filter(([, v]) => v.quantity > 0);

  const handleSubmit = async () => {
    if (activeEntries.length === 0) { toast.error('Add at least one item to receive'); return; }
    setSaving(true);
    try {
      for (const [itemId, entry] of activeEntries) {
        await base44.functions.invoke('processConsumableTransaction', {
          consumable_catalog_id: itemId,
          quantity_delta: entry.quantity,
          transaction_type: 'consumable_receive',
          reason: entry.reason || 'Received purchase',
          vendor: entry.vendor || '',
          purchase_order: entry.po || '',
          unit_cost_override: entry.unit_cost != null && entry.unit_cost !== '' ? Number(entry.unit_cost) : undefined,
        });
      }
      toast.success(`${activeEntries.length} item(s) received`);
      setEntries({});
      load();
    } catch (err) {
      toast.error('Failed to receive inventory');
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
        <h2 className="text-xl font-bold">Receive Consumable Inventory</h2>
        <p className="text-xs text-muted-foreground">Record received stock. Each entry creates an audit transaction.</p>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items..." className="pl-9 max-w-md" />
      </div>

      {activeEntries.length > 0 && (
        <Card>
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-sm font-medium">{activeEntries.length} item(s) ready to receive</span>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Receive All
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {filtered.map(item => {
          const entry = entries[item.id] || { quantity: 0, reason: '', vendor: '', po: '', unit_cost: '' };
          const hasEntry = entry.quantity > 0;
          return (
            <Card key={item.id} className={hasEntry ? 'border-green-400' : ''}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{item.item_name}</p>
                      <span className="text-xs text-muted-foreground font-mono">{item.sku || '—'}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.category} · On hand: {item.quantity_on_hand || 0} {item.unit}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      value={entry.quantity || ''}
                      onChange={e => setEntries(prev => ({ ...prev, [item.id]: { ...entry, quantity: Number(e.target.value) } }))}
                      placeholder="0"
                      className="w-24 text-right"
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{item.unit}</span>
                  </div>
                </div>
                {hasEntry && (
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <Input value={entry.vendor} onChange={e => setEntries(prev => ({ ...prev, [item.id]: { ...entry, vendor: e.target.value } }))} placeholder="Vendor" className="text-xs h-8" />
                    <Input value={entry.po} onChange={e => setEntries(prev => ({ ...prev, [item.id]: { ...entry, po: e.target.value } }))} placeholder="PO #" className="text-xs h-8" />
                    <Input type="number" step="0.01" value={entry.unit_cost} onChange={e => setEntries(prev => ({ ...prev, [item.id]: { ...entry, unit_cost: e.target.value } }))} placeholder={`Unit cost ($${item.unit_cost || 0})`} className="text-xs h-8" />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <ArrowDownToLine className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No active consumables found</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}