import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import {
  INVENTORY_TYPES, INVENTORY_STATUS, UNITS,
  getSkuPrefix, parseSku, buildSku,
} from '@/lib/inventoryMasterConstants';
import MasterDataCombobox from '@/components/inventory/MasterDataCombobox';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';
import LinkedResourcesPanel from '@/components/resources/LinkedResourcesPanel';

const REQUIRED_FIELDS = [
  'sku', 'item_name', 'inventory_type', 'category_id', 'unit',
  'unit_cost', 'status',
];

const FIELD_LABELS = {
  sku: 'SKU',
  item_name: 'Item Name',
  inventory_type: 'Inventory Type',
  category_id: 'Category',
  unit: 'Unit of Measure',
  quantity_owned: 'Quantity Owned',
  unit_cost: 'Unit Cost',
  vendor_id: 'Vendor',
  manufacturer_id: 'Manufacturer',
  warehouse_location_id: 'Warehouse Location',
  bin_location_id: 'Bin Location',
  minimum_stock: 'Minimum Stock',
  maximum_stock: 'Maximum Stock',
  reorder_point: 'Reorder Point',
  reorder_quantity: 'Reorder Quantity',
  status: 'Status',
  notes: 'Notes',
};

function formatCurrency(value) {
  if (value === '' || value === null || value === undefined || isNaN(Number(value))) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));
}

function FieldLabel({ name }) {
  return (
    <Label className="text-xs">
      {FIELD_LABELS[name]} <span className="text-destructive">*</span>
    </Label>
  );
}

