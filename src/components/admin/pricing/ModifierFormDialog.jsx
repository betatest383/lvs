import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import {
  MODIFIER_STATUS_OPTIONS, OPERATOR_OPTIONS, CALCULATION_METHOD_OPTIONS,
  APPLIES_TO_OPTIONS, STACKING_METHOD_OPTIONS, SOURCE_FIELD_OPTIONS,
} from './pricingConstants';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

function SectionHeader({ children }) {
  return <h4 className="text-sm font-semibold text-foreground border-b pb-1.5 mt-4 first:mt-0">{children}</h4>;
}

function Toggle({ checked, onChange, label }) {
  return (
    <div className="flex items-center gap-2">
      <Switch checked={checked} onCheckedChange={onChange} />
      <Label className="text-sm text-muted-foreground">{label}</Label>
    </div>
  );
}

const arrayToText = arr => Array.isArray(arr) ? arr.join(', ') : '';
const textToArray = text => text ? text.split(',').map(s => s.trim()).filter(Boolean) : [];

export default function ModifierFormDialog({ open, onOpenChange, title, initialData, onSave }) {
  const [data, setData] = useState(initialData || {});
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    setData(initialData || { status: 'draft', applies_automatically: true, affects_customer_price: true, stacking_method: 'additive', display_order: 0, multiplier_value: 1 });
  }, [initialData, open]);

  useEffect(() => {
    if (open) {
      base44.entities.PricingModifierCategory.filter({ status: 'active' }, 'display_order', 200)
        .then(setCategories)
        .catch(() => {});
    }
  }, [open]);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open, initialData]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onOpenChange(false));

  const update = (key, value) => { setData(prev => ({ ...prev, [key]: value })); setIsDirty(true); };
  const updateCategory = (catId) => {
    const cat = categories.find(c => c.id === catId);
    setData(prev => ({ ...prev, category_id: catId, category_name: cat?.name || '' }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!data.name?.trim()) { toast.error('Modifier Name is required'); return; }
    if (!data.category_id) { toast.error('Category is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...data,
        service_catalog_ids: textToArray(data._service_catalog_ids_text ?? arrayToText(data.service_catalog_ids)),
        service_category_ids: textToArray(data._service_category_ids_text ?? arrayToText(data.service_category_ids)),
        repair_template_ids: textToArray(data._repair_template_ids_text ?? arrayToText(data.repair_template_ids)),
        exclude_service_ids: textToArray(data._exclude_service_ids_text ?? arrayToText(data.exclude_service_ids)),
      };
      delete payload._service_catalog_ids_text;
      delete payload._service_category_ids_text;
      delete payload._repair_template_ids_text;
      delete payload._exclude_service_ids_text;
      await onSave(payload);
      onOpenChange(false);
    } catch (error) {
      toast.error(`Save failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const method = data.calculation_method;
  const showField = (...methods) => methods.includes(method);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
...
    </Dialog>
    <DirtyCloseWarning
      open={showWarning}
      onContinueEditing={cancelDiscard}
      onDiscardChanges={confirmDiscard}
    />
    </>
  );
}