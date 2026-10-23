import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2 } from 'lucide-react';

/**
 * Structured material editor for RepairRecommendationTemplate.
 * Each material row: material_name, quantity, unit_price, chargeable_to_customer, customer_visible, commissionable
 * Values are stored as a JSON string in the entity field.
 */
export default function MaterialListEditor({ label, hint, value, onChange, defaultChargeable = true }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!value) {
      setItems([]);
      return;
    }
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        setItems(parsed);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    }
  }, [value]);

  const commit = (newItems) => {
    setItems(newItems);
    const valid = newItems.filter(m => m.material_name?.trim());
    onChange(valid.length > 0 ? JSON.stringify(valid) : '');
  };

  const addRow = () => {
    const newRow = {
      material_name: '',
      quantity: 1,
      unit_price: 0,
      chargeable_to_customer: defaultChargeable,
      customer_visible: true,
      commissionable: false,
    };
    commit([...items, newRow]);
  };

  const updateRow = (idx, field, val) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: val };
    commit(updated);
  };

  const removeRow = (idx) => {
    commit(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">{label}</Label>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={addRow}>
          <Plus className="w-3.5 h-3.5" /> Add Material
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">No materials configured.</p>
      ) : (
        <div className="space-y-2">
          {items.map((m, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-1.5 items-center p-2 rounded-lg border bg-muted/30">
              <Input
                className="col-span-4 h-8 text-xs"
                placeholder="Material name"
                value={m.material_name || ''}
                onChange={e => updateRow(idx, 'material_name', e.target.value)}
              />
              <Input
                className="col-span-2 h-8 text-xs"
                type="number"
                placeholder="Qty"
                value={m.quantity || 1}
                onChange={e => updateRow(idx, 'quantity', Number(e.target.value))}
              />
              <Input
                className="col-span-2 h-8 text-xs"
                type="number"
                placeholder="Price"
                value={m.unit_price || 0}
                onChange={e => updateRow(idx, 'unit_price', Number(e.target.value))}
              />
              <div className="col-span-3 flex items-center gap-2 text-[10px]">
                <label className="flex items-center gap-1 cursor-pointer">
                  <Switch
                    checked={m.chargeable_to_customer !== false}
                    onCheckedChange={v => updateRow(idx, 'chargeable_to_customer', v)}
                    className="scale-75"
                  />
                  <span className="text-muted-foreground">Charge</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <Switch
                    checked={m.customer_visible !== false}
                    onCheckedChange={v => updateRow(idx, 'customer_visible', v)}
                    className="scale-75"
                  />
                  <span className="text-muted-foreground">Visible</span>
                </label>
              </div>
              <div className="col-span-1 flex justify-end">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => removeRow(idx)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
          <div className="flex gap-1.5">
            <Badge variant="outline" className="text-[10px]">
              {items.filter(m => m.chargeable_to_customer !== false).length} chargeable
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {items.filter(m => m.chargeable_to_customer === false).length} internal
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}