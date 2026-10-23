import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, ChevronDown, ChevronRight, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  WORK_CATEGORIES, INTERRUPTIBILITY_OPTIONS, ASSIGNMENT_MODES, CLAIM_MODES,
  EXECUTION_MODES, TRIGGER_TYPES, RETURN_BEHAVIORS, TEMPLATE_DEPARTMENTS,
} from '@/lib/taskTemplateConstants';

const EMPTY = {
  template_name: '', template_key: '', description: '',
  department_name_snapshot: 'Warehouse', category: '', work_category: 'routine',
  default_priority: 'Medium', business_impact: 'none', urgency: 'none',
  priority_reason_template: '', interruptibility: 'freely_interruptible',
  focus_lock_eligible: false, resume_required: false,
  requires_immediate_acknowledgment: false, acknowledgment_deadline_minutes: null,
  assignment_mode: 'specific_employee', claim_mode: 'assigned',
  required_employee_count: 1, required_capabilities: [],
  default_due_offset_minutes: null, must_start_offset_minutes: null,
  estimated_duration_minutes: null, overdue_escalation_minutes: null,
  recurrence_rule: '', service_level_target_minutes: null,
  execution_mode: 'simple_action', execution_route: '', linked_module: '',
  linked_wizard_key: '', instructions: '', completion_conditions_json: '',
  minimum_photo_count: 0, requires_notes: false, requires_signature: false,
  requires_manager_verification: false, auto_complete_when_conditions_met: false,
  requires_approval: false, self_approval_prohibited: true,
  return_for_correction_behavior: 'reopen', escalation_conditions_json: '',
  trigger_type: 'manual', trigger_event_key: '', source_entity_type: '',
  trigger_conditions_json: '', deduplication_rule: '', cooldown_minutes: null,
  ai_classification_enabled: false, ai_guidance_enabled: false,
  ai_may_suggest_assignment: false, ai_may_suggest_priority: false,
  ai_may_suggest_template: false,
};

