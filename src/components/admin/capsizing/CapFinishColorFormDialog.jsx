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
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

export default function CapFinishColorFormDialog({ open, onClose, onSaved, editColor, currentUserEmail }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [initialForm, setInitialForm] = useState({});

  useEffect(() => {
    if (open) {
      const init = editColor ? { ...editColor } : {
        display_name: '',
        manufacturer_color_code: '',
        color_family: 'black',
        hex_value: '#1A1A1A',
        manufacturer: '',
        is_active: true,
        additional_cost: 0,
        lead_time_adjustment_days: 0,
        sort_order: 0,
        notes: '',
      };
      setForm(init);
      setInitialForm(init);
    }
  }, [open, editColor]);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onClose());

  const handleSave = async () => {
    if (!form.display_name?.trim()) { toast.error('Display name is required'); return; }
    if (!form.color_family) { toast.error('Color family is required'); return; }

    setSaving(true);
    try {
      // Duplicate protection: check for existing color with same manufacturer_color_code
      const code = form.manufacturer_color_code?.trim();
      if (code) {
        const existing = await base44.entities.CapFinishColor.filter({ manufacturer_color_code: code }, null, 50);
        const dupe = existing.find(c => c.id !== editColor?.id);
        if (dupe) {
          toast.error(`Duplicate color code: "${code}" is already used by "${dupe.display_name}". Color codes must be unique.`);
          setSaving(false);
          return;
        }
      }

      const data = { ...form };
      data.updated_by = currentUserEmail || '';
      if (!editColor) data.created_by = currentUserEmail || '';

      if (editColor) {
        await base44.entities.CapFinishColor.update(editColor.id, data);
        toast.success('Finish color updated');
      } else {
        await base44.entities.CapFinishColor.create(data);
        toast.success('Finish color created');
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
            <DialogTitle>{editColor ? 'Edit Finish Color' : 'Add Finish Color'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Display Name *</Label>
              <Input value={form.display_name || ''} onChange={e => set('display_name', e.target.value)} placeholder="e.g. Textured Black" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Manufacturer Color Code</Label>
                <Input value={form.manufacturer_color_code || ''} onChange={e => set('manufacturer_color_code', e.target.value)} placeholder="e.g. RAL 9005" />
              </div>
              <div>
                <Label>Manufacturer</Label>
                <Input value={form.manufacturer || ''} onChange={e => set('manufacturer', e.target.value)} placeholder="e.g. HY-C, Gelco" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Color Family *</Label>
                <Select value={form.color_family || 'black'} onValueChange={v => set('color_family', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="black">Black</SelectItem>
                    <SelectItem value="bronze">Bronze</SelectItem>
                    <SelectItem value="brown">Brown</SelectItem>
                    <SelectItem value="clay">Clay</SelectItem>
                    <SelectItem value="gray">Gray</SelectItem>
                    <SelectItem value="green">Green</SelectItem>
                    <SelectItem value="red">Red</SelectItem>
                    <SelectItem value="white">White</SelectItem>
                    <SelectItem value="blue">Blue</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Swatch Hex Value</Label>
                <div className="flex gap-2 items-center">
                  <Input type="color" value={form.hex_value || '#1A1A1A'} onChange={e => set('hex_value', e.target.value)} className="w-12 h-9 p-1" />
                  <Input value={form.hex_value || ''} onChange={e => set('hex_value', e.target.value)} placeholder="#1A1A1A" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Additional Cost ($)</Label>
                <Input type="number" value={form.additional_cost ?? 0} onChange={e => set('additional_cost', parseFloat(e.target.value) || 0)} placeholder="0.00" />
              </div>
              <div>
                <Label>Lead-Time Adjustment (Days)</Label>
                <Input type="number" value={form.lead_time_adjustment_days ?? 0} onChange={e => set('lead_time_adjustment_days', parseFloat(e.target.value) || 0)} placeholder="0" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sort Order</Label>
                <Input type="number" value={form.sort_order ?? 0} onChange={e => set('sort_order', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={!!form.is_active} onCheckedChange={v => set('is_active', v)} />
                <Label className="text-xs">Active</Label>
              </div>
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
              {editColor ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DirtyCloseWarning open={showWarning} onContinueEditing={cancelDiscard} onDiscardChanges={confirmDiscard} />
    </>
  );
}