export default function InventoryMasterFormDialog({ open, onOpenChange, onSaved, editingItem, defaultType }) {
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [form, setForm] = useState({
    sku: '',
    item_name: '',
    description: '',
    inventory_type: defaultType || 'Consumable',
    category: '',
    category_id: '',
    unit: 'ea',
    quantity_owned: 0,
    minimum_stock: 0,
    maximum_stock: 0,
    reorder_quantity: 0,
    warehouse_location: '',
    warehouse_location_id: '',
    bin_location: '',
    bin_location_id: '',
    vendor: '',
    vendor_id: '',
    manufacturer: '',
    manufacturer_id: '',
    unit_cost: '',
    status: 'Active',
    notes: '',
    is_stocked_inventory_item: false,
    inventory_tracking_method: 'quantity',
    reorder_point: 0,
    default_inventory_location_id: '',
    default_bin_location_id: '',
  });

  const skuNumberRef = useRef('');
  const [initialForm, setInitialForm] = useState({});

  useEffect(() => {
    if (editingItem) {
      const existingSku = editingItem.sku || '';
      const { number } = parseSku(existingSku);
      skuNumberRef.current = number;
      setAutoGenerate(false);
      const init = {
        sku: existingSku,
        item_name: editingItem.item_name || '',
        description: editingItem.description || '',
        inventory_type: editingItem.inventory_type || defaultType || 'Consumable',
        category: editingItem.category || '',
        category_id: editingItem.category_id || '',
        unit: editingItem.unit || 'ea',
        quantity_owned: editingItem.quantity_owned ?? 0,
        minimum_stock: editingItem.minimum_stock ?? 0,
        maximum_stock: editingItem.maximum_stock ?? 0,
        reorder_quantity: editingItem.reorder_quantity ?? 0,
        warehouse_location: editingItem.warehouse_location || '',
        warehouse_location_id: editingItem.warehouse_location_id || '',
        bin_location: editingItem.bin_location || '',
        bin_location_id: editingItem.bin_location_id || '',
        vendor: editingItem.vendor || '',
        vendor_id: editingItem.vendor_id || '',
        manufacturer: editingItem.manufacturer || '',
        manufacturer_id: editingItem.manufacturer_id || '',
        unit_cost: editingItem.unit_cost != null ? String(editingItem.unit_cost) : '',
        status: editingItem.status || 'Active',
        notes: editingItem.notes || '',
        is_stocked_inventory_item: editingItem.is_stocked_inventory_item === true,
        inventory_tracking_method: editingItem.inventory_tracking_method || 'quantity',
        reorder_point: editingItem.reorder_point ?? 0,
        default_inventory_location_id: editingItem.default_inventory_location_id || '',
        default_bin_location_id: editingItem.default_bin_location_id || '',
      };
      setForm(init);
      setInitialForm(init);
    } else {
      skuNumberRef.current = '';
      setAutoGenerate(true);
      const init = {
        sku: '',
        item_name: '',
        description: '',
        inventory_type: defaultType || 'Consumable',
        category: '',
        category_id: '',
        unit: 'ea',
        quantity_owned: 0,
        minimum_stock: 0,
        maximum_stock: 0,
        reorder_quantity: 0,
        warehouse_location: '',
        warehouse_location_id: '',
        bin_location: '',
        bin_location_id: '',
        vendor: '',
        vendor_id: '',
        manufacturer: '',
        manufacturer_id: '',
        unit_cost: '',
        status: 'Active',
        notes: '',
        is_stocked_inventory_item: false,
        inventory_tracking_method: 'quantity',
        reorder_point: 0,
        default_inventory_location_id: '',
        default_bin_location_id: '',
      };
      setForm(init);
      setInitialForm(init);
    }
    setErrors({});
  }, [editingItem, open, defaultType]);

  const update = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: false }));
  };

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onOpenChange(false));

  // When inventory type changes, clear category selection (categories are type-specific)
  const handleInventoryTypeChange = (newType) => {
    setForm(prev => ({ ...prev, inventory_type: newType, category: '', category_id: '' }));
    if (autoGenerate) {
      generateSku(newType);
    }
  };

  // When warehouse changes, clear bin selection (bins are warehouse-specific)
  const handleWarehouseChange = (id, name) => {
    setForm(prev => ({ ...prev, warehouse_location_id: id, warehouse_location: name, bin_location: '', bin_location_id: '' }));
    if (errors.warehouse_location_id) setErrors(prev => ({ ...prev, warehouse_location_id: false }));
  };

  const handleBinChange = (id, name) => {
    update('bin_location_id', id);
    update('bin_location', name);
  };

  const handleCategoryChange = (id, name) => {
    update('category_id', id);
    update('category', name);
  };

  const handleVendorChange = (id, name) => {
    update('vendor_id', id);
    update('vendor', name);
  };

  const handleManufacturerChange = (id, name) => {
    update('manufacturer_id', id);
    update('manufacturer', name);
  };

  const generateSku = async (inventoryType) => {
    const prefix = getSkuPrefix(inventoryType);
    if (skuNumberRef.current) {
      setForm(prev => ({ ...prev, sku: buildSku(inventoryType, skuNumberRef.current) }));
      return;
    }
    try {
      const existing = await base44.entities.InventoryMaster.filter(
        { sku: { $regex: `^${prefix}-` } },
        '-sku',
        1
      );
      let nextNum = 1;
      if (existing && existing.length > 0) {
        const { number } = parseSku(existing[0].sku);
        if (number) nextNum = parseInt(number, 10) + 1;
      }
      skuNumberRef.current = String(nextNum);
      setForm(prev => ({ ...prev, sku: buildSku(inventoryType, nextNum) }));
    } catch {
      const fallbackNum = Math.floor(Math.random() * 900000) + 100000;
      skuNumberRef.current = String(fallbackNum);
      setForm(prev => ({ ...prev, sku: buildSku(inventoryType, fallbackNum) }));
    }
  };

  const handleSkuManualEdit = (e) => {
    const value = e.target.value;
    update('sku', value);
    setAutoGenerate(false);
    const { number } = parseSku(value);
    skuNumberRef.current = number;
  };

  const handleReEnableAuto = () => {
    setAutoGenerate(true);
    generateSku(form.inventory_type);
  };

  useEffect(() => {
    if (open && !editingItem && autoGenerate && !form.sku) {
      generateSku(form.inventory_type);
    }
  }, [open]);

  const inventoryValue = useMemo(() => {
    const qty = Number(form.quantity_owned) || 0;
    const cost = Number(form.unit_cost);
    if (form.unit_cost === '' || isNaN(cost)) return null;
    return Math.round(qty * cost * 100) / 100;
  }, [form.quantity_owned, form.unit_cost]);

  const validate = () => {
    const newErrors = {};
    for (const field of REQUIRED_FIELDS) {
      const val = form[field];
      if (field === 'unit_cost') {
        if (val === '' || val === null || val === undefined || isNaN(Number(val))) {
          newErrors[field] = true;
        }
      } else if (typeof val === 'string' && val.trim() === '') {
        newErrors[field] = true;
      } else if (typeof val === 'number' && (val === null || val === undefined)) {
        newErrors[field] = true;
      }
    }
    if (form.is_stocked_inventory_item) {
      if (form.warehouse_location_id && !form.bin_location_id) {
        newErrors.bin_location_id = true;
        toast.error('Select a bin or clear the warehouse to save as "Stocked — Missing Bin".');
        return false;
      }
      if (form.bin_location_id && !form.warehouse_location_id) {
        newErrors.warehouse_location_id = true;
        toast.error('Warehouse Location is required when Bin Location is selected.');
        return false;
      }
      const minStock = Number(form.minimum_stock) || 0;
      const maxStock = Number(form.maximum_stock) || 0;
      if (maxStock > 0 && maxStock < minStock) {
        newErrors.maximum_stock = true;
        toast.error('Maximum stock must be greater than or equal to minimum stock.');
        return false;
      }
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      const missing = Object.keys(newErrors).map(f => FIELD_LABELS[f] || f);
      toast.error(`Please fix: ${missing.join(', ')}`);
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const unitCost = Number(form.unit_cost) || 0;

      if (editingItem) {
        // EDITS: Metadata only — quantity changes must go through processInventoryMasterTransaction
        const metadataUpdate = {
          sku: form.sku,
          item_name: form.item_name,
          description: form.description,
          inventory_type: form.inventory_type,
          category: form.category,
          category_id: form.category_id,
          unit: form.unit,
          minimum_stock: Number(form.minimum_stock) || 0,
          maximum_stock: Number(form.maximum_stock) || 0,
          reorder_quantity: Number(form.reorder_quantity) || 0,
          warehouse_location: form.warehouse_location,
          warehouse_location_id: form.warehouse_location_id,
          bin_location: form.bin_location,
          bin_location_id: form.bin_location_id,
          vendor: form.vendor,
          vendor_id: form.vendor_id,
          manufacturer: form.manufacturer,
          manufacturer_id: form.manufacturer_id,
          unit_cost: unitCost,
          inventory_value: Math.round((editingItem.quantity_owned || 0) * unitCost * 100) / 100,
          status: form.status,
          is_active: form.status === 'Active',
          notes: form.notes,
          is_stocked_inventory_item: form.is_stocked_inventory_item,
          inventory_tracking_method: form.inventory_tracking_method,
          reorder_point: Number(form.reorder_point) || 0,
          default_inventory_location_id: form.warehouse_location_id,
          default_bin_location_id: form.bin_location_id,
          inventory_status: form.is_stocked_inventory_item ? (form.bin_location_id ? 'stocked_assigned' : 'stocked_unassigned') : 'not_stocked',
        };
        await base44.entities.InventoryMaster.update(editingItem.id, metadataUpdate);
        toast.success('Inventory item updated');
      } else {
        // CREATES: Initial quantity is opening stock
        const qtyOwned = 0;
        const data = {
          ...form,
          quantity_owned: 0,
          quantity_available: 0,
          quantity_assigned: 0,
          quantity_reserved: 0,
          quantity_on_order: 0,
          quantity_damaged: 0,
          quantity_retired: 0,
          unit_cost: unitCost,
          inventory_value: Math.round(qtyOwned * unitCost * 100) / 100,
          is_active: form.status === 'Active',
          is_stocked_inventory_item: form.is_stocked_inventory_item,
          inventory_tracking_method: form.inventory_tracking_method,
          reorder_point: Number(form.reorder_point) || 0,
          default_inventory_location_id: form.warehouse_location_id,
          default_bin_location_id: form.bin_location_id,
          inventory_status: form.is_stocked_inventory_item ? (form.bin_location_id ? 'stocked_assigned' : 'stocked_unassigned') : 'not_stocked',
        };
        const existing = await base44.entities.InventoryMaster.filter(
          { inventory_id: { $regex: '^INV-' } },
          '-inventory_id',
          1
        );
        let nextNum = 1;
        if (existing && existing.length > 0) {
          const match = (existing[0].inventory_id || '').match(/INV-(\d+)/);
          if (match) nextNum = parseInt(match[1], 10) + 1;
        }
        data.inventory_id = `INV-${String(nextNum).padStart(6, '0')}`;
        await base44.entities.InventoryMaster.create(data);
        toast.success('Inventory item added');
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to save inventory item');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = (field) =>
    `h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm ${
      errors[field] ? 'border-destructive' : 'border-input'
    }`;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onCloseAttempt={handleCloseAttempt}>
        <DialogHeader>
          <DialogTitle>{editingItem ? 'Edit Inventory Item' : 'Add Inventory Item'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Row 1: Inventory Type | Category */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <FieldLabel name="inventory_type" />
              <Select value={form.inventory_type} onValueChange={handleInventoryTypeChange} disabled={!!defaultType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INVENTORY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel name="category_id" />
              <MasterDataCombobox
                entityName="InventoryCategory"
                value={form.category_id}
                onChange={handleCategoryChange}
                placeholder="Select category"
                filter={{ inventory_type: form.inventory_type, is_active: true }}
                canCreate={true}
                createExtraFields={{ inventory_type: form.inventory_type }}
                otherOption={true}
                className={errors.category_id ? 'border-destructive' : ''}
              />
            </div>
          </div>

          {/* Row 2: SKU | Item Name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <FieldLabel name="sku" />
              <div className="flex gap-2">
                <input
                  className={inputClass('sku')}
                  value={form.sku}
                  onChange={handleSkuManualEdit}
                  placeholder="Auto-generated"
                />
                {autoGenerate ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => generateSku(form.inventory_type)} title="Regenerate SKU">
                    <Sparkles className="w-3.5 h-3.5" />
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={handleReEnableAuto} title="Re-enable Auto Generate">
                    <Lock className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              {autoGenerate ? (
                <p className="text-xs text-muted-foreground">SKU prefix is automatically determined by Inventory Type.</p>
              ) : (
                <p className="text-xs text-amber-600 font-medium">Manual SKU - Auto Generation Disabled</p>
              )}
            </div>
            <div className="space-y-1.5">
              <FieldLabel name="item_name" />
              <input
                className={inputClass('item_name')}
                value={form.item_name}
                onChange={e => update('item_name', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea value={form.description} onChange={e => update('description', e.target.value)} rows={2} />
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <FieldLabel name="unit" />
              <Select value={form.unit} onValueChange={v => update('unit', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Stocked Inventory Item Checkbox */}
          <div className="rounded-lg border p-3 space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_stocked_inventory_item}
                onChange={e => update('is_stocked_inventory_item', e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded shrink-0"
              />
              <div>
                <span className="text-sm font-medium">Stock this item in warehouse inventory</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Enable this item for warehouse bin assignment, inventory counts, replenishment, and stock reporting.
                </p>
              </div>
            </label>
            <div className="pl-6">
              <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${
                !form.is_stocked_inventory_item
                  ? 'bg-muted text-muted-foreground border-border'
                  : form.bin_location_id
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {!form.is_stocked_inventory_item
                  ? 'Not Stocked'
                  : form.bin_location_id
                    ? 'Stocked — Assigned'
                    : 'Stocked — Missing Bin'}
              </span>
            </div>
            {form.is_stocked_inventory_item && (
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div className="space-y-1.5">
                  <Label className="text-xs">Inventory Tracking Method</Label>
                  <Select value={form.inventory_tracking_method} onValueChange={v => update('inventory_tracking_method', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quantity">Quantity</SelectItem>
                      <SelectItem value="serialized">Serialized</SelectItem>
                      <SelectItem value="lot">Lot</SelectItem>
                      <SelectItem value="not_tracked">Not Tracked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          {/* Warehouse + Bin — only enabled when stocked */}
          <div className={`grid grid-cols-2 gap-3 transition-opacity ${!form.is_stocked_inventory_item ? 'opacity-40 pointer-events-none' : ''}`}>
            <div className="space-y-1.5">
              <Label className="text-xs">Warehouse Location</Label>
              <MasterDataCombobox
                entityName="WarehouseLocation"
                value={form.warehouse_location_id}
                onChange={handleWarehouseChange}
                placeholder={form.is_stocked_inventory_item ? 'Select warehouse (optional)' : 'Enable stocking first'}
                filter={{ is_active: true }}
                canCreate={true}
                otherOption={true}
                className={errors.warehouse_location_id ? 'border-destructive' : ''}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bin Location</Label>
              <MasterDataCombobox
                entityName="BinLocation"
                value={form.bin_location_id}
                onChange={handleBinChange}
                placeholder={form.warehouse_location_id ? 'Select bin' : 'Select warehouse first'}
                filter={form.warehouse_location_id ? { warehouse_location_id: form.warehouse_location_id, is_active: true } : { warehouse_location_id: '___NONE___' }}
                dependsOn={form.warehouse_location_id}
                canCreate={!!form.warehouse_location_id}
                createExtraFields={{ warehouse_location_id: form.warehouse_location_id, warehouse_location_name: form.warehouse_location }}
                otherOption={true}
                className={errors.bin_location_id ? 'border-destructive' : ''}
              />
            </div>
          </div>

          {/* Vendor + Manufacturer */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <FieldLabel name="vendor_id" />
              <MasterDataCombobox
                entityName="Vendor"
                value={form.vendor_id}
                onChange={handleVendorChange}
                placeholder="Select vendor"
                filter={{ is_active: true }}
                canCreate={true}
                otherOption={true}
                className={errors.vendor_id ? 'border-destructive' : ''}
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel name="manufacturer_id" />
              <MasterDataCombobox
                entityName="Manufacturer"
                value={form.manufacturer_id}
                onChange={handleManufacturerChange}
                placeholder="Select manufacturer"
                filter={{ is_active: true }}
                canCreate={true}
                otherOption={true}
                className={errors.manufacturer_id ? 'border-destructive' : ''}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Quantity Owned</Label>
              {editingItem ? (
                <div className="space-y-1">
                  <Input
                    type="number"
                    value={editingItem.quantity_owned ?? 0}
                    disabled
                    className="bg-muted/50"
                  />
                  <p className="text-xs text-muted-foreground">
                    Quantity adjustments must be made through the Inventory Transaction Engine.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <Input
                    type="number"
                    value={0}
                    disabled
                    className="bg-muted/50"
                  />
                  <p className="text-xs text-muted-foreground">
                    Opening quantity is established through Warehouse Setup counts or inventory transactions after the item is created.
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <FieldLabel name="unit_cost" />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={inputClass('unit_cost') + ' pl-7'}
                  value={form.unit_cost}
                  onChange={e => update('unit_cost', e.target.value)}
                  placeholder="0.00"
                />
                {form.unit_cost !== '' && !isNaN(Number(form.unit_cost)) && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {formatCurrency(form.unit_cost)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Live Inventory Value */}
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Inventory Value (Qty × Unit Cost)</span>
              {inventoryValue !== null ? (
                <span className="text-lg font-bold">{formatCurrency(inventoryValue)}</span>
              ) : (
                <span className="text-sm text-destructive font-medium">
                  Inventory Value cannot be calculated until Unit Cost is entered.
                </span>
              )}
            </div>
          </div>

          {form.is_stocked_inventory_item && (
          <div className="rounded-lg border border-muted p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Stock Level Settings (optional)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Minimum Stock</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.minimum_stock}
                  onChange={e => update('minimum_stock', Number(e.target.value))}
                  className={errors.maximum_stock ? 'border-destructive' : ''}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Maximum Stock</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.maximum_stock}
                  onChange={e => update('maximum_stock', Number(e.target.value))}
                  className={errors.maximum_stock ? 'border-destructive' : ''}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Reorder Point</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.reorder_point}
                  onChange={e => update('reorder_point', Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Reorder Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.reorder_quantity}
                  onChange={e => update('reorder_quantity', Number(e.target.value))}
                />
              </div>
            </div>
          </div>
          )}

          <div className="grid grid-cols-2 gap-3 items-start">
            <div className="space-y-1.5">
              <FieldLabel name="status" />
              <Select value={form.status} onValueChange={v => update('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INVENTORY_STATUS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <FieldLabel name="notes" />
            <Textarea
              value={form.notes}
              onChange={e => update('notes', e.target.value)}
              rows={2}
              className={errors.notes ? 'border-destructive' : ''}
            />
          </div>
        </div>

        {editingItem?.id ? (
          <LinkedResourcesPanel
            entityType="InventoryMaster"
            entityId={editingItem.id}
            title="Product Resources"
          />
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Save this inventory item before linking product resources.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleCloseAttempt}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {editingItem ? 'Save Changes' : 'Add Item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <DirtyCloseWarning open={showWarning} onContinueEditing={cancelDiscard} onDiscardChanges={confirmDiscard} />
    </>
  );
}