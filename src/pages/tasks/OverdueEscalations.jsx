import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Flame, Clock, UserX, Ban } from 'lucide-react';
import TaskCard from '@/components/tasks/TaskCard';
import { isOverdue, parseJSON, isBlockedTooLong } from '@/lib/enterpriseTaskConstants';

export default function OverdueEscalations() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.EnterpriseTask.list('-created_date', 500)
      .then(all => setTasks(all))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  const open = tasks.filter(t => t.status !== 'Completed' && t.status !== 'Cancelled');
  const overdue = open.filter(isOverdue);
  const criticalOverdue = overdue.filter(t => t.priority === 'Critical');
  const escalationPast = open.filter(t => t.escalation_due_date && new Date(t.escalation_due_date) < new Date(new Date().toDateString()));
  const noOwner = open.filter(t => !t.assigned_to && !t.assigned_to_email && !t.assigned_role);
  const blockedTooLong = open.filter(isBlockedTooLong);

  const sections = [
    { title: 'Critical Overdue Tasks', tasks: criticalOverdue, icon: Flame, color: 'text-red-600' },
    { title: 'All Overdue Tasks', tasks: overdue, icon: AlertTriangle, color: 'text-orange-600' },
    { title: 'Past Escalation Due Date', tasks: escalationPast, icon: Clock, color: 'text-purple-600' },
    { title: 'No Owner Assigned', tasks: noOwner, icon: UserX, color: 'text-amber-600' },
    { title: 'Blocked Over 24 Hours', tasks: blockedTooLong, icon: Ban, color: 'text-pink-600' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overdue & Escalations</h1>
        <p className="text-muted-foreground text-sm">Tasks requiring immediate attention.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-4"><p className="text-2xl font-bold text-red-600">{criticalOverdue.length}</p><p className="text-xs text-muted-foreground">Critical Overdue</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold text-orange-600">{overdue.length}</p><p className="text-xs text-muted-foreground">Overdue</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold text-purple-600">{escalationPast.length}</p><p className="text-xs text-muted-foreground">Escalation Past</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold text-amber-600">{noOwner.length}</p><p className="text-xs text-muted-foreground">No Owner</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold text-pink-600">{blockedTooLong.length}</p><p className="text-xs text-muted-foreground">Blocked 24h+</p></CardContent></Card>
      </div>

      {sections.map((section, si) => section.tasks.length > 0 && (
        <div key={si}>
          <h2 className={`text-sm font-semibold mb-2 flex items-center gap-2 ${section.color}`}>
            <section.icon className="w-4 h-4" /> {section.title} ({section.tasks.length})
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {section.tasks.map(t => <TaskCard key={t.id} task={t} />)}
          </div>
        </div>
      ))}

      {sections.every(s => s.tasks.length === 0) && (
        <Card><CardContent className="p-8 text-center text-muted-foreground"><AlertTriangle className="w-8 h-8 mx-auto mb-2 text-green-600" /> No overdue or escalated tasks. Everything is on track!</CardContent></Card>
      )}
    </div>
  );
}