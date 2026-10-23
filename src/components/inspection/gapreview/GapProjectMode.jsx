import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, ListTodo, UserCheck, CheckCircle2, Clock } from 'lucide-react';
import GapCard from './GapCard';

function ProjectSection({ title, icon: Icon, color, gaps, onViewDetail, onMarkStatus, onAssign, onAddNote }) {
  const [expanded, setExpanded] = useState(true);
  const colorMap = {
    amber: 'text-amber-600 bg-amber-50',
    indigo: 'text-indigo-600 bg-indigo-50',
    green: 'text-green-600 bg-green-50',
    orange: 'text-orange-600 bg-orange-50',
  };

  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <span className={`w-7 h-7 rounded-full flex items-center justify-center ${colorMap[color]}`}>
            <Icon className="w-3.5 h-3.5" />
          </span>
          <span className="text-sm font-semibold">{title}</span>
          <Badge variant="secondary" className="text-[10px]">{gaps.length}</Badge>
        </div>
      </button>
      {expanded && gaps.length > 0 && (
        <div className="divide-y divide-border">
          {gaps.map((gap, idx) => (
            <GapCard
              key={`${gap.gap_id}_${idx}`}
              gap={gap}
              onViewDetail={onViewDetail}
              onMarkStatus={onMarkStatus}
              onAssign={onAssign}
              onAddNote={onAddNote}
            />
          ))}
        </div>
      )}
      {expanded && gaps.length === 0 && (
        <div className="p-4 text-center text-xs text-muted-foreground">No items in this section.</div>
      )}
    </Card>
  );
}

export default function GapProjectMode({ gaps, onViewDetail, onMarkStatus, onAssign, onAddNote }) {
  const remaining = gaps.filter(g => g.status !== 'fixed' && g.status !== 'not_applicable');
  const assigned = gaps.filter(g => g.assigned_to && g.status !== 'fixed' && g.status !== 'not_applicable');
  const completed = gaps.filter(g => g.status === 'fixed' || g.status === 'not_applicable');
  const deferred = gaps.filter(g => g.status === 'deferred');

  return (
    <div className="space-y-2">
      <ProjectSection title="Remaining Work" icon={ListTodo} color="amber" gaps={remaining}
        onViewDetail={onViewDetail} onMarkStatus={onMarkStatus} onAssign={onAssign} onAddNote={onAddNote} />
      <ProjectSection title="Assigned Work" icon={UserCheck} color="indigo" gaps={assigned}
        onViewDetail={onViewDetail} onMarkStatus={onMarkStatus} onAssign={onAssign} onAddNote={onAddNote} />
      <ProjectSection title="Deferred" icon={Clock} color="orange" gaps={deferred}
        onViewDetail={onViewDetail} onMarkStatus={onMarkStatus} onAssign={onAssign} onAddNote={onAddNote} />
      <ProjectSection title="Completed" icon={CheckCircle2} color="green" gaps={completed}
        onViewDetail={onViewDetail} onMarkStatus={onMarkStatus} onAssign={onAssign} onAddNote={onAddNote} />
    </div>
  );
}