import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Search, Package, AlertTriangle, DollarSign, Pencil, ArrowDownToLine, SlidersHorizontal, Archive, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import ConsumableFormDialog from '@/components/inventory/ConsumableFormDialog';
import { isLowStock, isOverstock, getConsumableStatusColor } from '@/lib/consumableConstants';

export default function ConsumableInventory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const recs = await base44.entities.ConsumableCatalog.list('-created_date', 500);
      setItems(recs);
    } catch {
      toast.error('Failed to load consumable inventory');
    } finally {
      setLoading(false);
    }
  };

  const categories = useMemo(() => {
    const set = new Set(items.map(i => i.category).filter(Boolean));
    return ['all', ...Array.from(set)];
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter(item => {
      if (search) {
        const q = search.toLowerCase();
        const match = (item.item_name || '').toLowerCase().includes(q)
          || (item.sku || '').toLowerCase().includes(q)
          || (item.vendor || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && (item.status || 'Active') !== statusFilter) return false;
      if (showLowOnly && !isLowStock(item)) return false;
      return true;
    });
  }, [items, search, categoryFilter, statusFilter, showLowOnly]);

  const stats = useMemo(() => {
    const totalItems = items.length;
    const activeItems = items.filter(i => (i.status || 'Active') === 'Active').length;
    const lowStock = items.filter(isLowStock).length;
    const totalValue = items.reduce((s, i) => s + (i.inventory_value || 0), 0);
    return { totalItems, activeItems, lowStock, totalValue };
  }, [items]);

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormOpen(true);
  };

  const handleAdd = () => {
    setEditingItem(null);
    setFormOpen(true);
  };

  const handleRetire = async (item) => {
    if (!confirm(`Retire "${item.item_name}"? This will set quantity to 0 and mark it inactive. An audit record will be created.`)) return;
    try {
      const delta = -(item.quantity_on_hand || 0);
      await base44.functions.invoke('processConsumableTransaction', {
        consumable_catalog_id: item.id,
        quantity_delta: delta,
        transaction_type: 'consumable_retire',
        reason: 'Retired from inventory',
      });
      toast.success('Consumable retired');
      load();
    } catch (err) {
      toast.error('Failed to retire consumable');
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Consumable Inventory</h2>
          <p className="text-xs text-muted-foreground">Manage consumable stock levels, reorder points, and warehouse locations</p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="w-4 h-4" /> Add Consumable
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-muted-foreground">Total Items</span>
            </div>
            <p className="text-2xl font-bold">{stats.totalItems}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="text-xs text-muted-foreground">Low Stock</span>
            </div>
            <p className="text-2xl font-bold">{stats.lowStock}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-green-600" />
              <span className="text-xs text-muted-foreground">Active</span>
            </div>
            <p className="text-2xl font-bold">{stats.activeItems}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-purple-600" />
              <span className="text-xs text-muted-foreground">Inventory Value</span>
            </div>
            <p className="text-2xl font-bold">${stats.totalValue.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, SKU, vendor..." className="pl-9" />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="all">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        <Button variant={showLowOnly ? 'default' : 'outline'} size="sm" onClick={() => setShowLowOnly(!showLowOnly)}>
          <AlertTriangle className="w-4 h-4" /> Low Stock Only
        </Button>
      </div>

      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/inventory/consumables/receive"><ArrowDownToLine className="w-4 h-4" /> Receive</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/inventory/consumables/adjust"><SlidersHorizontal className="w-4 h-4" /> Adjust</Link>
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No consumables found. Click "Add Consumable" to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr className="text-left">
                  <th className="p-3 font-medium">SKU</th>
                  <th className="p-3 font-medium">Item Name</th>
                  <th className="p-3 font-medium">Category</th>
                  <th className="p-3 font-medium text-right">On Hand</th>
                  <th className="p-3 font-medium text-right">Min / Max</th>
                  <th className="p-3 font-medium">Location</th>
                  <th className="p-3 font-medium text-right">Value</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(item => {
                  const low = isLowStock(item);
                  const over = isOverstock(item);
                  return (
                    <tr key={item.id} className="hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">{item.sku || '—'}</td>
                      <td className="p-3 font-medium">{item.item_name}</td>
                      <td className="p-3 text-muted-foreground">{item.category}</td>
                      <td className="p-3 text-right">
                        <span className={`font-bold tabular-nums ${low ? 'text-red-600' : ''}`}>{item.quantity_on_hand || 0}</span>
                        <span className="text-xs text-muted-foreground"> {item.unit}</span>
                      </td>
                      <td className="p-3 text-right text-xs text-muted-foreground tabular-nums">
                        {item.minimum_stock || 0} / {item.maximum_stock || 0}
                      </td>
                      <td className="p-3 text-xs">
                        {item.warehouse_location || '—'}
                        {item.bin_location && <span className="text-muted-foreground"> · {item.bin_location}</span>}
                      </td>
                      <td className="p-3 text-right tabular-nums">${(item.inventory_value || 0).toFixed(2)}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${getConsumableStatusColor(item.status || 'Active')}`}>
                          {item.status || 'Active'}
                        </span>
                        {low && <span className="ml-1 text-xs text-red-600 font-medium">LOW</span>}
                        {over && <span className="ml-1 text-xs text-blue-600 font-medium">OVER</span>}
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleRetire(item)} disabled={(item.status || 'Active') === 'Inactive'}>
                            <Archive className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ConsumableFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={load}
        editingItem={editingItem}
      />
    </div>
  );
}