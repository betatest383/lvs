import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useEmployeeContext } from '@/hooks/useEmployeeContext';
import { useMyTasks } from '@/hooks/useMyTasks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, ListChecks, Calendar, AlertTriangle, Flame, Clock, CheckCircle2 } from 'lucide-react';
import TaskCard from '@/components/tasks/TaskCard';
import TaskFormDialog from '@/components/tasks/TaskFormDialog';
import { toast } from 'sonner';
import { isOverdue, isDueToday } from '@/lib/enterpriseTaskConstants';

const FILTERS = [
  { key: 'all', label: 'All', icon: ListChecks },
  { key: 'due_today', label: 'Due Today', icon: Calendar },
  { key: 'overdue', label: 'Overdue', icon: AlertTriangle },
  { key: 'critical', label: 'Critical', icon: Flame },
  { key: 'waiting', label: 'Waiting', icon: Clock },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
];

export default function MyTasks() {
  const [filter, setFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const { employee, user } = useEmployeeContext();
  const { filteredTasks: tasks, loading, refetch } = useMyTasks(employee, { includeCompleted: true });

  const handleSave = async (data) => {
    try {
      const response = await base44.functions.invoke('manageTask', {
        action: 'create',
        taskData: data,
      });
      if (response.data?.success) {
        toast.success('Task created: ' + (response.data.task?.task_number || ''));
        refetch();
      } else {
        toast.error(response.data?.error || 'Failed to create task');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create task');
    }
  };

  const filtered = tasks.filter(t => {
    if (filter === 'all') return t.status !== 'Completed' && t.status !== 'Cancelled';
    if (filter === 'due_today') return isDueToday(t);
    if (filter === 'overdue') return isOverdue(t);
    if (filter === 'critical') return t.priority === 'Critical' && t.status !== 'Completed' && t.status !== 'Cancelled';
    if (filter === 'waiting') return t.status === 'Waiting' || t.status === 'Blocked';
    if (filter === 'completed') return t.status === 'Completed';
    return true;
  });

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Tasks</h1>
          <p className="text-muted-foreground text-sm">Tasks assigned to you or created by you.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="w-4 h-4 mr-2" /> New Task
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors select-none ${
              filter === f.key ? 'bg-accent text-accent-foreground' : 'bg-muted hover:bg-muted/70'
            }`}
          >
            <f.icon className="w-3.5 h-3.5" />
            {f.label}
            <span className="ml-1 text-xs opacity-70">({filter === f.key ? filtered.length : ''})</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No tasks match this filter.</CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(t => <TaskCard key={t.id} task={t} />)}
        </div>
      )}

      <TaskFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSave} />
    </div>
  );
}