import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import ClassificationCombobox from '@/components/admin/ClassificationCombobox';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

export default function CapFinishPricingFormDialog({ open, onClose, onSaved, editEntry, currentUserEmail }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [initialForm, setInitialForm] = useState({});

  useEffect(() => {
    if (open) {
      const init = editEntry ? { ...editEntry } : {
        pricing_name: '',
        finish_type: 'powder_coated',
        cap_size_tier: '',
        cap_style: '',
        surface_area_min: undefined,
        surface_area_max: undefined,
        additional_price: 0,
        is_active: true,
        priority: 0,
        notes: '',
      };
      setForm(init);
      setInitialForm(init);
    }
  }, [open, editEntry]);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onClose());

  const handleSave = async () => {
    if (!form.pricing_name?.trim()) { toast.error('Pricing entry name is required'); return; }
    if (!form.finish_type) { toast.error('Finish type is required'); return; }

    setSaving(true);
    try {
      // Overlap protection: check for existing pricing rules with same finish_type + tier + style + overlapping surface area range
      const allEntries = await base44.entities.CapFinishPricing.filter({ finish_type: form.finish_type }, null, 200);
      const sameScope = allEntries.filter(e => {
        if (e.id === editEntry?.id) return false;
        if (e.is_active === false) return false;
        const tierMatch = (e.cap_size_tier || '') === (form.cap_size_tier || '');
        const styleMatch = (e.cap_style || '') === (form.cap_style || '');
        if (!tierMatch || !styleMatch) return false;
        // Surface area range overlap check
        const eMin = e.surface_area_min ?? 0;
        const eMax = e.surface_area_max ?? Infinity;
        const fMin = form.surface_area_min ?? 0;
        const fMax = form.surface_area_max ?? Infinity;
        return fMin < eMax && fMax > eMin;
      });
      if (sameScope.length > 0) {
        const names = sameScope.map(e => `"${e.pricing_name}"`).join(', ');
        toast.error(`Overlapping pricing rule detected with ${names}. Adjust the size tier, cap style, or surface area range to avoid conflicts.`);
        setSaving(false);
        return;
      }

      const data = { ...form };
      data.updated_by = currentUserEmail || '';
      if (!editEntry) data.created_by = currentUserEmail || '';

      if (editEntry) {
        await base44.entities.CapFinishPricing.update(editEntry.id, data);
        toast.success('Finish pricing updated');
      } else {
        await base44.entities.CapFinishPricing.create(data);
        toast.success('Finish pricing created');
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error('Failed to save: ' + e.message);
    }
    setSaving(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-lg" onCloseAttempt={handleCloseAttempt}>
          <DialogHeader>
            <DialogTitle>{editEntry ? 'Edit Finish Pricing' : 'Add Finish Pricing'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Pricing Entry Name *</Label>
              <Input value={form.pricing_name || ''} onChange={e => set('pricing_name', e.target.value)} placeholder="e.g. Powder-Coat Small Cap" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Finish Type *</Label>
                <Select value={form.finish_type || 'powder_coated'} onValueChange={v => set('finish_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="powder_coated">Powder-Coated</SelectItem>
                    <SelectItem value="painted">Painted</SelectItem>
                    <SelectItem value="ceramic_coated">Ceramic Coated</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cap Size Tier</Label>
                <Select value={form.cap_size_tier || ''} onValueChange={v => set('cap_size_tier', v)}>
                  <SelectTrigger><SelectValue placeholder="Any tier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Cap Style</Label>
              <ClassificationCombobox classificationType="cap_style" value={form.cap_style || ''} onChange={v => set('cap_style', v)} placeholder="Any style (leave blank)" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Surface Area Min (sq in)</Label>
                <Input type="number" value={form.surface_area_min ?? ''} onChange={e => set('surface_area_min', e.target.value === '' ? undefined : parseFloat(e.target.value))} placeholder="0" />
              </div>
              <div>
                <Label>Surface Area Max (sq in)</Label>
                <Input type="number" value={form.surface_area_max ?? ''} onChange={e => set('surface_area_max', e.target.value === '' ? undefined : parseFloat(e.target.value))} placeholder="∞" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Additional Price ($)</Label>
                <Input type="number" value={form.additional_price ?? 0} onChange={e => set('additional_price', parseFloat(e.target.value) || 0)} placeholder="0.00" />
              </div>
              <div>
                <Label>Priority</Label>
                <Input type="number" value={form.priority ?? 0} onChange={e => set('priority', parseFloat(e.target.value) || 0)} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={!!form.is_active} onCheckedChange={v => set('is_active', v)} />
              <Label className="text-xs">Active</Label>
            </div>

            <div>
              <Label>Notes</Label>
              <Input value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Optional notes" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseAttempt}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editEntry ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DirtyCloseWarning open={showWarning} onContinueEditing={cancelDiscard} onDiscardChanges={confirmDiscard} />
    </>
  );
}