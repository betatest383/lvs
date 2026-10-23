import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Trash2 } from 'lucide-react';
import SearchableEntitySelect from '@/components/shared/SearchableEntitySelect';

/**
 * Search-based material picker using server-side inventoryQuery.
 * Searches across item_name, SKU, manufacturer, category, description, vendor, and more.
 */
export default function MaterialSearchPicker({
  value = '',
  onChange,
  defaultChargeable = true,
  label = 'Materials',
  hint = '',
}) {
  const [materials, setMaterials] = useState([]);

  // Parse the JSON string into array state
  useEffect(() => {
    try {
      const parsed = value ? JSON.parse(value) : [];
      setMaterials(Array.isArray(parsed) ? parsed : []);
    } catch {
      setMaterials([]);
    }
  }, [value]);

  const excludeIds = useMemo(() => materials.map(m => m.material_id).filter(Boolean), [materials]);

  const materialSearchFn = async (searchTerm) => {
    const res = await base44.functions.invoke('inventoryQuery', {
      type: 'all',
      search: searchTerm,
      page: 1,
      limit: 50,
    });
    return res.data?.items || [];
  };

  const commit = (next) => {
    setMaterials(next);
    onChange(JSON.stringify(next));
    console.log('[MaterialSearchPicker] Committed materials:', {
      count: next.length,
      items: next.map(m => ({ id: m.material_id, name: m.material_name, sku: m.sku })),
    });
  };

  const addMaterial = (inv) => {
    const exists = materials.find(m => m.material_id === inv.id);
    if (exists) return; // duplicate — prevented by excludeIds but guard anyway
    commit([...materials, {
      material_id: inv.id,
      material_name: inv.item_name,
      sku: inv.sku || '',
      quantity: 1,
      unit: inv.unit || 'ea',
      unit_price: inv.selling_price || inv.unit_cost || 0,
      chargeable_to_customer: defaultChargeable,
      customer_visible: defaultChargeable,
      preferred_vendor: inv.vendor || '',
      waste_pct: 0,
    }]);
  };

  const updateField = (idx, field, val) => {
    commit(materials.map((m, i) => i === idx ? { ...m, [field]: val } : m));
  };

  const removeMaterial = (idx) => {
    commit(materials.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>

      <SearchableEntitySelect
        searchFn={materialSearchFn}
        getItemId={(item) => item.id}
        excludeIds={excludeIds}
        onSelect={addMaterial}
        placeholder="Search by name, SKU, manufacturer, category..."
        renderItem={(item) => (
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{item.item_name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {item.sku && <span>{item.sku}</span>}
              {item.manufacturer && <span> · {item.manufacturer}</span>}
              {item.category && <span> · {item.category}</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              Available: {item.quantity_available || 0} {item.unit || 'ea'}
              {item.warehouse_location && <span> · {item.warehouse_location}</span>}
              {item.status === 'Inactive' && <span className="text-red-600 ml-1">· Inactive</span>}
            </p>
          </div>
        )}
      />

      {materials.length === 0 ? (
        <div className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
          No materials added. Use the search above to add from inventory.
        </div>
      ) : (
        <div className="space-y-2">
          {materials.map((mat, idx) => (
            <div key={idx} className="rounded-lg border p-3 space-y-2 bg-muted/30">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{mat.material_name}</p>
                  {mat.sku && <p className="text-xs text-muted-foreground font-mono">{mat.sku}</p>}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {mat.chargeable_to_customer ? (
                      <Badge variant="outline" className="text-[10px] text-green-700 border-green-300">Chargeable</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">Internal</Badge>
                    )}
                    {mat.customer_visible && (
                      <Badge variant="outline" className="text-[10px] text-blue-700 border-blue-300">Customer Visible</Badge>
                    )}
                  </div>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => removeMaterial(idx)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Qty</Label>
                  <Input
                    type="number"
                    className="h-8 text-sm"
                    value={mat.quantity || 1}
                    onChange={e => updateField(idx, 'quantity', Number(e.target.value) || 1)}
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Unit</Label>
                  <Input
                    className="h-8 text-sm"
                    value={mat.unit || 'ea'}
                    onChange={e => updateField(idx, 'unit', e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Unit Price</Label>
                  <Input
                    type="number"
                    className="h-8 text-sm"
                    value={mat.unit_price || 0}
                    onChange={e => updateField(idx, 'unit_price', Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Waste %</Label>
                  <Input
                    type="number"
                    className="h-8 text-sm"
                    value={mat.waste_pct || 0}
                    onChange={e => updateField(idx, 'waste_pct', Number(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Preferred Vendor</Label>
                  <Input
                    className="h-8 text-sm"
                    value={mat.preferred_vendor || ''}
                    onChange={e => updateField(idx, 'preferred_vendor', e.target.value)}
                    placeholder="Auto from inventory"
                  />
                </div>
                <div className="flex items-center gap-1.5 pt-4">
                  <Switch
                    checked={mat.chargeable_to_customer}
                    onCheckedChange={v => updateField(idx, 'chargeable_to_customer', v)}
                  />
                  <Label className="text-xs">Chargeable</Label>
                </div>
                <div className="flex items-center gap-1.5 pt-4">
                  <Switch
                    checked={mat.customer_visible}
                    onCheckedChange={v => updateField(idx, 'customer_visible', v)}
                  />
                  <Label className="text-xs">Visible</Label>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}