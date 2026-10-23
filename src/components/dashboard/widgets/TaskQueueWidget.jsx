import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

/**
 * Task Queue Widget — "Needs My Attention" live work queue.
 * @param {Array} tasks - [{ title, subtitle, icon, badge, badgeColor, to }]
 */
export default function TaskQueueWidget({ title = 'Needs My Attention', tasks = [], emptyMessage = 'All caught up!' }) {
  return (
    <Card className="border-0 shadow-sm h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500" />
          {title}
          {tasks.length > 0 && <span className="text-muted-foreground font-normal">({tasks.length})</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{emptyMessage}</p>
        ) : (
          <div className="space-y-2 max-h-[360px] overflow-y-auto">
            {tasks.map((task, i) => {
              const Icon = task.icon;
              const content = (
                <div className="flex items-center gap-3 rounded-lg border border-border p-2.5 hover:bg-muted/50 transition-colors">
                  {Icon && <Icon className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    {task.subtitle && <p className="text-xs text-muted-foreground truncate">{task.subtitle}</p>}
                  </div>
                  {task.badge && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${task.badgeColor || 'bg-muted text-muted-foreground'}`}>
                      {task.badge}
                    </span>
                  )}
                </div>
              );
              return task.to
                ? <Link key={i} to={task.to} className="block">{content}</Link>
                : <div key={i}>{content}</div>;
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}