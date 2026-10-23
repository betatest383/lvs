import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';
import LinkedResourcesPanel from '@/components/resources/LinkedResourcesPanel';

const ROLES = [
  'Warehouse Associate', 'Warehouse Manager', 'Lead Technician', 'Apprentice',
  'CSR', 'Dispatcher', 'Sales Technician', 'Operations Manager',
  'Office Manager', 'Owner', 'Customer',
];

const SECTIONS = [
  {
    title: 'General Information',
    fields: [
      { key: 'sop_id', label: 'SOP ID', type: 'text', required: true, placeholder: 'e.g. SOP-001' },
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'department', label: 'Department', type: 'text' },
      { key: 'subject', label: 'Subject', type: 'text' },
      { key: 'document', label: 'Document', type: 'text' },
      { key: 'page', label: 'Page', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
  },
  {
    title: 'Classification',
    fields: [
      { key: 'type', label: 'Type', type: 'select', options: [
        { value: 'Process', label: 'Process' },
        { value: 'Policy', label: 'Policy' },
        { value: 'Company', label: 'Company' },
        { value: 'Form', label: 'Form' },
        { value: 'Checklist', label: 'Checklist' },
      ]},
    ],
  },
  {
    title: 'Status',
    fields: [
      { key: 'status', label: 'Status', type: 'select', options: [
        { value: 'Planned', label: 'Planned' },
        { value: 'Draft', label: 'Draft' },
        { value: 'In Review', label: 'In Review' },
        { value: 'Approved', label: 'Approved' },
        { value: 'Archived', label: 'Archived' },
      ]},
      { key: 'lifecycle_stage', label: 'Lifecycle Stage', type: 'select', options: [
        { value: 'Planned', label: 'Planned — Identified but not started' },
        { value: 'Draft', label: 'Draft — Trainual content being written' },
        { value: 'Review', label: 'Review — Operations review' },
        { value: 'Approved', label: 'Approved — Official company process' },
        { value: 'Base44 Build', label: 'Base44 Build — Workflow under development' },
        { value: 'Testing', label: 'Testing — Employees testing the workflow' },
        { value: 'Live', label: 'Live — Active in production' },
        { value: 'Continuous Improvement', label: 'Continuous Improvement — Monitoring and refining' },
      ]},
    ],
  },
  {
    title: 'Version Control',
    fields: [
      { key: 'current_version', label: 'Current Version', type: 'text', placeholder: 'e.g. 1.0' },
      { key: 'last_reviewed', label: 'Last Reviewed', type: 'date' },
      { key: 'next_review_date', label: 'Next Review Date', type: 'date' },
    ],
  },
  {
    title: 'Ownership',
    fields: [
      { key: 'process_owner', label: 'Process Owner', type: 'text' },
      { key: 'reviewer', label: 'Reviewer', type: 'text' },
      { key: 'approver', label: 'Approver', type: 'text' },
    ],
  },
  {
    title: 'Trainual',
    fields: [
      { key: 'trainual_url', label: 'Trainual URL', type: 'text', placeholder: 'https://trainual.com/...' },
      { key: 'training_required', label: 'Training Required', type: 'boolean' },
      { key: 'quiz_required', label: 'Quiz Required', type: 'boolean' },
    ],
  },
  {
    title: 'Base44',
    fields: [
      { key: 'base44_module', label: 'Base44 Module', type: 'text', placeholder: 'e.g. Warehouse Operations' },
      { key: 'workflow_name', label: 'Workflow Name', type: 'text' },
      { key: 'workflow_status', label: 'Workflow Status', type: 'select', options: [
        { value: 'Planned', label: 'Planned' },
        { value: 'In Development', label: 'In Development' },
        { value: 'Testing', label: 'Testing' },
        { value: 'Live', label: 'Live' },
      ]},
    ],
  },
  {
    title: 'Automation',
    fields: [
      { key: 'automation_required', label: 'Automation Required', type: 'boolean' },
      { key: 'automation_status', label: 'Automation Status', type: 'text', placeholder: 'e.g. Planned, Built, Active' },
      { key: 'automation_description', label: 'Automation Description', type: 'textarea' },
    ],
  },
  {
    title: 'Relationships',
    fields: [
      { key: 'related_policies', label: 'Related Policies (comma-separated)', type: 'text_list', placeholder: 'e.g. WP-001 One Material Request Policy' },
      { key: 'related_forms', label: 'Related Forms (comma-separated)', type: 'text_list', placeholder: 'e.g. FRM-001 Material Transfer Sheet' },
      { key: 'related_workflows', label: 'Related Workflows (comma-separated)', type: 'text_list', placeholder: 'e.g. WF-WH-001 Morning Material Request' },
      { key: 'related_sops', label: 'Related SOPs (comma-separated IDs)', type: 'text_list' },
    ],
  },
  {
    title: 'Reports',
    fields: [
      { key: 'related_dashboard', label: 'Related Dashboard', type: 'text' },
      { key: 'kpi_name', label: 'KPI Name', type: 'text' },
    ],
  },
  {
    title: 'Roles',
    fields: [
      { key: 'applies_to', label: 'Applies To', type: 'multi_select', options: ROLES },
    ],
  },

  {
    title: 'Documentation',
    fields: [
      { key: 'photos_complete', label: 'Photos Complete', type: 'boolean' },
      { key: 'videos_complete', label: 'Videos Complete', type: 'boolean' },
      { key: 'attachments_complete', label: 'Attachments Complete', type: 'boolean' },
    ],
  },
  {
    title: 'AI Notes',
    fields: [
      { key: 'improvement_ideas', label: 'Improvement Ideas', type: 'textarea' },
      { key: 'revision_notes', label: 'Revision Notes', type: 'textarea' },
    ],
  },
];

export default function SopFormDialog({ open, onOpenChange, title, initialData, onSave }) {
  const [data, setData] = useState(initialData || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setData(initialData || {});
  }, [initialData]);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open, initialData]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onOpenChange(false));

  const updateField = (key, value) => { setData(prev => ({ ...prev, [key]: value })); setIsDirty(true); };

  const toggleArrayValue = (key, value) => {
    const current = data[key] || [];
    const exists = current.includes(value);
    updateField(key, exists ? current.filter(v => v !== value) : [...current, value]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(data);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const renderField = (field) => {
    const value = data[field.key];

    switch (field.type) {
      case 'text':
        return (
          <Input
            value={value || ''}
            onChange={e => updateField(field.key, e.target.value)}
            placeholder={field.placeholder}
          />
        );
      case 'textarea':
        return (
          <Textarea
            value={value || ''}
            onChange={e => updateField(field.key, e.target.value)}
            placeholder={field.placeholder}
            rows={3}
          />
        );
      case 'date':
        return (
          <Input
            type="date"
            value={value || ''}
            onChange={e => updateField(field.key, e.target.value)}
          />
        );
      case 'select':
        return (
          <Select value={value || ''} onValueChange={v => updateField(field.key, v)}>
            <SelectTrigger><SelectValue placeholder={`Select ${field.label}`} /></SelectTrigger>
            <SelectContent>
              {field.options.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'boolean':
        return (
          <div className="flex items-center gap-2">
            <Switch checked={value || false} onCheckedChange={v => updateField(field.key, v)} />
            <span className="text-sm text-muted-foreground">{value ? 'Yes' : 'No'}</span>
          </div>
        );
      case 'text_list':
        return (
          <Input
            value={Array.isArray(value) ? value.join(', ') : (value || '')}
            onChange={e => updateField(field.key, e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            placeholder={field.placeholder}
          />
        );
      case 'multi_select':
        return (
          <div className="grid grid-cols-2 gap-2 rounded-md border border-input p-3">
            {field.options.map(opt => {
              const checked = Array.isArray(value) && value.includes(opt);
              return (
                <div key={opt} className="flex items-center gap-2">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleArrayValue(field.key, opt)}
                  />
                  <span className="text-sm">{opt}</span>
                </div>
              );
            })}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onCloseAttempt={handleCloseAttempt}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {SECTIONS.map(section => (
            <div key={section.title} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">{section.title}</h3>
              {section.fields.map(field => (
                <div key={field.key} className="space-y-1">
                  <Label className="text-xs">
                    {field.label}
                    {field.required && <span className="text-destructive ml-0.5">*</span>}
                  </Label>
                  {renderField(field)}
                </div>
              ))}
            </div>
          ))}

          {initialData?.id && (
            <LinkedResourcesPanel entityType="SopRegistry" entityId={initialData.id} title="Product Resources" />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCloseAttempt}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <DirtyCloseWarning
      open={showWarning}
      onContinueEditing={cancelDiscard}
      onDiscardChanges={confirmDiscard}
    />
    </>
  );
}