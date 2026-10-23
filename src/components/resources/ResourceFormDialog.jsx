import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import {
  RESOURCE_TYPES, APPLIANCE_TYPES, FUEL_TYPES, MANUFACTURER_SUGGESTIONS
} from '@/lib/productResourceConstants';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function ResourceFormDialog({ open, onOpenChange, resource, onSuccess }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && resource) {
      setForm({
        title: resource.title || '',
        description: resource.description || '',
        resource_type: resource.resource_type || 'Manual',
        manufacturer: resource.manufacturer || '',
        product_line: resource.product_line || '',
        product_model: resource.product_model || '',
        appliance_type: resource.appliance_type || '',
        fuel_type: resource.fuel_type || '',
        category: resource.category || '',
        tags: (resource.tags || []).join(', '),
        notes: resource.notes || '',
      });
    }
  }, [open, resource]);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const tagsArray = form.tags
        ? form.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : [];
      const response = await base44.functions.invoke('manageProductResource', {
        action: 'update',
        resource_id: resource.id,
        fields: {
          title: form.title,
          description: form.description,
          resource_type: form.resource_type,
          manufacturer: form.manufacturer,
          product_line: form.product_line,
          product_model: form.product_model,
          appliance_type: form.appliance_type,
          fuel_type: form.fuel_type,
          category: form.category,
          tags: tagsArray,
          notes: form.notes,
        },
      });
      if (response.data?.success) {
        toast.success('Resource updated');
        onSuccess?.(response.data.resource);
        onOpenChange(false);
      } else {
        toast.error(response.data?.error || 'Failed to update resource');
      }
    } catch (e) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Resource</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={form.title || ''} onChange={(e) => set('title', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={form.description || ''}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Resource Type</Label>
              <Select value={form.resource_type} onValueChange={(v) => set('resource_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESOURCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Manufacturer</Label>
              <Input
                value={form.manufacturer || ''}
                onChange={(e) => set('manufacturer', e.target.value)}
                list="manufacturer-suggestions"
              />
              <datalist id="manufacturer-suggestions">
                {MANUFACTURER_SUGGESTIONS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Product Line</Label>
              <Input value={form.product_line || ''} onChange={(e) => set('product_line', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Product Model</Label>
              <Input value={form.product_model || ''} onChange={(e) => set('product_model', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Appliance Type</Label>
              <Select
                value={form.appliance_type || 'none'}
                onValueChange={(v) => set('appliance_type', v === 'none' ? '' : v)}
              >
                <SelectTrigger><SelectValue placeholder="Not specified" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {APPLIANCE_TYPES.filter((a) => a).map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fuel Type</Label>
              <Select
                value={form.fuel_type || 'none'}
                onValueChange={(v) => set('fuel_type', v === 'none' ? '' : v)}
              >
                <SelectTrigger><SelectValue placeholder="Not specified" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {FUEL_TYPES.filter((f) => f).map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Tags (comma-separated)</Label>
            <Input value={form.tags || ''} onChange={(e) => set('tags', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.title}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}