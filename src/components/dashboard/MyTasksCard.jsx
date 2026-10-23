import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckSquare, Loader2 } from 'lucide-react';
import { useEmployeeContext } from '@/hooks/useEmployeeContext';
import { useMyTasks } from '@/hooks/useMyTasks';

/**
 * Warehouse Dashboard My Tasks card.
 * Uses the shared useMyTasks hook — same filtering logic as the Developer Panel.
 */
export default function MyTasksCard({ maxItems = 5 }) {
  const { employee } = useEmployeeContext();
  const { filteredTasks: tasks, taskCount, loading } = useMyTasks(employee);

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-accent" />
          My Tasks
          {taskCount > 0 && <span className="text-muted-foreground font-normal">({taskCount})</span>}
          <Link to="/tasks/my-tasks" className="ml-auto text-xs text-accent hover:underline">View All</Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-[10px] text-muted-foreground/60 mb-2">
          Debug: showing {taskCount} filtered tasks for {employee?.employee_id || '—'}
        </p>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No tasks assigned to you.</p>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {tasks.slice(0, maxItems).map(task => (
              <Link key={task.id} to={`/tasks/detail/${task.id}`} className="block">
                <div className="flex items-center gap-3 rounded-lg border border-border p-2.5 hover:bg-muted/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    {task.task_id && <p className="text-xs text-muted-foreground truncate">{task.task_id}</p>}
                  </div>
                  <Badge className={`shrink-0 text-xs ${task.priority === 'Critical' ? 'bg-red-100 text-red-700' : task.priority === 'High' ? 'bg-orange-100 text-orange-700' : 'bg-muted text-muted-foreground'}`}>
                    {task.priority || 'Medium'}
                  </Badge>
                </div>
              </Link>
            ))}
            {tasks.length > maxItems && (
              <p className="text-xs text-muted-foreground text-center pt-1">+ {tasks.length - maxItems} more</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}