export default function TemplateForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [expanded, setExpanded] = useState('identity');

  useEffect(() => {
    if (!id) return;
    base44.functions.invoke('manageTaskTemplate', { action: 'get', templateId: id })
      .then(res => {
        if (res.data?.success) setData({ ...EMPTY, ...res.data.template });
      })
      .finally(() => setLoading(false));
  }, [id]);

  const update = (key, val) => setData(prev => ({ ...prev, [key]: val }));
  const toggle = (key) => setData(prev => ({ ...prev, [key]: !prev[key] }));

  const handleSave = async (status) => {
    if (!data.template_name) { toast.error('Template name is required'); return; }
    setSaving(true);
    try {
      const payload = { ...data };
      if (status) payload.status = status;
      const action = id ? 'update' : 'create';
      const res = await base44.functions.invoke('manageTaskTemplate', {
        action, templateId: id, templateData: payload,
      });
      if (res.data?.success) {
        toast.success(id ? 'Template updated' : 'Template created');
        navigate(`/templates/detail/${res.data.template.id}`);
      } else {
        toast.error(res.data?.error || 'Failed to save');
      }
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

  const sections = [
    { id: 'identity', label: 'Identity & Classification', fields: [
      ['template_name', 'Template Name', 'text', true],
      ['template_key', 'Template Key (auto)', 'text', false],
      ['description', 'Description', 'textarea', false],
      ['department_name_snapshot', 'Department', 'select', false],
      ['category', 'Category', 'text', false],
      ['work_category', 'Work Category', 'select_work', false],
      ['default_priority', 'Default Priority', 'select_priority', false],
      ['business_impact', 'Business Impact', 'select_impact', false],
      ['urgency', 'Urgency', 'select_urgency', false],
    ]},
    { id: 'orchestration', label: 'Orchestration & Interruptibility', fields: [
      ['interruptibility', 'Interruptibility', 'select_interrupt', false],
      ['focus_lock_eligible', 'Focus Lock Eligible', 'boolean', false],
      ['resume_required', 'Resume Required', 'boolean', false],
      ['requires_immediate_acknowledgment', 'Requires Immediate Acknowledgment', 'boolean', false],
      ['acknowledgment_deadline_minutes', 'Acknowledgment Deadline (Minutes)', 'number', false],
      ['priority_reason_template', 'Priority Reason Template', 'textarea', false],
    ]},
    { id: 'assignment', label: 'Assignment Rules', fields: [
      ['assignment_mode', 'Assignment Mode', 'select_assign', false],
      ['claim_mode', 'Claim Mode', 'select_claim', false],
      ['required_employee_count', 'Required Employee Count', 'number', false],
    ]},
    { id: 'timing', label: 'Timing Rules', fields: [
      ['default_due_offset_minutes', 'Default Due Offset (Minutes)', 'number', false],
      ['must_start_offset_minutes', 'Must Start Offset (Minutes)', 'number', false],
      ['estimated_duration_minutes', 'Estimated Duration (Minutes)', 'number', false],
      ['overdue_escalation_minutes', 'Overdue Escalation (Minutes)', 'number', false],
      ['cooldown_minutes', 'Cooldown (Minutes)', 'number', false],
      ['recurrence_rule', 'Recurrence Rule', 'text', false],
      ['service_level_target_minutes', 'SLA Target (Minutes)', 'number', false],
    ]},
    { id: 'execution', label: 'Execution Method', fields: [
      ['execution_mode', 'Execution Mode', 'select_exec', false],
      ['execution_route', 'Execution Route', 'text', false],
      ['linked_module', 'Linked Module', 'text', false],
      ['linked_wizard_key', 'Linked Wizard Key', 'text', false],
      ['instructions', 'Instructions', 'textarea', false],
      ['completion_conditions_json', 'Completion Conditions (JSON)', 'textarea', false],
    ]},
    { id: 'evidence', label: 'Evidence & Completion', fields: [
      ['minimum_photo_count', 'Minimum Photo Count', 'number', false],
      ['requires_notes', 'Requires Notes', 'boolean', false],
      ['requires_signature', 'Requires Signature', 'boolean', false],
      ['requires_manager_verification', 'Requires Manager Verification', 'boolean', false],
      ['auto_complete_when_conditions_met', 'Auto Complete When Conditions Met', 'boolean', false],
    ]},
    { id: 'approval', label: 'Approval & Escalation', fields: [
      ['requires_approval', 'Requires Approval', 'boolean', false],
      ['self_approval_prohibited', 'Self Approval Prohibited', 'boolean', false],
      ['return_for_correction_behavior', 'Return for Correction Behavior', 'select_return', false],
      ['escalation_conditions_json', 'Escalation Conditions (JSON)', 'textarea', false],
    ]},
    { id: 'trigger', label: 'Trigger Configuration', fields: [
      ['trigger_type', 'Trigger Type', 'select_trigger', false],
      ['trigger_event_key', 'Trigger Event Key', 'text', false],
      ['source_entity_type', 'Source Entity Type', 'text', false],
      ['deduplication_rule', 'Deduplication Rule', 'text', false],
    ]},
    { id: 'ai', label: 'AI Assistance (Advisory Only)', fields: [
      ['ai_classification_enabled', 'AI Classification Enabled', 'boolean', false],
      ['ai_guidance_enabled', 'AI Guidance Enabled', 'boolean', false],
      ['ai_may_suggest_assignment', 'AI May Suggest Assignment', 'boolean', false],
      ['ai_may_suggest_priority', 'AI May Suggest Priority', 'boolean', false],
      ['ai_may_suggest_template', 'AI May Suggest Template', 'boolean', false],
    ]},
  ];

  const renderField = (key, label, type, required) => {
    const value = data[key];
    switch (type) {
      case 'text': return <Input value={value || ''} onChange={e => update(key, e.target.value)} placeholder={label} />;
      case 'textarea': return <Textarea value={value || ''} onChange={e => update(key, e.target.value)} rows={2} placeholder={label} />;
      case 'number': return <Input type="number" value={value ?? ''} onChange={e => update(key, e.target.value ? Number(e.target.value) : null)} />;
      case 'boolean': return <div className="flex items-center gap-2"><Switch checked={value || false} onCheckedChange={() => toggle(key)} /><span className="text-sm text-muted-foreground">{value ? 'Yes' : 'No'}</span></div>;
      case 'select': return <Select value={value || ''} onValueChange={v => update(key, v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TEMPLATE_DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select>;
      case 'select_work': return <Select value={value || ''} onValueChange={v => update(key, v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{WORK_CATEGORIES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>;
      case 'select_priority': return <Select value={value || ''} onValueChange={v => update(key, v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['Critical', 'High', 'Medium', 'Low'].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select>;
      case 'select_impact': return <Select value={value || ''} onValueChange={v => update(key, v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['none', 'low', 'medium', 'high', 'severe'].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select>;
      case 'select_urgency': return <Select value={value || ''} onValueChange={v => update(key, v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['none', 'low', 'medium', 'high', 'immediate'].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select>;
      case 'select_interrupt': return <Select value={value || ''} onValueChange={v => update(key, v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{INTERRUPTIBILITY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>;
      case 'select_assign': return <Select value={value || ''} onValueChange={v => update(key, v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ASSIGNMENT_MODES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>;
      case 'select_claim': return <Select value={value || ''} onValueChange={v => update(key, v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CLAIM_MODES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>;
      case 'select_exec': return <Select value={value || ''} onValueChange={v => update(key, v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EXECUTION_MODES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>;
      case 'select_return': return <Select value={value || ''} onValueChange={v => update(key, v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RETURN_BEHAVIORS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>;
      case 'select_trigger': return <Select value={value || ''} onValueChange={v => update(key, v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TRIGGER_TYPES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>;
      default: return null;
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{id ? 'Edit Template' : 'New Task Template'}</h1>
      </div>

      {sections.map(section => (
        <Card key={section.id}>
          <CardContent className="p-0">
            <button type="button" onClick={() => setExpanded(expanded === section.id ? '' : section.id)}
              className="flex items-center justify-between w-full p-3 hover:bg-muted/50">
              <span className="text-sm font-semibold">{section.label}</span>
              {expanded === section.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {expanded === section.id && (
              <div className="p-3 pt-0 space-y-3">
                {section.fields.map(([key, label, type, required]) => (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-xs">{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>
                    {renderField(key, label, type, required)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={() => navigate('/templates/registry')}>Cancel</Button>
        <Button onClick={() => handleSave()} disabled={saving || !data.template_name}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
          {id ? 'Save Changes' : 'Create as Draft'}
        </Button>
      </div>
    </div>
  );
}