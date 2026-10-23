import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import {
  TRAINING_TYPES, ROLE_OPTIONS, MODULE_ROUTE_OPTIONS
} from '@/lib/trainingRegistryConstants';
import TrainingStepsEditor from './TrainingStepsEditor';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';
import { toast } from 'sonner';

export default function TrainingGuideFormDialog({ open, onOpenChange, initialData, onSave }) {
  const [data, setData] = useState(initialData || {});
  const [saving, setSaving] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [expandedSection, setExpandedSection] = useState('basic');

  useEffect(() => { setData(initialData || {}); }, [initialData]);

  useEffect(() => {
    if (!open) return;
    base44.entities.EmployeeRegistry.list('-created_date', 200)
      .then(recs => setEmployees(recs.filter(e => e.employment_status !== 'Terminated')))
      .catch(() => setEmployees([]));
  }, [open]);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open, initialData]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onOpenChange(false));

  const updateField = (key, value) => { setData(prev => ({ ...prev, [key]: value })); setIsDirty(true); };

  const toggleRole = (roleKey) => {
    const current = data.applicable_roles || [];
    const exists = current.includes(roleKey);
    updateField('applicable_roles', exists ? current.filter(v => v !== roleKey) : [...current, roleKey]);
  };

  const handleSave = async () => {
    if (!data.title) { toast.error('Title is required'); return; }
    setSaving(true);
    try {
      const steps = data.training_steps || '[]';
      const payload = {
        ...data,
        title: data.title,
        training_name: data.title,
        training_steps: typeof steps === 'string' ? steps : JSON.stringify(steps),
      };
      await onSave(payload);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const sections = [
    { id: 'basic', label: 'Basic Info', fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Create an SOP Registry record' },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'What this training guide covers...' },
      { key: 'department', label: 'Department', type: 'select', options: ['Management', 'Warehouse', 'Field Service', 'Office', 'Fleet', 'Safety'] },
      { key: 'training_type', label: 'Training Type', type: 'select', options: TRAINING_TYPES },
      { key: 'estimated_completion_time', label: 'Estimated Completion Time', type: 'text', placeholder: 'e.g. 15 min' },
    ]},
    { id: 'applicability', label: 'Applicability & Links', fields: [
      { key: 'related_module', label: 'Related Module', type: 'module_select' },
      { key: 'related_task_type', label: 'Related Task Type', type: 'text', placeholder: 'e.g. SOP Draft' },
      { key: 'linked_task_number', label: 'Linked Task Number', type: 'text', placeholder: 'e.g. TSK-000001' },
      { key: 'applicable_roles', label: 'Applicable Roles', type: 'roles' },
    ]},
    { id: 'learning', label: 'Learning & Prerequisites', fields: [
      { key: 'learning_objective', label: 'Learning Objective', type: 'textarea', placeholder: 'What the trainee should be able to do after completing this guide.' },
      { key: 'prerequisites', label: 'Prerequisites', type: 'textarea', placeholder: 'Prior training, equipment, access, etc.' },
    ]},
    { id: 'steps', label: 'Training Steps', fields: [
      { key: 'training_steps', label: 'Steps', type: 'steps_editor' },
    ]},
    { id: 'review', label: 'Review & Approval', fields: [
      { key: 'reviewer_employee_id', label: 'Reviewer', type: 'employee_select' },
      { key: 'approver_employee_id', label: 'Approver', type: 'employee_select' },
    ]},
    { id: 'versioning', label: 'Versioning & Dates', fields: [
      { key: 'version', label: 'Version', type: 'text', placeholder: '1.0' },
      { key: 'effective_date', label: 'Effective Date', type: 'date' },
      { key: 'review_date', label: 'Review Date', type: 'date' },
    ]},
  ];

  const renderField = (field) => {
    const value = data[field.key];
    switch (field.type) {
      case 'text':
        return <Input value={value || ''} onChange={e => updateField(field.key, e.target.value)} placeholder={field.placeholder} />;
      case 'textarea':
        return <Textarea value={value || ''} onChange={e => updateField(field.key, e.target.value)} placeholder={field.placeholder} rows={2} />;
      case 'date':
        return <Input type="date" value={value || ''} onChange={e => updateField(field.key, e.target.value)} />;
      case 'select':
        return (
          <Select value={value || ''} onValueChange={v => updateField(field.key, v)}>
            <SelectTrigger><SelectValue placeholder={`Select ${field.label}`} /></SelectTrigger>
            <SelectContent>
              {field.options.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case 'module_select':
        return (
          <Select value={value || ''} onValueChange={v => {
            const opt = MODULE_ROUTE_OPTIONS.find(o => o.module === v);
            updateField('related_module', v);
            if (opt) updateField('related_route', opt.route);
          }}>
            <SelectTrigger><SelectValue placeholder="Select module" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>— None —</SelectItem>
              {MODULE_ROUTE_OPTIONS.map(opt => <SelectItem key={opt.module} value={opt.module}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case 'employee_select':
        return (
          <Select value={value || ''} onValueChange={v => updateField(field.key, v)}>
            <SelectTrigger><SelectValue placeholder={`Select ${field.label}`} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>— None —</SelectItem>
              {employees.map(emp => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name} ({emp.employee_id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'roles':
        return (
          <div className="grid grid-cols-2 gap-2 rounded-md border border-input p-3 max-h-48 overflow-y-auto">
            {ROLE_OPTIONS.map(opt => {
              const checked = Array.isArray(value) && value.includes(opt.key);
              return (
                <div key={opt.key} className="flex items-center gap-2">
                  <Checkbox checked={checked} onCheckedChange={() => toggleRole(opt.key)} />
                  <span className="text-sm">{opt.label}</span>
                </div>
              );
            })}
          </div>
        );
      case 'steps_editor':
        return (
          <TrainingStepsEditor
            steps={typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return []; } })() : (value || [])}
            onChange={(newSteps) => updateField(field.key, JSON.stringify(newSteps))}
            guideId={initialData?.id}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleCloseAttempt}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{initialData?.id ? 'Edit Training Guide' : 'New Training Guide'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            {sections.map(section => (
              <div key={section.id} className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted text-left"
                >
                  {expandedSection === section.id
                    ? <ChevronDown className="w-4 h-4" />
                    : <ChevronRight className="w-4 h-4" />}
                  <span className="text-sm font-medium">{section.label}</span>
                </button>
                {expandedSection === section.id && (
                  <div className="p-3 space-y-3">
                    {section.fields.map(field => (
                      <div key={field.key}>
                        <Label className="text-xs">
                          {field.label}
                          {field.required && <span className="text-destructive ml-1">*</span>}
                        </Label>
                        <div className="mt-1">{renderField(field)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !data.title}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {initialData?.id ? 'Save Changes' : 'Create Guide'}
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