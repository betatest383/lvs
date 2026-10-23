import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { CheckCircle2, Circle } from 'lucide-react';

const STATUS_OPTIONS = {
  training: ['Assigned', 'Started', 'Completed'],
  policy: ['Assigned', 'Signed', 'Outstanding'],
  certification: ['Required', 'Scheduled', 'Completed'],
  equipment: ['Pending', 'Assigned', 'Acknowledged'],
  review: ['Pending', 'Scheduled', 'Completed'],
};

export default function PhaseChecklist({ items = [], onChange, phaseType = 'simple' }) {
  const toggle = (i) => {
    const updated = [...items];
    updated[i] = {
      ...updated[i],
      completed: !updated[i].completed,
      completed_at: !updated[i].completed ? new Date().toISOString() : null,
    };
    onChange(updated);
  };

  const updateItem = (i, updates) => {
    const updated = [...items];
    updated[i] = { ...updated[i], ...updates };
    onChange(updated);
  };

  const completed = items.filter(i => i.completed).length;
  const pct = items.length > 0 ? Math.round((completed / items.length) * 100) : 0;
  const showStatus = phaseType !== 'simple' && STATUS_OPTIONS[phaseType];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{completed} of {items.length} complete</span>
        <span className="text-sm font-bold">{pct}%</span>
      </div>
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="space-y-2">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No items for this phase.</p>
        )}
        {items.map((item, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 p-3 rounded-lg border bg-card transition-colors ${item.completed ? 'opacity-60' : ''}`}
          >
            <button onClick={() => toggle(i)} className="mt-0.5 shrink-0 select-none">
              {item.completed
                ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                : <Circle className="w-5 h-5 text-muted-foreground" />}
            </button>
            <div className="flex-1 min-w-0 space-y-1">
              <p className={`text-sm font-medium ${item.completed ? 'line-through text-muted-foreground' : ''}`}>
                {item.label}
              </p>
              {item.type && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{item.type}</span>
              )}
              {item.id && (
                <span className="text-xs text-muted-foreground ml-1">{item.id}</span>
              )}
              {showStatus && (
                <div className="flex items-center gap-2 mt-1">
                  <Select
                    value={item.status || STATUS_OPTIONS[phaseType][0]}
                    onValueChange={v => updateItem(i, { status: v })}
                  >
                    <SelectTrigger className="h-7 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS[phaseType].map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {phaseType === 'training' && (
                    <Input
                      type="number"
                      value={item.quiz_score ?? ''}
                      onChange={e => updateItem(i, { quiz_score: e.target.value ? Number(e.target.value) : null })}
                      placeholder="Quiz %"
                      className="h-7 w-20 text-xs"
                    />
                  )}
                </div>
              )}
              {item.notes && (
                <p className="text-xs text-muted-foreground">{item.notes}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}