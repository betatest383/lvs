import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

const CLASSIFICATION_TYPES = [
  { value: 'inspection_category', label: 'Inspection Category' },
  { value: 'inspection_section', label: 'Inspection Section' },
  { value: 'inspection_form', label: 'Inspection Form' },
  { value: 'deficiency_type', label: 'Deficiency Type' },
  { value: 'appliance_system_type', label: 'Appliance / System Type' },
  { value: 'chimney_system_type', label: 'Chimney System Type' },
  { value: 'severity_level', label: 'Severity Level' },
  { value: 'homeowner_risk', label: 'Homeowner Risk' },
  { value: 'finding_category', label: 'Finding Category' },
  { value: 'repair_category', label: 'Repair Category' },
];

const PARENT_TYPE_MAP = {
  inspection_section: 'inspection_form',
};

export default function ClassificationFormDialog({ open, onClose, onSaved, record, allRecords }) {
  const isEdit = !!record;
  const [form, setForm] = useState(() => record || {
    classification_type: 'inspection_category',
    value: '',
    label: '',
    parent_value: '',
    description: '',
    sort_order: 0,
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [initialForm, setInitialForm] = useState({});

  // Reset form when record changes (dialog stays mounted)
  useEffect(() => {
    const init = record ? record : {
      classification_type: 'inspection_category',
      value: '',
      label: '',
      parent_value: '',
      description: '',
      sort_order: 0,
      is_active: true,
    };
    setForm(init);
    setInitialForm(init);
  }, [open, record]);

  const update = (field, val) => setForm(prev => ({ ...prev, [field]: val }));

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onClose());

  const parentType = PARENT_TYPE_MAP[form.classification_type];
  const parentOptions = parentType
    ? allRecords.filter(r => r.classification_type === parentType && r.is_active !== false)
    : [];

  const handleSave = async () => {
    if (!form.value?.trim()) {
      toast.error('Value is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        value: form.value.trim(),
        label: (form.label || form.value).trim(),
        sort_order: Number(form.sort_order) || 0,
        is_active: form.is_active !== false,
      };
      if (isEdit) {
        await base44.entities.MasterClassification.update(record.id, payload);
        toast.success('Classification updated');
      } else {
        await base44.entities.MasterClassification.create(payload);
        toast.success('Classification created');
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error('Failed to save: ' + (e?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-md" onCloseAttempt={handleCloseAttempt}>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Classification' : 'Add Classification'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-sm">Classification Type</Label>
            <Select
              value={form.classification_type}
              onValueChange={v => update('classification_type', v)}
              disabled={isEdit}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CLASSIFICATION_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isEdit && <p className="text-xs text-muted-foreground mt-1">Type cannot be changed after creation.</p>}
          </div>
          <div>
            <Label className="text-sm">Value *</Label>
            <Input
              value={form.value}
              onChange={e => update('value', e.target.value)}
              placeholder="e.g. Exterior Chimney"
            />
            <p className="text-xs text-muted-foreground mt-1">Canonical value stored in entity fields.</p>
          </div>
          <div>
            <Label className="text-sm">Display Label</Label>
            <Input
              value={form.label}
              onChange={e => update('label', e.target.value)}
              placeholder="Defaults to Value if empty"
            />
          </div>
          {parentType && (
            <div>
              <Label className="text-sm">Parent ({parentType.replace(/_/g, ' ')})</Label>
              <Select
                value={form.parent_value || 'none'}
                onValueChange={v => update('parent_value', v === 'none' ? '' : v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No parent —</SelectItem>
                  {parentOptions.map(p => (
                    <SelectItem key={p.id} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-sm">Description</Label>
            <Textarea
              value={form.description || ''}
              onChange={e => update('description', e.target.value)}
              rows={2}
              placeholder="Optional description..."
            />
          </div>
          <div>
            <Label className="text-sm">Sort Order</Label>
            <Input
              type="number"
              value={form.sort_order || 0}
              onChange={e => update('sort_order', e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.is_active !== false}
              onCheckedChange={v => update('is_active', v)}
            />
            <Label className="text-sm">Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCloseAttempt} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <DirtyCloseWarning open={showWarning} onContinueEditing={cancelDiscard} onDiscardChanges={confirmDiscard} />
    </>
  );
}