import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, GitBranch } from 'lucide-react';

const OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'contains', label: 'contains' },
  { value: 'is_not_empty', label: 'has any answer' },
];

const EMPTY_CONDITION = { question_id: '', operator: 'equals', value: '' };

function ConditionRow({ cond, index, questions, currentId, onChange, onRemove, canRemove }) {
  const availableQuestions = questions.filter(q => q.id !== currentId);
  const selectedQ = availableQuestions.find(q => q.id === cond.question_id);
  const answerOptions = selectedQ?.question_type === 'yes_no'
    ? ['Yes', 'No']
    : selectedQ?.answer_options
      ? selectedQ.answer_options.split(',').map(o => o.trim()).filter(Boolean)
      : [];
  const needsValue = cond.operator !== 'is_not_empty';

  return (
    <div className="bg-white border border-amber-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-amber-700">Condition {index + 1}</span>
        {canRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-muted-foreground hover:text-destructive">Remove</button>
        )}
      </div>
      <Select value={cond.question_id} onValueChange={v => onChange({ ...cond, question_id: v, value: '' })}>
        <SelectTrigger className="bg-white text-xs h-8"><SelectValue placeholder="Select a question..." /></SelectTrigger>
        <SelectContent>
          {availableQuestions.map(q => (
            <SelectItem key={q.id} value={q.id}><span className="truncate max-w-xs text-xs">{q.question_text}</span></SelectItem>
          ))}
        </SelectContent>
      </Select>
      {cond.question_id && (
        <Select value={cond.operator} onValueChange={v => onChange({ ...cond, operator: v })}>
          <SelectTrigger className="bg-white text-xs h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            {OPERATORS.map(op => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {cond.question_id && needsValue && (
        answerOptions.length > 0 ? (
          <Select value={cond.value} onValueChange={v => onChange({ ...cond, value: v })}>
            <SelectTrigger className="bg-white text-xs h-8"><SelectValue placeholder="Expected answer..." /></SelectTrigger>
            <SelectContent>
              {answerOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <Input className="bg-white h-8 text-xs" placeholder="Type expected answer..." value={cond.value} onChange={e => onChange({ ...cond, value: e.target.value })} />
        )
      )}
    </div>
  );
}

function parseVisibilityRule(value) {
  try {
    if (!value) return { enabled: false, logic: 'or', conditions: [{ ...EMPTY_CONDITION }] };
    const parsed = JSON.parse(value);
    if (parsed.conditions) return { enabled: true, logic: parsed.logic || 'or', conditions: parsed.conditions };
    return { enabled: true, logic: 'or', conditions: [{ question_id: parsed.question_id || '', operator: parsed.operator || 'equals', value: parsed.value || '' }] };
  } catch {
    return { enabled: false, logic: 'or', conditions: [{ ...EMPTY_CONDITION }] };
  }
}

export default function VisibilityRuleBuilder({ value, onChange, questions, currentId }) {
  const initial = parseVisibilityRule(value);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [logic, setLogic] = useState(initial.logic);
  const [conditions, setConditions] = useState(initial.conditions);
  const lastValueRef = useRef(value);

  useEffect(() => {
    if (value !== lastValueRef.current) {
      lastValueRef.current = value;
      const p = parseVisibilityRule(value);
      setEnabled(p.enabled);
      setLogic(p.logic);
      setConditions(p.conditions);
    }
  }, [value]);

  useEffect(() => {
    let emitted;
    if (!enabled) {
      emitted = '';
    } else {
      const validConditions = conditions.filter(c => c.question_id);
      if (validConditions.length === 0) emitted = '';
      else if (validConditions.length === 1) {
        const c = validConditions[0];
        const rule = { question_id: c.question_id, operator: c.operator };
        if (c.operator !== 'is_not_empty' && c.value) rule.value = c.value;
        emitted = JSON.stringify(rule);
      } else {
        emitted = JSON.stringify({ logic, conditions: validConditions });
      }
    }
    if (emitted !== lastValueRef.current) {
      lastValueRef.current = emitted;
      onChange(emitted);
    }
  }, [enabled, logic, conditions]);

  const updateCondition = (i, cond) => setConditions(prev => prev.map((c, idx) => idx === i ? cond : c));
  const removeCondition = (i) => setConditions(prev => prev.filter((_, idx) => idx !== i));
  const addCondition = () => setConditions(prev => [...prev, { ...EMPTY_CONDITION }]);

  if (!enabled) {
    return (
      <Button type="button" variant="outline" size="sm" className="gap-2 text-muted-foreground" onClick={() => setEnabled(true)}>
        <GitBranch className="w-4 h-4" /> Add Conditional Logic
      </Button>
    );
  }

  return (
    <div className="border border-dashed border-amber-300 bg-amber-50 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
          <GitBranch className="w-4 h-4" /> Show this question only if...
        </p>
        <button type="button" onClick={() => { setEnabled(false); onChange(''); }} className="text-xs text-muted-foreground hover:text-destructive">Remove</button>
      </div>
      {conditions.map((cond, i) => (
        <div key={i}>
          {i > 0 && (
            <div className="flex items-center gap-2 my-1">
              <div className="flex-1 h-px bg-amber-200" />
              <Select value={logic} onValueChange={setLogic}>
                <SelectTrigger className="w-20 h-7 text-xs bg-amber-100 border-amber-300"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="or">OR</SelectItem><SelectItem value="and">AND</SelectItem></SelectContent>
              </Select>
              <div className="flex-1 h-px bg-amber-200" />
            </div>
          )}
          <ConditionRow cond={cond} index={i} questions={questions} currentId={currentId}
            onChange={(updated) => updateCondition(i, updated)} onRemove={() => removeCondition(i)}
            canRemove={conditions.length > 1} />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-full gap-1 border-amber-300 text-amber-700 hover:bg-amber-100" onClick={addCondition}>
        <Plus className="w-3 h-3" /> Add Another Condition
      </Button>
    </div>
  );
}