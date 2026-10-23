import { useState, useEffect, useMemo } from 'react';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { useCurrentRole } from '@/hooks/useCurrentRole';
import { toast } from 'sonner';
import {
  TASK_TYPES, TASK_STATUSES, TASK_PRIORITIES, DEPARTMENTS,
  SOURCE_MODULES, generateTaskId,
} from '@/lib/enterpriseTaskConstants';

import TestRecordSection from '@/components/tasks/form/TestRecordSection';
import TemplateSection from '@/components/tasks/form/TemplateSection';
import AssignmentSection from '@/components/tasks/form/AssignmentSection';
import CustomerJobSection from '@/components/tasks/form/CustomerJobSection';
import RelatedRecordsSection from '@/components/tasks/form/RelatedRecordsSection';
import OrchestrationSection from '@/components/tasks/form/OrchestrationSection';
import ExecutionSection from '@/components/tasks/form/ExecutionSection';
import CompletionEvidenceSection from '@/components/tasks/form/CompletionEvidenceSection';
import ApprovalEscalationSection from '@/components/tasks/form/ApprovalEscalationSection';
import SuggestTaskSetupPanel from '@/components/tasks/SuggestTaskSetupPanel';

export default function TaskFormDialog({ open, onOpenChange, initialData, onSave, editMode = 'full', presetCustomer, presetJob }) {
  const [data, setData] = useState(initialData || {});
  const [saving, setSaving] = useState(false);
  const [expandedSection, setExpandedSection] = useState('template');
  const [templateDefaults, setTemplateDefaults] = useState(null);
  const { role } = useCurrentRole();

  const isAuthorized = role === 'admin' || role === 'owner' || role === 'director_of_operations' || role === 'operations_manager';
  const canCreateTestRecord = role === 'admin' || role === 'owner';

  useEffect(() => {
    if (open) {
      const initial = { ...(initialData || {}) };
      if (presetCustomer && !initial.related_customer) initial.related_customer = presetCustomer;
      if (presetJob && !initial.related_job) initial.related_job = presetJob;
      setData(initial);
      // Parse template defaults snapshot for existing tasks
      if (initial.template_defaults_snapshot) {
        try { setTemplateDefaults(JSON.parse(initial.template_defaults_snapshot)); } catch { setTemplateDefaults(null); }
      } else {
        setTemplateDefaults(null);
      }
      setExpandedSection(initial.starts_at ? 'scheduling' : (editMode === 'limited' ? 'notes' : 'template'));
    }
  }, [initialData, open, editMode, presetCustomer, presetJob]);

  const isDirty = useMemo(
    () => JSON.stringify(data) !== JSON.stringify(initialData || {}),
    [data, initialData]
  );
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(
    isDirty, () => onOpenChange(false)
  );

  const updateField = (key, value) => setData(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!data.title) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);
    const payload = { ...data };
    if (!payload.task_id) payload.task_id = generateTaskId();
    if (!payload.status) payload.status = 'New';
    if (!payload.priority) payload.priority = 'Medium';
    if (!payload.task_type) payload.task_type = 'Operational';
    if (!payload.escalation_level) payload.escalation_level = 0;
    if (payload.requires_approval && !payload.approval_status) payload.approval_status = 'Pending';

    // Test Record validation
    if (data.is_test_record) {
      if (!canCreateTestRecord) {
        toast.error('Only Owner/Admin roles can create test records');
        return;
      }
      if (!data.test_purpose || String(data.test_purpose).trim().length < 5) {
        toast.error('Test Purpose is required (minimum 5 characters)');
        return;
      }
      payload.data_classification = 'test';
      payload.is_test_data = true;
    }

    // Record template overrides if template is selected and authorized manager changed controlled fields
    if (templateDefaults && data.template_override_reason) {
      const overrides = [];
      const controlledFields = ['work_category', 'priority', 'interruptibility', 'focus_lock_eligible', 'requires_immediate_acknowledgment'];
      for (const f of controlledFields) {
        if (templateDefaults[f] !== undefined && data[f] !== templateDefaults[f]) {
          overrides.push({ field: f, template_value: templateDefaults[f], override_value: data[f], override_reason: data.template_override_reason, timestamp: new Date().toISOString() });
        }
      }
      if (overrides.length > 0) {
        const existingHistory = data.template_override_history ? JSON.parse(data.template_override_history) : [];
        payload.template_override_history = JSON.stringify([...existingHistory, ...overrides]);
      }
    }

    try {
      await onSave(payload);
      onOpenChange(false);
    } catch (err) {
      toast.error(err.message || 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  const handleApplySuggestions = (suggestions) => {
    setData(prev => ({ ...prev, ...suggestions }));
    if (suggestions.work_category || suggestions.priority || suggestions.execution_mode) {
      setExpandedSection('orchestration');
    }
  };

  const handleClearTemplate = () => setTemplateDefaults(null);

  // Capture template defaults when template is loaded
  const handleTemplateLoaded = (defaults) => {
    setTemplateDefaults(defaults);
  };

  const sections = editMode === 'limited'
    ? [
        { id: 'source', label: 'Source & Links', component: <SourceLinksSection data={data} updateField={updateField} /> },
        { id: 'notes', label: 'Notes', component: <NotesSection data={data} updateField={updateField} /> },
      ]
    : [
        { id: 'test_record', label: 'Test Record', component: <TestRecordSection data={data} updateField={updateField} canCreateTestRecord={canCreateTestRecord} />, authorizedOnly: canCreateTestRecord },
        { id: 'suggest', label: 'AI Suggest Task Setup', component: <SuggestTaskSetupPanel onApply={handleApplySuggestions} department={data.department} />, authorizedOnly: true },
        { id: 'template', label: 'Task Template', component: <TemplateSection data={data} updateField={updateField} isAuthorized={isAuthorized} onClearTemplate={handleClearTemplate} /> },
        { id: 'basic', label: 'Basic Info', component: <BasicInfoSection data={data} updateField={updateField} /> },
        { id: 'scheduling', label: 'Scheduling', component: <SchedulingSection data={data} updateField={updateField} /> },
        { id: 'assignment', label: 'Assignment', component: <AssignmentSection data={data} updateField={updateField} /> },
        { id: 'customer_job', label: 'Customer & Job', component: <CustomerJobSection data={data} updateField={updateField} /> },
        { id: 'related', label: 'Related Records', component: <RelatedRecordsSection data={data} updateField={updateField} /> },
        { id: 'orchestration', label: 'Orchestration', component: <OrchestrationSection data={data} updateField={updateField} isAuthorized={isAuthorized} templateDefaults={templateDefaults} /> },
        { id: 'execution', label: 'Execution', component: <ExecutionSection data={data} updateField={updateField} templateDefaults={templateDefaults} /> },
        { id: 'evidence', label: 'Completion Evidence', component: <CompletionEvidenceSection data={data} updateField={updateField} templateDefaults={templateDefaults} /> },
        { id: 'approval', label: 'Approval & Escalation', component: <ApprovalEscalationSection data={data} updateField={updateField} /> },
        { id: 'notes', label: 'Notes', component: <NotesSection data={data} updateField={updateField} /> },
      ];

  const visibleSections = sections.filter(s => !s.authorizedOnly || isAuthorized);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onCloseAttempt={handleCloseAttempt}>
          <DialogHeader>
            <DialogTitle>{initialData ? 'Edit Task' : 'New Task'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {visibleSections.map(section => (
              <div key={section.id} className="rounded-lg border">
                <button
                  type="button"
                  onClick={() => setExpandedSection(expandedSection === section.id ? '' : section.id)}
                  className="flex items-center justify-between w-full p-3 hover:bg-muted/50"
                >
                  <span className="text-sm font-medium">{section.label}</span>
                  {expandedSection === section.id
                    ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </button>
                {expandedSection === section.id && (
                  <div className="p-3 pt-0">{section.component}</div>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseAttempt}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !data.title}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {initialData ? 'Save Changes' : 'Create Task'}
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

// ─── Inline sub-sections (basic info, source/links, notes) ──────────────────
function BasicInfoSection({ data, updateField }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Title <span className="text-destructive">*</span></Label>
        <Input value={data.title || ''} onChange={e => updateField('title', e.target.value)} placeholder="Task title" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Description</Label>
        <Textarea value={data.description || ''} onChange={e => updateField('description', e.target.value)} placeholder="Describe the task..." rows={3} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Department</Label>
          <Select value={data.department || ''} onValueChange={v => updateField('department', v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Task Type</Label>
          <Select value={data.task_type || 'Operational'} onValueChange={v => updateField('task_type', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TASK_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Priority</Label>
          <Select value={data.priority || 'Medium'} onValueChange={v => updateField('priority', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TASK_PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Select value={data.status || 'New'} onValueChange={v => updateField('status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TASK_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Due Date</Label>
        <Input type="date" value={data.due_date || ''} onChange={e => updateField('due_date', e.target.value)} />
      </div>
    </div>
  );
}

function SourceLinksSection({ data, updateField }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Source Module</Label>
        <Select value={data.source_module || ''} onValueChange={v => updateField('source_module', v)}>
          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>{SOURCE_MODULES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Source Record ID</Label>
        <Input value={data.source_record_id || ''} onChange={e => updateField('source_record_id', e.target.value)} placeholder="e.g. ONB-0001" />
      </div>
    </div>
  );
}

function NotesSection({ data, updateField }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Notes</Label>
      <Textarea value={data.notes || ''} onChange={e => updateField('notes', e.target.value)} rows={4} />
    </div>
  );
}

function isoToLocalInput(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const off = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - off).toISOString().slice(0, 16);
  } catch { return ''; }
}

function localInputToIso(localStr) {
  if (!localStr) return '';
  try { return new Date(localStr).toISOString(); } catch { return ''; }
}

function SchedulingSection({ data, updateField }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_all_day"
          checked={data.is_all_day || false}
          onChange={e => updateField('is_all_day', e.target.checked)}
          className="w-4 h-4 rounded border-input"
        />
        <Label htmlFor="is_all_day" className="text-xs cursor-pointer">All Day</Label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Start</Label>
          <Input
            type="datetime-local"
            value={isoToLocalInput(data.starts_at)}
            onChange={e => updateField('starts_at', localInputToIso(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">End</Label>
          <Input
            type="datetime-local"
            value={isoToLocalInput(data.ends_at)}
            disabled={data.is_all_day}
            onChange={e => updateField('ends_at', localInputToIso(e.target.value))}
          />
        </div>
      </div>
      {data.schedule_timezone && (
        <p className="text-[10px] text-muted-foreground">Timezone: {data.schedule_timezone}</p>
      )}
    </div>
  );
}