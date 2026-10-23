import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, AlertTriangle } from 'lucide-react';
import { PRIORITY_COLORS, TASK_STATUS_COLORS, isOverdue } from '@/lib/enterpriseTaskConstants';
import TaskActionsMenu from './TaskActionsMenu';

export default function TaskCard({ task, onClick, compact, onRefresh, onEdit }) {
  const overdue = isOverdue(task);
  const showStatus = !compact;

  return (
    <Card
      className={`border-l-4 hover:shadow-md transition-shadow cursor-pointer relative`}
      style={{ borderLeftColor: task.priority === 'Critical' ? '#dc2626' : task.priority === 'High' ? '#ea580c' : task.priority === 'Medium' ? '#ca8a04' : '#16a34a' }}
      onClick={onClick}
    >
      <CardContent className={`p-3 ${compact ? 'p-2' : ''}`}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <Link
            to={`/tasks/detail/${task.id}`}
            onClick={e => e.stopPropagation()}
            className="text-sm font-medium hover:text-accent line-clamp-2 flex-1"
          >
            {task.title}
          </Link>
          <div className="flex items-center gap-1 shrink-0">
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${PRIORITY_COLORS[task.priority] || ''}`}>
              {task.priority}
            </span>
            <TaskActionsMenu task={task} onRefresh={onRefresh} onEdit={onEdit} />
          </div>
        </div>
        {(task.task_number || task.task_id) && <p className="text-xs text-muted-foreground mb-1">{task.task_number || task.task_id}</p>}
        {task.assigned_to && <p className="text-xs text-muted-foreground">👤 {task.assigned_to}</p>}
        {task.department && <p className="text-xs text-muted-foreground">🏢 {task.department}</p>}
        {task.due_date && (
          <p className={`text-xs flex items-center gap-1 mt-1 ${overdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
            {overdue ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
            Due: {task.due_date}
          </p>
        )}
        {showStatus && task.status && (
          <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-xs font-medium ${TASK_STATUS_COLORS[task.status] || ''}`}>
            {task.status}
          </span>
        )}
      </CardContent>
    </Card>
  );
}