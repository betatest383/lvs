import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import TaskCard from '@/components/tasks/TaskCard';
import TaskFormDialog from '@/components/tasks/TaskFormDialog';
import { TASK_TYPES, TASK_PRIORITIES, isOverdue, isDueToday, parseJSON } from '@/lib/enterpriseTaskConstants';

export default function TaskRegistryPage({ scope = 'all', filter, title, description }) {
  const [tasks, setTasks] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const navigate = useNavigate();

  const pageTitle = title || 'Enterprise Tasks';
  const pageDesc = description || 'Manage active and historical tasks across every LVC OS module.';
  const [archiveFilter, setArchiveFilter] = useState('active');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await base44.functions.invoke('manageTask', {
        action: 'list',
        listScope: scope,
        filters: { archiveFilter },
      });

      if (response.data?.success) {
        setTasks(response.data.tasks || []);
      } else {
        setTasks([]);
        setLoadError(response.data?.allowed === false ? 'access_denied' : 'generic');
      }
    } catch (err) {
      setTasks([]);
      setLoadError(err?.response?.status === 403 ? 'access_denied' : 'generic');
    } finally {
      setLoading(false);
    }
  }, [scope, archiveFilter]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data) => {
    try {
      if (editing) {
        const response = await base44.functions.invoke('manageTask', {
          action: 'edit',
          taskId: editing.id,
          taskData: data,
        });
        if (response.data?.success) {
          toast.success('Task updated');
        } else {
          toast.error('Failed to update task');
          return;
        }
      } else {
        const response = await base44.functions.invoke('manageTask', {
          action: 'create',
          taskData: data,
        });
        if (response.data?.success) {
          toast.success('Task created: ' + response.data.task?.task_number);
        } else {
          toast.error('Failed to create task');
          return;
        }
      }
      setEditing(null);
      load();
    } catch {
      toast.error('Operation failed');
    }
  };

  const filtered = tasks.filter(t => {
    if (filter === 'due_today') {
      if (!isDueToday(t)) return false;
    } else if (filter === 'overdue') {
      if (!isOverdue(t)) return false;
    } else if (filter === 'recurring') {
      const rec = parseJSON(t.recurrence_config, null);
      if (!rec) return false;
    } else if (filter && filter !== 'all') {
      if (t.status !== filter) return false;
    }

    if (search) {
      const q = search.toLowerCase();
      if (!t.title?.toLowerCase().includes(q) &&
          !t.task_number?.toLowerCase().includes(q) &&
          !t.task_id?.toLowerCase().includes(q) &&
          !t.description?.toLowerCase().includes(q) &&
          !t.assigned_to?.toLowerCase().includes(q)) return false;
    }
    if (typeFilter && t.task_type !== typeFilter) return false;
    if (priorityFilter && t.priority !== priorityFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
          <p className="text-muted-foreground text-sm">{pageDesc}</p>
        </div>
        {scope !== 'team' && scope !== 'data_review' && (
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="w-4 h-4 mr-2" /> New Task
          </Button>
        )}
      </div>

      {loadError && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-red-800">
              {loadError === 'access_denied' ? 'Access denied' : 'Failed to load tasks'}
            </p>
            <p className="text-sm text-red-600 mt-1">
              {loadError === 'access_denied'
                ? 'You do not have permission to view the task registry.'
                : 'Something went wrong. Please try again.'}
            </p>
            {loadError !== 'access_denied' && (
              <Button variant="outline" size="sm" className="mt-2 h-7" onClick={load}>Retry</Button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks..." className="pl-9" />
        </div>
        <Select value={typeFilter || '__all'} onValueChange={v => setTypeFilter(v === '__all' ? '' : v)}>
          <SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent><SelectItem value="__all">All Types</SelectItem>{TASK_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={priorityFilter || '__all'} onValueChange={v => setPriorityFilter(v === '__all' ? '' : v)}>
          <SelectTrigger className="w-32 h-9 text-sm"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent><SelectItem value="__all">All Priorities</SelectItem>{TASK_PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={archiveFilter} onValueChange={setArchiveFilter}>
          <SelectTrigger className="w-32 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>
      ) : loadError ? (
        <div className="text-center py-12 text-muted-foreground">
          {loadError === 'access_denied' ? 'Access denied.' : 'Tasks could not be loaded. See error above.'}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No tasks found.</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(t => (
            <TaskCard key={t.id} task={t} onClick={() => navigate(`/tasks/detail/${t.id}`)} onRefresh={load} onEdit={(task) => { setEditing(task); setDialogOpen(true); }} />
          ))}
        </div>
      )}

      <TaskFormDialog open={dialogOpen} onOpenChange={setDialogOpen} initialData={editing} onSave={handleSave} />
    </div>
  );
}