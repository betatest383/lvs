import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Clock, Filter, Zap, Database, Tag, Layers, FileText, Wrench, HelpCircle } from 'lucide-react';
import { MODULE_EVENTS, MODULES_BY_CATEGORY, ALL_EVENTS } from '@/lib/moduleEventRegistry';
import ActionBuilder from './ActionBuilder';
import RepairTemplatePicker from './RepairTemplatePicker';
import InspectionQuestionPicker from '@/components/rulesengine/InspectionQuestionPicker';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

const QUESTION_BASED_EVENTS = new Set([
  'inspection.question_answered',
  'inspection.question_changed',
  'inspection.question_failed',
  'inspection.question_passed',
]);

const PRIORITY_PRESETS = [
  { label: 'Safety', value: 100 },
  { label: 'Code', value: 90 },
  { label: 'Compliance', value: 80 },
  { label: 'Recommendation', value: 70 },
  { label: 'Estimate', value: 60 },
  { label: 'Scope', value: 50 },
];

const FIELD_OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'in_list', label: 'is in list' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'has any value' },
  { value: 'greater_than', label: 'greater than' },
  { value: 'less_than', label: 'less than' },
];

const AGE_OPERATORS = [
  { value: 'greater_than', label: 'greater than' },
  { value: 'less_than', label: 'less than' },
  { value: 'equals', label: 'equals' },
];

const AGE_UNITS = [
  { value: 'seconds', label: 'Seconds' },
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
];

const SEVERITY_OPTIONS = ['info', 'minor', 'moderate', 'major', 'critical'];
const RULE_TYPES = [
  { value: 'automation', label: 'Automation Rule' },
  { value: 'finding', label: 'Finding' },
  { value: 'repair', label: 'Repair Recommendation' },
  { value: 'estimate_item', label: 'Estimate Line Item' },
  { value: 'invoice_item', label: 'Invoice Item' },
  { value: 'material', label: 'Material Requirement' },
  { value: 'report_narrative', label: 'Report Narrative' },
  { value: 'visibility', label: 'Question Visibility' },
];

const BLANK_CONDITION = { field: '', operator: 'equals', value: '', condition_type: 'field' };
const BLANK_ACTIONS = [];

