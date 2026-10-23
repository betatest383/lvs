import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { DEFAULT_CROWN_SETTINGS } from '@/lib/crownCalculationEngine';

/**
 * Dialog for managing CrownCalculationSettings — configurable calculation defaults.
 */
export default function CrownSettingsPanel({ open, onClose, settings, onSaved }) {
  const [form, setForm] = useState(DEFAULT_CROWN_SETTINGS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({ ...DEFAULT_CROWN_SETTINGS, ...settings });
    }
  }, [settings]);

  const update = (field, val) => setForm(prev => ({ ...prev, [field]: Number(val) || 0 }));

  const handleSave = async () => {
    setSaving(true);
    try {
      let saved;
      if (settings?.id) {
        saved = await base44.entities.CrownCalculationSettings.update(settings.id, form);
      } else {
        saved = await base44.entities.CrownCalculationSettings.create(form);
      }
      toast.success('Crown calculation settings saved');
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast.error('Failed to save settings: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crown Calculation Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Default Crown Thickness (inches)</Label>
            <Input type="number" step="0.01" value={form.default_crown_thickness_inches} onChange={e => update('default_crown_thickness_inches', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Default Bag Weight (lbs)</Label>
              <Input type="number" step="1" value={form.default_bag_weight_lbs} onChange={e => update('default_bag_weight_lbs', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Yield per Bag (cu ft)</Label>
              <Input type="number" step="0.01" value={form.default_yield_per_bag_cubic_feet} onChange={e => update('default_yield_per_bag_cubic_feet', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Foam Package Length (inches)</Label>
            <Input type="number" step="1" value={form.foam_package_length_inches} onChange={e => update('foam_package_length_inches', e.target.value)} />
            <p className="text-xs text-muted-foreground">Package length of expansion foam for purchase quantity calculation</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Crown Form Classification Thresholds (inches)</Label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Small ≤</Label>
                <Input type="number" step="0.01" value={form.small_form_max_inches} onChange={e => update('small_form_max_inches', e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Medium ≤</Label>
                <Input type="number" step="0.01" value={form.medium_form_max_inches} onChange={e => update('medium_form_max_inches', e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Large ≤</Label>
                <Input type="number" step="0.01" value={form.large_form_max_inches} onChange={e => update('large_form_max_inches', e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Over Large max = Custom Wood Forms</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}