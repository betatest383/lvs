import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2 } from 'lucide-react';
import TaskCard from '@/components/tasks/TaskCard';
import { DEPARTMENTS } from '@/lib/enterpriseTaskConstants';

export default function DepartmentTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    base44.entities.EnterpriseTask.list('-created_date', 500)
      .then(all => {
        setTasks(all);
        if (user?.full_name) {
          const myTasks = all.filter(t => t.assigned_to === user.full_name || t.created_by === user.full_name);
          if (myTasks.length > 0 && myTasks[0]?.department) setDeptFilter(myTasks[0].department);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  const filtered = deptFilter ? tasks.filter(t => t.department === deptFilter) : tasks;
  const open = filtered.filter(t => t.status !== 'Completed' && t.status !== 'Cancelled');

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Department Tasks</h1>
          <p className="text-muted-foreground text-sm">All tasks within a department.</p>
        </div>
        <Select value={deptFilter || '__all'} onValueChange={v => setDeptFilter(v === '__all' ? '' : v)}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Departments" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Departments</SelectItem>
            {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><p className="text-2xl font-bold">{open.length}</p><p className="text-xs text-muted-foreground">Open</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold">{open.filter(t => t.priority === 'Critical').length}</p><p className="text-xs text-muted-foreground">Critical</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold">{open.filter(t => t.status === 'Blocked').length}</p><p className="text-xs text-muted-foreground">Blocked</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold">{filtered.filter(t => t.status === 'Completed').length}</p><p className="text-xs text-muted-foreground">Completed</p></CardContent></Card>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2"><Building2 className="w-8 h-8" /> No tasks found for this department.</CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(t => <TaskCard key={t.id} task={t} />)}
        </div>
      )}
    </div>
  );
}