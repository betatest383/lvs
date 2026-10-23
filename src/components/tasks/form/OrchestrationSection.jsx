import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  WORK_CATEGORIES, WORK_CATEGORY_LABELS,
  BUSINESS_IMPACT_LEVELS, URGENCY_LEVELS,
  INTERRUPTIBILITY_VALUES, INTERRUPTIBILITY_LABELS,
} from '@/lib/orchestrationConstants';

// Fields that require manager authorization to override
const CONTROLLED_FIELDS = [
  'work_category', 'priority', 'interruptibility',
  'focus_lock_eligible', 'requires_immediate_acknowledgment',
];

export default function OrchestrationSection({ data, updateField, isAuthorized, templateDefaults }) {
  const isTemplateDerived = (field) => templateDefaults && templateDefaults[field] !== undefined;
  const showOverrideReason = isAuthorized && CONTROLLED_FIELDS.some(f =>
    templateDefaults && templateDefaults[f] !== undefined && data[f] !== templateDefaults[f]
  );

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs">Work Category</Label>
          {isTemplateDerived('work_category') && <Badge variant="secondary" className="text-xs">Template</Badge>}
        </div>
        <Select value={data.work_category || 'routine'} onValueChange={v => updateField('work_category', v)} disabled={!isAuthorized && isTemplateDerived('work_category')}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {WORK_CATEGORIES.map(c => <SelectItem key={c} value={c}>{WORK_CATEGORY_LABELS[c]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Business Impact</Label>
          <Select value={data.business_impact || 'none'} onValueChange={v => updateField('business_impact', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {BUSINESS_IMPACT_LEVELS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Urgency</Label>
          <Select value={data.urgency || 'none'} onValueChange={v => updateField('urgency', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {URGENCY_LEVELS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Priority Reason</Label>
        <Textarea value={data.priority_reason || ''} onChange={e => updateField('priority_reason', e.target.value)} placeholder="Why this priority?" rows={2} />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs">Interruptibility</Label>
          {isTemplateDerived('interruptibility') && <Badge variant="secondary" className="text-xs">Template</Badge>}
        </div>
        <Select value={data.interruptibility || 'freely_interruptible'} onValueChange={v => updateField('interruptibility', v)} disabled={!isAuthorized && isTemplateDerived('interruptibility')}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {INTERRUPTIBILITY_VALUES.map(i => <SelectItem key={i} value={i}>{INTERRUPTIBILITY_LABELS[i]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Must Start By</Label>
          <Input type="datetime-local" value={data.must_start_by ? data.must_start_by.slice(0, 16) : ''} onChange={e => updateField('must_start_by', e.target.value ? new Date(e.target.value).toISOString() : '')} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Due At</Label>
          <Input type="datetime-local" value={data.due_at ? data.due_at.slice(0, 16) : ''} onChange={e => updateField('due_at', e.target.value ? new Date(e.target.value).toISOString() : '')} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Estimated Duration (min)</Label>
          <Input type="number" value={data.estimated_duration_minutes || ''} onChange={e => updateField('estimated_duration_minutes', e.target.value ? Number(e.target.value) : null)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Ack Deadline (min)</Label>
          <Input type="number" value={data.acknowledgment_deadline_minutes || ''} onChange={e => updateField('acknowledgment_deadline_minutes', e.target.value ? Number(e.target.value) : null)} />
        </div>
      </div>

      <div className="space-y-2">
        <ToggleRow label="Immediate Acknowledgment Required" checked={data.requires_immediate_acknowledgment || false} onChange={v => updateField('requires_immediate_acknowledgment', v)} disabled={!isAuthorized && isTemplateDerived('requires_immediate_acknowledgment')} templateDerived={isTemplateDerived('requires_immediate_acknowledgment')} />
        <ToggleRow label="May Be Paused" checked={data.may_be_paused !== false} onChange={v => updateField('may_be_paused', v)} />
        <ToggleRow label="Resume Required" checked={data.resume_required || false} onChange={v => updateField('resume_required', v)} />
        <ToggleRow label="Focus Lock Eligible" checked={data.focus_lock_eligible || false} onChange={v => updateField('focus_lock_eligible', v)} disabled={!isAuthorized} templateDerived={isTemplateDerived('focus_lock_eligible')} />
      </div>

      {showOverrideReason && (
        <div className="space-y-1.5 p-2 rounded-md bg-amber-50 border border-amber-200">
          <Label className="text-xs text-amber-700">Override Reason (Required)</Label>
          <Textarea value={data.template_override_reason || ''} onChange={e => updateField('template_override_reason', e.target.value)} placeholder="Explain why you are overriding template defaults…" rows={2} />
        </div>
      )}
    </div>
  );
}

function ToggleRow({ label, checked, onChange, disabled, templateDerived }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span className="text-xs">{label}</span>
        {templateDerived && <Badge variant="secondary" className="text-xs">T</Badge>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}