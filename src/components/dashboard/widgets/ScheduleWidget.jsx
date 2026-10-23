import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from 'lucide-react';
import moment from 'moment';

/**
 * Schedule Widget — calendar, schedule, or workload view.
 * @param {Array} items - [{ title, subtitle, date, time, to }]
 */
export default function ScheduleWidget({ title = 'My Schedule', items = [], emptyMessage = 'Nothing scheduled' }) {
  return (
    <Card className="border-0 shadow-sm h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-500" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{emptyMessage}</p>
        ) : (
          <div className="space-y-2 max-h-[360px] overflow-y-auto">
            {items.map((item, i) => {
              const date = item.date ? moment.utc(item.date) : null;
              const content = (
                <div className="flex items-center gap-3 rounded-lg border border-border p-2.5 hover:bg-muted/50 transition-colors">
                  {date && (
                    <div className="w-10 h-10 rounded-lg bg-muted flex flex-col items-center justify-center shrink-0">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">{date.format('MMM')}</span>
                      <span className="text-sm font-bold leading-none">{date.format('D')}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    {item.subtitle && <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>}
                  </div>
                  {item.time && <span className="text-xs text-muted-foreground shrink-0">{item.time}</span>}
                </div>
              );
              return item.to
                ? <Link key={i} to={item.to} className="block">{content}</Link>
                : <div key={i}>{content}</div>;
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}