function ConditionRow({ condition, index, eventFields, onChange, onRemove, questionType }) {
  const isAgeCondition = condition.condition_type === 'event_age';
  const needsValue = !['is_empty', 'is_not_empty'].includes(condition.operator);
  const selectedField = eventFields.find(f => f.key === condition.field);
  const isNumericField = selectedField?.type === 'number';
  const isBooleanField = selectedField?.type === 'boolean';
  const isAnswerValueField = condition.field === 'answer_value';

  const valueOptions = useMemo(() => {
    if (isBooleanField) return ['true', 'false'];
    if (isAnswerValueField && questionType === 'yes_no') return ['Yes', 'No'];
    return [];
  }, [isBooleanField, isAnswerValueField, questionType]);

  return (
    <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg border">
      {index > 0 && (
        <span className="text-xs font-bold text-muted-foreground mt-2.5 w-6 shrink-0">AND</span>
      )}

      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          {/* Condition type toggle */}
          <div className="w-32 shrink-0">
            <Select
              value={condition.condition_type || 'field'}
              onValueChange={v => onChange({ ...condition, condition_type: v, field: '', value: '', operator: v === 'event_age' ? 'greater_than' : 'equals' })}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="field"><span className="flex items-center gap-1"><Filter className="w-3 h-3" /> Field</span></SelectItem>
                <SelectItem value="event_age"><span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Event Age</span></SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isAgeCondition ? (
            <>
              <div className="w-36 shrink-0">
                <Select value={condition.operator} onValueChange={v => onChange({ ...condition, operator: v })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AGE_OPERATORS.map(op => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-20 shrink-0">
                <Input
                  type="number"
                  className="h-9 text-xs"
                  placeholder="15"
                  value={condition.value || ''}
                  onChange={e => onChange({ ...condition, value: e.target.value })}
                />
              </div>
              <div className="w-28 shrink-0">
                <Select value={condition.age_unit || 'minutes'} onValueChange={v => onChange({ ...condition, age_unit: v })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AGE_UNITS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <>
              {/* Field picker */}
              <div className="flex-1 min-w-0">
                <Select value={condition.field} onValueChange={v => onChange({ ...condition, field: v, value: '' })}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select field..." />
                  </SelectTrigger>
                  <SelectContent>
                    {eventFields.map(f => (
                      <SelectItem key={f.key} value={f.key}>
                        <span className="truncate text-xs">{f.label} <span className="text-muted-foreground">({f.type})</span></span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Operator */}
              <div className="w-36 shrink-0">
                <Select value={condition.operator} onValueChange={v => onChange({ ...condition, operator: v })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELD_OPERATORS.map(op => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Value */}
              {needsValue && (
                <div className="w-32 shrink-0">
                  {valueOptions.length > 0 ? (
                    <Select value={condition.value} onValueChange={v => onChange({ ...condition, value: v })}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Value..." /></SelectTrigger>
                      <SelectContent>
                        {valueOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      className="h-9 text-xs"
                      type={isNumericField ? 'number' : 'text'}
                      placeholder="Value..."
                      value={condition.value || ''}
                      onChange={e => onChange({ ...condition, value: e.target.value })}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <button type="button" onClick={onRemove} className="mt-1.5 text-muted-foreground hover:text-destructive shrink-0">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function EventRuleDialog({ open, onOpenChange, editing, repairs, onSave }) {
  const [conditions, setConditions] = useState([{ ...BLANK_CONDITION }]);
  const [actions, setActions] = useState([...BLANK_ACTIONS]);
  const [form, setForm] = useState({
    rule_name: '', rule_type: 'automation', source_module: '', source_module_name: '',
    trigger_event: '', trigger_event_name: '', event_fields_json: '',
    category: '', output_finding_type: '', output_severity: 'critical',
    output_repair_id: '', repair_template_id: '', output_narrative: '', output_estimate_price: '',
    priority: 0, is_active: true, description: '', rule_sets: [], tags: [],
    inspection_question_id: '', inspection_question_text: '', inspection_form_id: '', inspection_section_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [ruleSets, setRuleSets] = useState([]);
  const [repairTemplates, setRepairTemplates] = useState([]);
  const [tagInput, setTagInput] = useState('');

  // Selected template for inherited values preview
  const selectedTemplate = useMemo(
    () => repairTemplates.find(t => t.id === form.repair_template_id),
    [repairTemplates, form.repair_template_id]
  );

  // Auto-populate rule fields from the selected template and sync all actions
  const handleTemplateSelect = (templateId, tmpl) => {
    setForm(f => ({
      ...f,
      repair_template_id: templateId,
      output_finding_type: tmpl?.deficiency_type || '',
      output_severity: tmpl?.severity || 'moderate',
      output_narrative: tmpl?.customer_facing_recommendation || tmpl?.customer_summary || '',
      category: tmpl?.inspection_category || tmpl?.deficiency_type || '',
      priority: tmpl?.priority === 'critical' ? 100 : tmpl?.priority === 'high' ? 90 : tmpl?.priority === 'medium' ? 70 : 50,
    }));
    setIsDirty(true);
    // Bidirectional sync: update all actions' repair_template_id field mappings
    updateActions(prev => prev.map(action => ({
      ...action,
      field_mappings: (action.field_mappings || []).map(m =>
        m.field === 'repair_template_id' ? { ...m, value: templateId } : m
      ),
    })));
  };

  const selectedModule = useMemo(() => MODULE_EVENTS.find(m => m.moduleKey === form.source_module), [form.source_module]);
  const selectedEvent = useMemo(() => ALL_EVENTS.find(e => e.eventKey === form.trigger_event), [form.trigger_event]);
  const eventFields = selectedEvent?.fields || [];
  const isQuestionBased = useMemo(() => QUESTION_BASED_EVENTS.has(form.trigger_event), [form.trigger_event]);

  const ruleSummary = useMemo(() => {
    if (!form.trigger_event) return '';
    const evtName = form.trigger_event_name || form.trigger_event;
    let when = `When ${evtName}`;
    if (isQuestionBased && form.inspection_question_text) {
      const answerCond = conditions.find(c => c.field === 'answer_value');
      when += ` — "${form.inspection_question_text}"`;
      if (answerCond?.value) when += ` is answered ${answerCond.value}`;
    }
    const actionCount = Array.isArray(actions) ? actions.length : 0;
    const then = actionCount > 0 ? `then execute ${actionCount} action${actionCount !== 1 ? 's' : ''}` : 'then (no actions configured)';
    return `${when}, ${then}.`;
  }, [form.trigger_event, form.trigger_event_name, form.inspection_question_text, isQuestionBased, conditions, actions]);

  useEffect(() => {
    if (!open) return;
    base44.entities.RuleSet.filter({ is_active: true }, '-sort_order', 100).then(setRuleSets).catch(() => {});
    if (editing) {
      const { conditions_json, event_fields_json, ...rest } = editing;
      setForm({
        rule_name: rest.rule_name || '',
        rule_type: rest.rule_type || 'automation',
        source_module: rest.source_module || '',
        source_module_name: rest.source_module_name || '',
        trigger_event: rest.trigger_event || '',
        trigger_event_name: rest.trigger_event_name || '',
        event_fields_json: event_fields_json || '',
        category: rest.category || '',
        output_finding_type: rest.output_finding_type || '',
        output_severity: rest.output_severity || 'critical',
        output_repair_id: rest.output_repair_id || '',
        repair_template_id: rest.repair_template_id || '',
        output_narrative: rest.output_narrative || '',
        output_estimate_price: rest.output_estimate_price || '',
        priority: rest.priority || 0,
        is_active: rest.is_active !== false,
        description: rest.description || '',
        rule_sets: rest.rule_sets || [],
        tags: rest.tags || [],
        inspection_question_id: rest.inspection_question_id || '',
        inspection_question_text: rest.inspection_question_text || '',
        inspection_form_id: rest.inspection_form_id || '',
        inspection_section_id: rest.inspection_section_id || '',
        id: rest.id,
      });
      try {
        const parsed = JSON.parse(conditions_json || '[]');
        setConditions(Array.isArray(parsed) && parsed.length > 0 ? parsed : [{ ...BLANK_CONDITION }]);
      } catch {
        setConditions([{ ...BLANK_CONDITION }]);
      }
      try {
        const parsedActions = JSON.parse(editing.actions_json || '[]');
        setActions(Array.isArray(parsedActions) ? parsedActions : []);
      } catch {
        setActions([]);
      }
      if (rest.inspection_question_id) {
        base44.entities.InspectionQuestion.get(rest.inspection_question_id)
          .then(q => set('selected_question_type', q?.question_type || ''))
          .catch(() => {});
      }
    } else {
      setForm({ rule_name: '', rule_type: 'automation', source_module: '', source_module_name: '', trigger_event: '', trigger_event_name: '', event_fields_json: '', category: '', output_finding_type: '', output_severity: 'critical', output_repair_id: '', repair_template_id: '', output_narrative: '', output_estimate_price: '', priority: 0, is_active: true, description: '', rule_sets: [], tags: [], inspection_question_id: '', inspection_question_text: '', inspection_form_id: '', inspection_section_id: '' });
      setConditions([{ ...BLANK_CONDITION }]);
      setActions([...BLANK_ACTIONS]);
    }
  }, [editing, open]);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open, editing]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onOpenChange(false));

  const set = (key, val) => { setForm(f => ({ ...f, [key]: val })); setIsDirty(true); };
  const updateConditions = (fn) => { setConditions(fn); setIsDirty(true); };
  const updateActions = (fn) => { setActions(fn); setIsDirty(true); };

  const handleModuleChange = (moduleKey) => {
    setForm(f => ({ ...f, source_module: moduleKey, source_module_name: MODULE_EVENTS.find(m => m.moduleKey === moduleKey)?.module || '', trigger_event: '', trigger_event_name: '', event_fields_json: '' }));
    updateConditions([{ ...BLANK_CONDITION }]);
    setIsDirty(true);
  };

  const handleEventChange = (eventKey) => {
    const evt = ALL_EVENTS.find(e => e.eventKey === eventKey);
    const isQBased = QUESTION_BASED_EVENTS.has(eventKey);
    setForm(f => ({
      ...f,
      trigger_event: eventKey,
      trigger_event_name: evt?.event || '',
      event_fields_json: JSON.stringify(evt?.fields || []),
      ...(isQBased ? {} : { inspection_question_id: '', inspection_question_text: '', inspection_form_id: '', inspection_section_id: '' }),
    }));
    updateConditions([{ ...BLANK_CONDITION }]);
    setIsDirty(true);
  };

  const handleQuestionChange = (qData) => {
    if (!qData) {
      setForm(f => ({ ...f, inspection_question_id: '', inspection_question_text: '', inspection_form_id: '', inspection_section_id: '', selected_question_type: '' }));
    } else {
      setForm(f => ({
        ...f,
        inspection_question_id: qData.inspection_question_id,
        inspection_question_text: qData.inspection_question_text,
        inspection_form_id: qData.inspection_form_id,
        inspection_section_id: qData.inspection_section_id,
        selected_question_type: qData.question_type || '',
      }));
    }
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!form.rule_name?.trim()) { alert('Please enter a Rule Name.'); return; }
    if (!form.source_module) { alert('Please select a Source Module.'); return; }
    if (!form.trigger_event) { alert('Please select a Trigger Event.'); return; }
    if (isQuestionBased && !form.inspection_question_id) {
      alert('An Inspection Question is required for question-based trigger events.');
      return;
    }
    setSaving(true);
    const validConditions = conditions.filter(c => c.field || c.condition_type === 'event_age');
    const { selected_question_type, ...persistable } = form;
    const payload = { ...persistable, conditions_json: JSON.stringify(validConditions), actions_json: JSON.stringify(actions), output_estimate_price: form.output_estimate_price !== '' ? Number(form.output_estimate_price) : null };
    try {
      if (payload.id) {
        await base44.entities.LogicRule.update(payload.id, payload);
      } else {
        await base44.entities.LogicRule.create(payload);
      }
      onSave(payload);
      onOpenChange(false);
    } catch (err) {
      alert('Save error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleCloseAttempt}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Rule' : 'Add New Rule'}</DialogTitle>
        </DialogHeader>

        {ruleSummary && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 border">
            {ruleSummary}
          </div>
        )}

        <div className="overflow-y-auto flex-1 space-y-5 pr-1">
          {/* Basic Information */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold border-b pb-1">
              <FileText className="w-4 h-4" /> Basic Information
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Rule Name <span className="text-destructive">*</span></Label>
                <Input value={form.rule_name} onChange={e => set('rule_name', e.target.value)} placeholder="e.g. Failed Damper → Repair Recommendation" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rule Type</Label>
                <Select value={form.rule_type} onValueChange={v => set('rule_type', v)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RULE_TYPES.map(rt => <SelectItem key={rt.value} value={rt.value}>{rt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea className="text-xs" rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="What does this rule do?" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={v => set('is_active', v)} />
              <Label className="text-xs">Active</Label>
            </div>
          </div>

          {/* Trigger */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold border-b pb-1">
              <Zap className="w-4 h-4" /> Trigger
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Source Module <span className="text-destructive">*</span></Label>
                <Select value={form.source_module} onValueChange={handleModuleChange}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select module..." /></SelectTrigger>
                  <SelectContent>
                    {MODULES_BY_CATEGORY.map(cat => (
                      <div key={cat.key}>
                        {cat.modules.filter(m => !m.reserved).map(mod => (
                          <SelectItem key={mod.moduleKey} value={mod.moduleKey}>{mod.module}</SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Trigger Event <span className="text-destructive">*</span></Label>
                <Select value={form.trigger_event} onValueChange={handleEventChange} disabled={!form.source_module}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select event..." /></SelectTrigger>
                  <SelectContent>
                    {selectedModule?.events.map(evt => (
                      <SelectItem key={evt.eventKey} value={evt.eventKey}>{evt.event}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Inspection Question (conditional) */}
          {isQuestionBased && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold border-b pb-1">
                <HelpCircle className="w-4 h-4" /> Inspection Question
              </div>
              <InspectionQuestionPicker
                value={{ inspection_question_id: form.inspection_question_id }}
                onChange={handleQuestionChange}
              />
            </div>
          )}

          {/* Conditions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b pb-1">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Filter className="w-4 h-4" /> Conditions
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs" type="button" onClick={() => updateConditions([...conditions, { ...BLANK_CONDITION }])}>
                <Plus className="w-3 h-3" /> Add Condition
              </Button>
            </div>
            {conditions.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No conditions configured. The rule will fire on every event occurrence.</p>
            ) : (
              <div className="space-y-2">
                {conditions.map((cond, i) => (
                  <ConditionRow
                    key={i}
                    condition={cond}
                    index={i}
                    eventFields={eventFields}
                    onChange={updated => updateConditions(conditions.map((c, idx) => idx === i ? updated : c))}
                    onRemove={() => updateConditions(conditions.filter((_, idx) => idx !== i))}
                    questionType={form.selected_question_type}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold border-b pb-1">
              <Zap className="w-4 h-4" /> Actions
            </div>
            <ActionBuilder
              eventFields={eventFields}
              actions={actions}
              onChange={updateActions}
              sourceModuleKey={form.source_module}
              repairTemplateId={form.repair_template_id}
              onRepairTemplateSync={handleTemplateSelect}
            />
          </div>

          {/* Output Configuration */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold border-b pb-1">
              <Wrench className="w-4 h-4" /> Output Configuration
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Finding Type</Label>
                <Input value={form.output_finding_type} onChange={e => set('output_finding_type', e.target.value)} placeholder="e.g. Cracked Crown" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Severity</Label>
                <Select value={form.output_severity} onValueChange={v => set('output_severity', v)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITY_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Repair Template</Label>
              <RepairTemplatePicker
                value={form.repair_template_id}
                onChange={handleTemplateSelect}
                onTemplatesLoaded={setRepairTemplates}
                placeholder="Select repair template..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Customer-Facing Narrative</Label>
              <Textarea className="text-xs" rows={2} value={form.output_narrative} onChange={e => set('output_narrative', e.target.value)} placeholder="Recommendation text shown to customer" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Estimate Price ($)</Label>
                <Input type="number" value={form.output_estimate_price || ''} onChange={e => set('output_estimate_price', e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Input value={form.category} onChange={e => set('category', e.target.value)} placeholder="e.g. Chimney Crown" />
              </div>
            </div>
          </div>

          {/* Organization */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold border-b pb-1">
              <Layers className="w-4 h-4" /> Organization
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Priority</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" className="h-9 text-xs w-20" value={form.priority} onChange={e => set('priority', Number(e.target.value))} />
                  <div className="flex flex-wrap gap-1">
                    {PRIORITY_PRESETS.map(p => (
                      <button key={p.value} type="button" onClick={() => set('priority', p.value)} className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent/10 text-muted-foreground">{p.label}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tags</Label>
                <Input className="h-9 text-xs" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && tagInput.trim()) { e.preventDefault(); set('tags', [...(form.tags || []), tagInput.trim()]); setTagInput(''); } }} placeholder="Type and press Enter..." />
                {form.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {form.tags.map((t, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] gap-0.5">
                        {t}
                        <button type="button" onClick={() => set('tags', form.tags.filter((_, idx) => idx !== i))} className="ml-0.5 hover:text-destructive">×</button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Rule Sets</Label>
              <div className="flex flex-wrap gap-1.5">
                {ruleSets.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No rule sets available</span>
                ) : ruleSets.map(rs => {
                  const sel = (form.rule_sets || []).includes(rs.id);
                  return (
                    <button key={rs.id} type="button" onClick={() => set('rule_sets', sel ? (form.rule_sets || []).filter(id => id !== rs.id) : [...(form.rule_sets || []), rs.id])}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${sel ? 'bg-accent text-accent-foreground border-accent' : 'bg-background border-border hover:bg-muted/50'}`}>
                      {rs.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-3 border-t">
          <Button variant="outline" type="button" onClick={handleCloseAttempt}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Update Rule' : 'Create Rule'}
          </Button>
        </div>
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