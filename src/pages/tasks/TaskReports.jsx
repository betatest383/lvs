import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Clock, Users, Building2, AlertTriangle, Flame, CheckCircle2, Ban, Monitor } from 'lucide-react';
import { TASK_STATUSES, TASK_PRIORITIES, DEPARTMENTS, SOURCE_MODULES, isOverdue, parseJSON } from '@/lib/enterpriseTaskConstants';

export default function TaskReports() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.EnterpriseTask.list('-created_date', 500)
      .then(setTasks)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  const open = tasks.filter(t => t.status !== 'Completed' && t.status !== 'Cancelled');
  const completed = tasks.filter(t => t.status === 'Completed');
  const overdue = open.filter(isOverdue);
  const critical = open.filter(t => t.priority === 'Critical');
  const blocked = open.filter(t => t.status === 'Blocked');

  // Completion time
  const completionTimes = completed
    .filter(t => t.completed_date && t.created_date)
    .map(t => (new Date(t.completed_date) - new Date(t.created_date)) / (1000 * 60 * 60 * 24));
  const avgCompletion = completionTimes.length > 0 ? (completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length).toFixed(1) : 0;

  // Task aging
  const agingBuckets = { '< 1 day': 0, '1-3 days': 0, '3-7 days': 0, '> 7 days': 0 };
  open.forEach(t => {
    if (!t.created_date) return;
    const age = (Date.now() - new Date(t.created_date)) / (1000 * 60 * 60 * 24);
    if (age < 1) agingBuckets['< 1 day']++;
    else if (age < 3) agingBuckets['1-3 days']++;
    else if (age < 7) agingBuckets['3-7 days']++;
    else agingBuckets['> 7 days']++;
  });

  // Approval cycle time
  const approvalTimes = completed
    .filter(t => t.approved_date && t.created_date && t.requires_approval)
    .map(t => (new Date(t.approved_date) - new Date(t.created_date)) / (1000 * 60 * 60 * 24));
  const avgApproval = approvalTimes.length > 0 ? (approvalTimes.reduce((a, b) => a + b, 0) / approvalTimes.length).toFixed(1) : 0;

  // By employee
  const byEmployee = {};
  open.forEach(t => { const name = t.assigned_to || 'Unassigned'; byEmployee[name] = (byEmployee[name] || 0) + 1; });

  // By department
  const byDept = {};
  open.forEach(t => { const d = t.department || 'Unassigned'; byDept[d] = (byDept[d] || 0) + 1; });

  // By source
  const bySource = {};
  open.forEach(t => { const s = t.source_module || 'Manual'; bySource[s] = (bySource[s] || 0) + 1; });

  // By role
  const byRole = {};
  open.forEach(t => { const r = t.assigned_role || 'Unassigned'; byRole[r] = (byRole[r] || 0) + 1; });

  const kpis = [
    { label: 'Total Tasks', value: tasks.length, icon: BarChart3, color: 'bg-blue-100 text-blue-600' },
    { label: 'Open', value: open.length, icon: Clock, color: 'bg-amber-100 text-amber-600' },
    { label: 'Completed', value: completed.length, icon: CheckCircle2, color: 'bg-green-100 text-green-600' },
    { label: 'Overdue', value: overdue.length, icon: AlertTriangle, color: 'bg-red-100 text-red-600' },
    { label: 'Critical', value: critical.length, icon: Flame, color: 'bg-orange-100 text-orange-600' },
    { label: 'Blocked', value: blocked.length, icon: Ban, color: 'bg-pink-100 text-pink-600' },
    { label: 'Avg Completion (days)', value: avgCompletion, icon: CheckCircle2, color: 'bg-cyan-100 text-cyan-600' },
    { label: 'Avg Approval (days)', value: avgApproval, icon: Clock, color: 'bg-purple-100 text-purple-600' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Task Reports</h1>
        <p className="text-muted-foreground text-sm">Comprehensive analytics across all enterprise tasks.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${kpi.color}`}><kpi.icon className="w-4 h-4" /></div>
              <p className="text-2xl font-bold">{kpi.value}</p>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4 text-accent" /> Tasks by Employee</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {Object.entries(byEmployee).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => (
              <Link key={name} to="/tasks/registry" className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                <span className="truncate">{name}</span><span className="font-medium">{count}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Building2 className="w-4 h-4 text-accent" /> Tasks by Department</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {Object.entries(byDept).sort((a, b) => b[1] - a[1]).map(([dept, count]) => (
              <Link key={dept} to="/tasks/department" className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                <span className="truncate">{dept}</span><span className="font-medium">{count}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Monitor className="w-4 h-4 text-accent" /> Tasks by Source Module</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([src, count]) => (
              <div key={src} className="flex justify-between text-sm px-2 py-1">
                <span className="truncate text-xs">{src}</span><span className="font-medium">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-accent" /> Task Aging</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {Object.entries(agingBuckets).map(([bucket, count]) => (
              <div key={bucket} className="flex justify-between text-sm px-2 py-1">
                <span className="text-muted-foreground">{bucket}</span><span className="font-medium">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4 text-accent" /> Workload by Role</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {Object.entries(byRole).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([role, count]) => (
              <div key={role} className="flex justify-between text-sm px-2 py-1">
                <span className="truncate text-xs">{role}</span><span className="font-medium">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Blocked Task Analysis</CardTitle></CardHeader>
          <CardContent>
            {blocked.length === 0 ? <p className="text-sm text-muted-foreground">No blocked tasks.</p> : (
              <div className="space-y-1">
                {blocked.map(t => (
                  <Link key={t.id} to={`/tasks/detail/${t.id}`} className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                    <span className="truncate">{t.title}</span><span className="text-xs text-muted-foreground">{t.department}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}