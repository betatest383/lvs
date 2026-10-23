import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { stableSortQuestions } from '@/lib/inspectionQuestionOrdering';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2 } from 'lucide-react';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

const OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'contains', label: 'contains' },
  { value: 'is_not_empty', label: 'has any answer' },
];

const SEVERITY_OPTIONS = ['info', 'minor', 'moderate', 'major', 'critical'];
const RULE_TYPES = [
  { value: 'finding', label: 'Finding' },
  { value: 'repair', label: 'Repair Recommendation' },
  { value: 'estimate_item', label: 'Estimate Line Item' },
  { value: 'invoice_item', label: 'Invoice Item' },
  { value: 'material', label: 'Material Requirement' },
  { value: 'report_narrative', label: 'Report Narrative' },
  { value: 'visibility', label: 'Question Visibility' },
];

const BLANK_CONDITION = { question_id: '', operator: 'equals', value: '' };

function ConditionRow({ condition, index, questions, onChange, onRemove }) {
  const selectedQ = questions.find(q => q.id === condition.question_id);
  const answerOptions = selectedQ?.question_type === 'yes_no'
    ? ['Yes', 'No']
    : selectedQ?.answer_options
      ? selectedQ.answer_options.split(',').map(o => o.trim()).filter(Boolean)
      : [];
  const needsValue = condition.operator !== 'is_not_empty';

  return (
    <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg border">
      {index > 0 && (
        <span className="text-xs font-bold text-muted-foreground mt-2.5 w-6 shrink-0">AND</span>
      )}

      {/* Question picker */}
      <div className="flex-1 min-w-0">
        <Select value={condition.question_id} onValueChange={v => onChange({ ...condition, question_id: v, value: '' })}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Select question..." />
          </SelectTrigger>
          <SelectContent>
            {questions.map(q => (
              <SelectItem key={q.id} value={q.id}>
                <span className="truncate max-w-xs text-xs">{q.question_text}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Operator */}
      <div className="w-36 shrink-0">
        <Select value={condition.operator} onValueChange={v => onChange({ ...condition, operator: v })}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPERATORS.map(op => (
              <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Value */}
      {needsValue && (
        <div className="w-32 shrink-0">
          {answerOptions.length > 0 ? (
            <Select value={condition.value} onValueChange={v => onChange({ ...condition, value: v })}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Answer..." />
              </SelectTrigger>
              <SelectContent>
                {answerOptions.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              className="h-9 text-xs"
              placeholder="Value..."
              value={condition.value}
              onChange={e => onChange({ ...condition, value: e.target.value })}
            />
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onRemove}
        className="mt-1.5 text-muted-foreground hover:text-destructive shrink-0"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function LogicRuleDialog({ open, onOpenChange, editing, repairs, onSave }) {
  const [questions, setQuestions] = useState([]);
  const [conditions, setConditions] = useState([{ ...BLANK_CONDITION }]);
  const [form, setForm] = useState({
    rule_name: '', rule_type: 'finding', inspection_type: 'both', category: '',
    output_finding_type: '', output_severity: 'critical',
    output_repair_id: '', output_narrative: '', output_estimate_price: '',
    priority: 0, is_active: true, description: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.entities.InspectionQuestion.list('sort_order', 500).then(qs => setQuestions(stableSortQuestions(qs)));
  }, []);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const { conditions_json, ...rest } = editing;
      setForm({
        rule_name: rest.rule_name || '',
        rule_type: rest.rule_type || 'finding',
        inspection_type: rest.inspection_type || 'both',
        category: rest.category || '',
        output_finding_type: rest.output_finding_type || '',
        output_severity: rest.output_severity || 'critical',
        output_repair_id: rest.output_repair_id || '',
        output_narrative: rest.output_narrative || '',
        output_estimate_price: rest.output_estimate_price || '',
        priority: rest.priority || 0,
        is_active: rest.is_active !== false,
        description: rest.description || '',
        id: rest.id,
      });
      try {
        const parsed = JSON.parse(conditions_json || '[]');
        setConditions(Array.isArray(parsed) && parsed.length > 0 ? parsed : [{ ...BLANK_CONDITION }]);
      } catch {
        setConditions([{ ...BLANK_CONDITION }]);
      }
    } else {
      setForm({ rule_name: '', rule_type: 'finding', inspection_type: 'both', category: '', output_finding_type: '', output_severity: 'critical', output_repair_id: '', output_narrative: '', output_estimate_price: '', priority: 0, is_active: true, description: '' });
      setConditions([{ ...BLANK_CONDITION }]);
    }
  }, [editing, open]);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open, editing]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onOpenChange(false));

  const set = (key, val) => { setForm(f => ({ ...f, [key]: val })); setIsDirty(true); };
  const updateConditions = (fn) => { setConditions(fn); setIsDirty(true); };

  const handleSave = async () => {
    if (!form.rule_name?.trim()) {
      alert('Please enter a Rule Name first.');
      return;
    }
    setSaving(true);
    const validConditions = conditions.filter(c => c.question_id);
    const payload = { ...form, conditions_json: JSON.stringify(validConditions), output_estimate_price: form.output_estimate_price !== '' ? Number(form.output_estimate_price) : null };
    try {
      if (payload.id) {
        await base44.entities.LogicRule.update(payload.id, payload);
      } else {
        await base44.entities.LogicRule.create(payload);
      }
      onSave(payload); // notify parent to refresh
      onOpenChange(false);
    } catch (err) {
      alert('Save error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

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