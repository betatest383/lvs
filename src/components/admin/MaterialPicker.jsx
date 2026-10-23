import { useState, useMemo, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { Check, ChevronDown, X, Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Searchable InventoryMaster material picker with editable rows.
 *
 * Props:
 * - value: array of material objects [{ material_id, material_name, sku, quantity, unit, chargeable_to_customer, customer_visible, commissionable, notes }]
 * - onChange: (newArray) => void
 * - defaultChargeable: boolean — default for chargeable_to_customer when adding
 * - placeholder: string
 */
export default function MaterialPicker({
  value = [],
  onChange,
  defaultChargeable = true,
  placeholder = 'Search materials...',
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const recs = await base44.entities.InventoryMaster.filter({}, 'item_name', 500);
        if (!cancelled) setMaterials(recs);
      } catch {
        if (!cancelled) setMaterials([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const selectedIds = useMemo(
    () => new Set((value || []).map(m => m.material_id)),
    [value]
  );

  const filtered = useMemo(() => {
    const base = showInactive
      ? materials
      : materials.filter(m => m.is_active !== false && m.status !== 'Inactive' && m.status !== 'Discontinued');
    if (!search) return base.slice(0, 50);
    const q = search.toLowerCase();
    return base.filter(m => {
      const name = (m.item_name || '').toLowerCase();
      const sku = (m.sku || '').toLowerCase();
      const mfr = (m.manufacturer || '').toLowerCase();
      const cat = (m.category || '').toLowerCase();
      return name.includes(q) || sku.includes(q) || mfr.includes(q) || cat.includes(q);
    }).slice(0, 50);
  }, [materials, search, showInactive]);

  const addMaterial = (mat) => {
    if (selectedIds.has(mat.id)) return;
    const isConsumable = mat.inventory_type === 'Consumable' || mat.inventory_type === 'Safety Supply' || mat.inventory_type === 'Office Supply';
    const chargeable = !isConsumable && defaultChargeable;
    const obj = {
      material_id: mat.id,
      material_name: mat.item_name,
      sku: mat.sku || '',
      quantity: 1,
      unit: mat.unit || 'ea',
      unit_price: mat.unit_cost || 0,
      chargeable_to_customer: chargeable,
      customer_visible: chargeable,
      commissionable: chargeable,
      notes: '',
    };
    onChange([...(value || []), obj]);
    setOpen(false);
    setSearch('');
  };

  const updateField = (id, field, val) => {
    onChange((value || []).map(m => m.material_id === id ? { ...m, [field]: val } : m));
  };

  const remove = (id) => {
    onChange((value || []).filter(m => m.material_id !== id));
  };

  return (
    <div className="space-y-2">
      {/* Add button */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Search className="w-3.5 h-3.5" />
              {placeholder}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Type name, SKU, manufacturer..." value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>
                {loading ? <span className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</span> : 'No materials found.'}
              </CommandEmpty>
              {filtered.length > 0 && (
                <CommandGroup>
                  {filtered.map(mat => {
                    const selected = selectedIds.has(mat.id);
                    return (
                      <CommandItem key={mat.id} value={mat.id} disabled={selected} onSelect={() => addMaterial(mat)}>
                        <Check className={cn('mr-2 h-4 w-4', selected ? 'opacity-100' : 'opacity-0')} />
                        <div className="flex flex-col flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-sm">{mat.item_name}</span>
                            {mat.sku && <span className="text-muted-foreground font-mono text-xs">{mat.sku}</span>}
                            {selected && <Badge variant="secondary" className="text-[9px] py-0 px-1">Added</Badge>}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {mat.inventory_type && <span>{mat.inventory_type}</span>}
                            {mat.category && <span>· {mat.category}</span>}
                            {mat.manufacturer && <span>· {mat.manufacturer}</span>}
                            {mat.unit_cost ? <span>· ${mat.unit_cost}/{mat.unit || 'ea'}</span> : null}
                          </div>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
          <div className="flex items-center gap-2 px-3 py-2 border-t">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} id="show-inactive-mat" />
            <label htmlFor="show-inactive-mat" className="text-xs cursor-pointer">Show inactive materials</label>
          </div>
        </PopoverContent>
      </Popover>

      {/* Selected material rows */}
      {(value || []).length > 0 && (
        <div className="space-y-1.5">
          {(value || []).map(mat => (
            <div key={mat.material_id} className="rounded border bg-card p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-sm truncate">{mat.material_name}</span>
                  {mat.sku && <span className="text-muted-foreground font-mono text-xs">{mat.sku}</span>}
                </div>
                <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-destructive" onClick={() => remove(mat.material_id)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">Qty</label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={mat.quantity ?? 1}
                    onChange={e => updateField(mat.material_id, 'quantity', parseFloat(e.target.value) || 0)}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Unit</label>
                  <Input
                    value={mat.unit || 'ea'}
                    onChange={e => updateField(mat.material_id, 'unit', e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Unit Price</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={mat.unit_price ?? 0}
                    onChange={e => updateField(mat.material_id, 'unit_price', parseFloat(e.target.value) || 0)}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Notes</label>
                  <Input
                    value={mat.notes || ''}
                    onChange={e => updateField(mat.material_id, 'notes', e.target.value)}
                    className="h-7 text-xs"
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-0.5">
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={!!mat.chargeable_to_customer}
                    onCheckedChange={v => updateField(mat.material_id, 'chargeable_to_customer', v)}
                    id={`chg-${mat.material_id}`}
                  />
                  <label htmlFor={`chg-${mat.material_id}`} className="text-[11px] cursor-pointer">Chargeable</label>
                </div>
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={!!mat.customer_visible}
                    onCheckedChange={v => updateField(mat.material_id, 'customer_visible', v)}
                    id={`vis-${mat.material_id}`}
                  />
                  <label htmlFor={`vis-${mat.material_id}`} className="text-[11px] cursor-pointer">Customer Visible</label>
                </div>
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={!!mat.commissionable}
                    onCheckedChange={v => updateField(mat.material_id, 'commissionable', v)}
                    id={`com-${mat.material_id}`}
                  />
                  <label htmlFor={`com-${mat.material_id}`} className="text-[11px] cursor-pointer">Commissionable</label>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}