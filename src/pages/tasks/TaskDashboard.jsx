import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ListChecks, User, AlertTriangle, Flame, Calendar, CheckCircle2,
  Ban, Clock, Eye, RotateCcw, Repeat, Building2, Plus,
} from 'lucide-react';
import { useCurrentRole } from '@/hooks/useCurrentRole';
import {
  TASK_STATUS_COLORS, PRIORITY_COLORS, isOverdue, isDueToday, parseJSON,
} from '@/lib/enterpriseTaskConstants';

export default function TaskDashboard() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { role, loading: roleLoading } = useCurrentRole();

  useEffect(() => {
    const load = async () => {
      try {
        const response = await base44.functions.invoke('manageTask', {
          action: 'list',
          listScope: 'all',
          filters: {},
        });
        if (response.data?.success) {
          setTasks(response.data.tasks || []);
        }
      } catch (err) {
        setTasks([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading || roleLoading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  const isPrivileged = role === 'admin' || role === 'owner';
  const isDirector = role === 'director_of_operations';
  const isWarehouseMgr = role === 'warehouse_manager';

  const open = tasks.filter(t => !['Completed', 'Canceled', 'Cancelled', 'Approved'].includes(t.status));
  const myOpen = open.filter(t => true); // manageTask already filters by role
  const overdue = open.filter(isOverdue);
  const dueToday = open.filter(isDueToday);
  const blocked = open.filter(t => t.status === 'Blocked');
  const changesRequested = tasks.filter(t => t.status === 'Changes Requested');
  const submittedForReview = tasks.filter(t => t.status === 'Submitted for Review');
  const awaitingApproval = tasks.filter(t => t.status === 'Awaiting Approval');
  const completed = tasks.filter(t => t.status === 'Completed');
  const recurring = tasks.filter(t => parseJSON(t.recurrence_config, null));
  const registryBuild = tasks.filter(t => t.task_type === 'Registry Build');

  // Role-specific KPIs
  let kpis = [];

  if (isPrivileged) {
    kpis = [
      { label: 'Open Tasks', value: open.length, icon: ListChecks, to: '/tasks/registry', color: 'bg-blue-100 text-blue-600' },
      { label: 'Awaiting Approval', value: awaitingApproval.length, icon: Clock, to: '/tasks/awaiting-approval', color: 'bg-indigo-100 text-indigo-600' },
      { label: 'Overdue', value: overdue.length, icon: AlertTriangle, to: '/tasks/overdue', color: 'bg-red-100 text-red-600' },
      { label: 'Blocked', value: blocked.length, icon: Ban, to: '/tasks/blocked', color: 'bg-pink-100 text-pink-600' },
      { label: 'Registry Build', value: registryBuild.length, icon: Building2, to: '/tasks/registry', color: 'bg-cyan-100 text-cyan-600' },
      { label: 'Submitted for Review', value: submittedForReview.length, icon: Eye, to: '/tasks/awaiting-review', color: 'bg-amber-100 text-amber-600' },
      { label: 'Changes Requested', value: changesRequested.length, icon: RotateCcw, to: '/tasks/changes-requested', color: 'bg-orange-100 text-orange-600' },
      { label: 'Completed', value: completed.length, icon: CheckCircle2, to: '/tasks/completed', color: 'bg-green-100 text-green-600' },
    ];
  } else if (isDirector) {
    kpis = [
      { label: 'My Tasks', value: myOpen.length, icon: User, to: '/tasks/my-tasks', color: 'bg-cyan-100 text-cyan-600' },
      { label: 'Team Queue', value: open.length, icon: ListChecks, to: '/tasks/team-queue', color: 'bg-blue-100 text-blue-600' },
      { label: 'Awaiting My Review', value: submittedForReview.length, icon: Eye, to: '/tasks/awaiting-review', color: 'bg-amber-100 text-amber-600' },
      { label: 'Overdue', value: overdue.length, icon: AlertTriangle, to: '/tasks/overdue', color: 'bg-red-100 text-red-600' },
      { label: 'Blocked', value: blocked.length, icon: Ban, to: '/tasks/blocked', color: 'bg-pink-100 text-pink-600' },
      { label: 'Due Today', value: dueToday.length, icon: Calendar, to: '/tasks/due-today', color: 'bg-purple-100 text-purple-600' },
      { label: 'Changes Requested', value: changesRequested.length, icon: RotateCcw, to: '/tasks/changes-requested', color: 'bg-orange-100 text-orange-600' },
      { label: 'Completed', value: completed.length, icon: CheckCircle2, to: '/tasks/completed', color: 'bg-green-100 text-green-600' },
    ];
  } else if (isWarehouseMgr) {
    kpis = [
      { label: 'My Tasks', value: myOpen.length, icon: User, to: '/tasks/my-tasks', color: 'bg-cyan-100 text-cyan-600' },
      { label: 'Due Today', value: dueToday.length, icon: Calendar, to: '/tasks/due-today', color: 'bg-purple-100 text-purple-600' },
      { label: 'Overdue', value: overdue.length, icon: AlertTriangle, to: '/tasks/overdue', color: 'bg-red-100 text-red-600' },
      { label: 'Awaiting Review', value: submittedForReview.length, icon: Eye, to: '/tasks/awaiting-review', color: 'bg-amber-100 text-amber-600' },
      { label: 'Changes Requested', value: changesRequested.length, icon: RotateCcw, to: '/tasks/changes-requested', color: 'bg-orange-100 text-orange-600' },
      { label: 'Recurring', value: recurring.length, icon: Repeat, to: '/tasks/recurring', color: 'bg-indigo-100 text-indigo-600' },
    ];
  } else {
    kpis = [
      { label: 'My Tasks', value: myOpen.length, icon: User, to: '/tasks/my-tasks', color: 'bg-cyan-100 text-cyan-600' },
      { label: 'Due Today', value: dueToday.length, icon: Calendar, to: '/tasks/my-tasks', color: 'bg-purple-100 text-purple-600' },
      { label: 'Overdue', value: overdue.length, icon: AlertTriangle, to: '/tasks/my-tasks', color: 'bg-red-100 text-red-600' },
    ];
  }

  // Workload by employee (Owner/Director only)
  const byAssignee = {};
  open.forEach(t => {
    const name = t.assigned_to || 'Unassigned';
    byAssignee[name] = (byAssignee[name] || 0) + 1;
  });

  const byType = {};
  open.forEach(t => { const tp = t.task_type || 'Other'; byType[tp] = (byType[tp] || 0) + 1; });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isPrivileged ? 'Task Command Center' : isDirector ? 'Operations Task Center' : 'Task Center'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isPrivileged
              ? 'Full visibility across all tasks, approvals, and team workload.'
              : isDirector
              ? 'Manage operational tasks, review warehouse work, and assign work.'
              : 'Your assigned tasks and work queue.'}
          </p>
        </div>
        <Link to="/tasks/registry">
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="w-4 h-4 mr-2" /> New Task</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <Link key={i} to={kpi.to}>
            <Card className="hover:shadow-md transition-shadow h-full">
              <CardContent className="p-4">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${kpi.color}`}>
                  <kpi.icon className="w-4 h-4" />
                </div>
                <p className="text-2xl font-bold">{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {(isPrivileged || isDirector) && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground" /> Workload by Employee</h3>
              {Object.keys(byAssignee).length === 0 ? <p className="text-sm text-muted-foreground">No open tasks.</p> : (
                <div className="space-y-1">
                  {Object.entries(byAssignee).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                    <Link key={name} to="/tasks/registry" className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                      <span className="truncate">{name}</span>
                      <span className="font-medium">{count}</span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><ListChecks className="w-4 h-4 text-muted-foreground" /> Tasks by Type</h3>
              {Object.keys(byType).length === 0 ? <p className="text-sm text-muted-foreground">No open tasks.</p> : (
                <div className="space-y-1">
                  {Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([type, count]) => (
                    <div key={type} className="flex justify-between text-sm px-2 py-1">
                      <span className="truncate text-xs">{type}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}