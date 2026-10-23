import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { CONDITION_LABELS, STATUS_LABELS } from '@/lib/equipmentConstants';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

export default function EquipmentFormDialog({ open, onOpenChange, initialData, onSaved }) {
  const [form, setForm] = useState(initialData || {});
  const [initialForm, setInitialForm] = useState(initialData || {});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    setForm(initialData || {});
    setInitialForm(initialData || {});
  }, [initialData]);

  useEffect(() => {
    if (open) {
      base44.entities.EquipmentCategory.filter({ is_active: true }, 'sort_order', 50)
        .then(setCategories)
        .catch(() => {});
    }
  }, [open]);

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onOpenChange(false));

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      update('photo_url', file_url);
      toast.success('Photo uploaded');
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.item_name) { toast.error('Item name is required'); return; }
    setSaving(true);
    try {
      let result;
      const data = {
        ...form,
        quantity: form.quantity || 1,
        assignment_type: form.assignment_type || 'warehouse_stock',
        status: form.status || 'active',
        condition: form.condition || 'good',
      };
      if (initialData?.id) {
        result = await base44.entities.TechEquipment.update(initialData.id, data);
        toast.success('Equipment updated');
      } else {
        const count = await base44.entities.TechEquipment.filter({});
        const seq = String((count?.length || 0) + 1).padStart(6, '0');
        result = await base44.entities.TechEquipment.create({
          ...data,
          equipment_id: data.equipment_id || `EQ-${seq}`,
        });
        toast.success('Equipment created');
      }
      onSaved?.(result);
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to save equipment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onCloseAttempt={handleCloseAttempt}>
        <DialogHeader>
          <DialogTitle>{initialData?.id ? 'Edit Equipment' : 'Add Equipment'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Photo */}
          <div className="flex items-center gap-4">
            {form.photo_url ? (
              <div className="relative">
                <img src={form.photo_url} alt="Equipment" className="w-24 h-24 rounded-lg object-cover" />
                <button onClick={() => update('photo_url', null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <label className="w-24 h-24 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer hover:bg-muted">
                {uploading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : <Upload className="w-5 h-5 text-muted-foreground" />}
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
              </label>
            )}
            <p className="text-xs text-muted-foreground">Upload a photo of the equipment</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Equipment ID</Label>
              <Input className="mt-1" value={form.equipment_id || ''} onChange={e => update('equipment_id', e.target.value)} placeholder="Auto-generated" />
            </div>
            <div>
              <Label>Item Name *</Label>
              <Input className="mt-1" value={form.item_name || ''} onChange={e => update('item_name', e.target.value)} placeholder="e.g. RIDGID SeeSnake" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={form.category || ''} onValueChange={v => update('category', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={c.category_name}>{c.category_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Manufacturer</Label>
              <Input className="mt-1" value={form.manufacturer || ''} onChange={e => update('manufacturer', e.target.value)} placeholder="e.g. RIDGID" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Model</Label>
              <Input className="mt-1" value={form.model || ''} onChange={e => update('model', e.target.value)} placeholder="e.g. micro CA-25" />
            </div>
            <div>
              <Label>Serial Number</Label>
              <Input className="mt-1" value={form.serial_number || ''} onChange={e => update('serial_number', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>SKU / Part Number</Label>
              <Input className="mt-1" value={form.sku || ''} onChange={e => update('sku', e.target.value)} />
            </div>
            <div>
              <Label>Barcode / QR Code</Label>
              <Input className="mt-1" value={form.barcode_qr || ''} onChange={e => update('barcode_qr', e.target.value)} placeholder="Scan or type" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Purchase Date</Label>
              <Input className="mt-1" type="date" value={form.purchase_date || ''} onChange={e => update('purchase_date', e.target.value)} />
            </div>
            <div>
              <Label>Purchase Cost ($)</Label>
              <Input className="mt-1" type="number" step="0.01" value={form.purchase_cost ?? ''} onChange={e => update('purchase_cost', parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Replacement Cost ($)</Label>
              <Input className="mt-1" type="number" step="0.01" value={form.replacement_cost ?? ''} onChange={e => update('replacement_cost', parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Current Value ($)</Label>
              <Input className="mt-1" type="number" step="0.01" value={form.current_value ?? ''} onChange={e => update('current_value', parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Quantity</Label>
              <Input className="mt-1" type="number" min="1" value={form.quantity ?? 1} onChange={e => update('quantity', parseInt(e.target.value) || 1)} />
            </div>
            <div>
              <Label>Supplier</Label>
              <Input className="mt-1" value={form.supplier || ''} onChange={e => update('supplier', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={form.status || 'active'} onValueChange={v => update('status', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Condition</Label>
              <Select value={form.condition || 'good'} onValueChange={v => update('condition', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CONDITION_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Warranty Expiry</Label>
              <Input className="mt-1" type="date" value={form.warranty_expiry || ''} onChange={e => update('warranty_expiry', e.target.value)} />
            </div>
            <div>
              <Label>Next Audit Date</Label>
              <Input className="mt-1" type="date" value={form.next_audit_date || ''} onChange={e => update('next_audit_date', e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={form.required_daily_operations || false} onCheckedChange={v => update('required_daily_operations', v)} />
              <Label className="text-sm">Required for Daily Operations</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.required_todays_job || false} onCheckedChange={v => update('required_todays_job', v)} />
              <Label className="text-sm">Required for Today's Job</Label>
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea className="mt-1" rows={2} value={form.description || ''} onChange={e => update('description', e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea className="mt-1" rows={2} value={form.notes || ''} onChange={e => update('notes', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCloseAttempt}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {initialData?.id ? 'Save Changes' : 'Create Equipment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <DirtyCloseWarning open={showWarning} onContinueEditing={cancelDiscard} onDiscardChanges={confirmDiscard} />
    </>
  );
}