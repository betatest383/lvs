import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckSquare, AlertCircle, Clock, ChevronRight, Loader2 } from 'lucide-react';
import { useMyTasks } from '@/hooks/useMyTasks';

const PRIORITY_STYLES = {
  Critical: 'bg-red-100 text-red-700',
  High: 'bg-orange-100 text-orange-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-slate-100 text-slate-600',
};

const STATUS_STYLES = {
  New: 'bg-blue-100 text-blue-700',
  Assigned: 'bg-indigo-100 text-indigo-700',
  'In Progress': 'bg-green-100 text-green-700',
  Blocked: 'bg-red-100 text-red-700',
  Overdue: 'bg-red-200 text-red-800',
  Waiting: 'bg-amber-100 text-amber-700',
};

export default function MyTasksCard({ employee }) {
  const { filteredTasks: tasks, loading } = useMyTasks(employee);

  const active = tasks.filter(t => t.status !== 'Completed' && t.status !== 'Cancelled');
  const critical = active.filter(t => t.priority === 'Critical');
  const overdue = active.filter(t => t.status === 'Overdue');

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-accent" /> My Tasks
          </CardTitle>
          <Link to="/tasks/my-tasks" className="text-xs text-accent hover:underline flex items-center">
            View All <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="text-center p-2 rounded-lg bg-blue-50">
                <CheckSquare className="w-4 h-4 text-blue-600 mx-auto mb-1" />
                <p className="text-xl font-bold text-blue-600">{active.length}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-red-50">
                <AlertCircle className="w-4 h-4 text-red-600 mx-auto mb-1" />
                <p className="text-xl font-bold text-red-600">{critical.length}</p>
                <p className="text-xs text-muted-foreground">Critical</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-orange-50">
                <Clock className="w-4 h-4 text-orange-600 mx-auto mb-1" />
                <p className="text-xl font-bold text-orange-600">{overdue.length}</p>
                <p className="text-xs text-muted-foreground">Overdue</p>
              </div>
            </div>
            {active.length > 0 ? (
              <div className="space-y-1.5">
                {active.slice(0, 4).map(t => (
                  <Link key={t.id} to={`/tasks/detail/${t.id}`} className="block p-2.5 rounded-lg border hover:shadow-sm transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{t.title}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          {t.priority && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_STYLES[t.priority] || PRIORITY_STYLES.Medium}`}>
                              {t.priority}
                            </span>
                          )}
                          {t.status && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_STYLES[t.status] || ''}`}>
                              {t.status}
                            </span>
                          )}
                          {t.due_date && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" /> {t.due_date}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-sm text-muted-foreground">
                <CheckSquare className="w-6 h-6 mx-auto mb-1 text-green-500" />
                No active tasks assigned to you.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}