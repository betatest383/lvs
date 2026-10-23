import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import {
  AUDIT_FREQUENCIES, ROLE_OPTIONS, SUGGESTED_SECTIONS,
  parseSections, generateAuditTemplateId,
} from '@/lib/auditConstants';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

function SectionEditor({ sections, onChange }) {
  const addSection = () => {
    onChange([...sections, { name: '', items: [] }]);
  };
  const updateSection = (idx, field, val) => {
    const next = [...sections];
    next[idx] = { ...next[idx], [field]: val };
    onChange(next);
  };
  const removeSection = (idx) => {
    onChange(sections.filter((_, i) => i !== idx));
  };
  const addItem = (sIdx) => {
    const next = [...sections];
    next[sIdx] = { ...next[sIdx], items: [...(next[sIdx].items || []), { description: '', weight: 1, required: false, photo_required: false }] };
    onChange(next);
  };
  const updateItem = (sIdx, iIdx, field, val) => {
    const next = [...sections];
    const items = [...(next[sIdx].items || [])];
    items[iIdx] = { ...items[iIdx], [field]: val };
    next[sIdx] = { ...next[sIdx], items };
    onChange(next);
  };
  const removeItem = (sIdx, iIdx) => {
    const next = [...sections];
    next[sIdx] = { ...next[sIdx], items: (next[sIdx].items || []).filter((_, i) => i !== iIdx) };
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {sections.map((section, sIdx) => (
        <div key={sIdx} className="rounded-lg border border-border p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Input
              value={section.name}
              onChange={(e) => updateSection(sIdx, 'name', e.target.value)}
              placeholder="Section name (e.g. Documentation)"
              className="font-medium"
            />
            <Button variant="ghost" size="icon" onClick={() => removeSection(sIdx)} className="shrink-0 text-red-500 hover:text-red-600">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
          <div className="space-y-2">
            {(section.items || []).map((item, iIdx) => (
              <div key={iIdx} className="flex items-start gap-2 rounded-md bg-muted/30 p-2">
                <div className="flex-1 space-y-2">
                  <Input
                    value={item.description}
                    onChange={(e) => updateItem(sIdx, iIdx, 'description', e.target.value)}
                    placeholder="Checklist item description"
                    className="text-sm"
                  />
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs text-muted-foreground">Weight</Label>
                      <input
                        type="number"
                        value={item.weight || 1}
                        onChange={(e) => updateItem(sIdx, iIdx, 'weight', Number(e.target.value))}
                        className="w-14 h-7 rounded border border-input px-1 text-sm"
                        min="1"
                      />
                    </div>
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <input type="checkbox" checked={item.required || false} onChange={(e) => updateItem(sIdx, iIdx, 'required', e.target.checked)} />
                      Required
                    </label>
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <input type="checkbox" checked={item.photo_required || false} onChange={(e) => updateItem(sIdx, iIdx, 'photo_required', e.target.checked)} />
                      Photo Required
                    </label>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeItem(sIdx, iIdx)} className="shrink-0 text-red-500 hover:text-red-600 mt-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => addItem(sIdx)} className="w-full border-dashed">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Checklist Item
            </Button>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={addSection}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Section
        </Button>
        <Select onValueChange={(v) => onChange([...sections, { name: v, items: [] }])}>
          <SelectTrigger className="w-48 h-8 text-xs"><span className="text-muted-foreground">Quick add section...</span></SelectTrigger>
          <SelectContent>{SUGGESTED_SECTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
  );
}

export default function AuditTemplateFormDialog({ open, onClose, template, onSaved }) {
  const [form, setForm] = useState({});
  const [sections, setSections] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (template) {
        setForm({ ...template });
        setSections(parseSections(template.sections));
      } else {
        setForm({ status: 'Active', audit_frequency: 'Monthly', applicable_roles: [] });
        setSections([]);
      }
    }
  }, [template, open]);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open, template]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onClose());

  const update = (key, val) => { setForm((p) => ({ ...p, [key]: val })); setIsDirty(true); };
  const toggleRole = (role) => {
    const arr = form.applicable_roles || [];
    update('applicable_roles', arr.includes(role) ? arr.filter((r) => r !== role) : [...arr, role]);
  };

  const handleSave = async () => {
    if (!form.audit_name?.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, sections: JSON.stringify(sections) };
      if (template?.id) {
        await base44.entities.AuditTemplate.update(template.id, payload);
      } else {
        const auditId = await generateAuditTemplateId(form.department, form.related_sop);
        await base44.entities.AuditTemplate.create({ ...payload, audit_id: auditId });
      }
      onSaved?.();
      onClose();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const inputClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

  return (
    <>
    <Dialog open={open} onOpenChange={onClose}>
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