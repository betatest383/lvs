import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock } from 'lucide-react';
import moment from 'moment';

/**
 * Recent Activity Widget — notifications and recent activity feed.
 * @param {Array} items - [{ title, subtitle, timestamp, icon, to }]
 */
export default function RecentActivityWidget({ title = 'Recent Activity', items = [], emptyMessage = 'No recent activity' }) {
  return (
    <Card className="border-0 shadow-sm h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{emptyMessage}</p>
        ) : (
          <div className="space-y-0 max-h-[360px] overflow-y-auto">
            {items.map((item, i) => {
              const Icon = item.icon;
              const content = (
                <div className="flex items-start gap-3 py-2.5 border-b last:border-0">
                  {Icon && <Icon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    {item.subtitle && <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>}
                  </div>
                  {item.timestamp && (
                    <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                      {moment.utc(item.timestamp).fromNow()}
                    </span>
                  )}
                </div>
              );
              return item.to
                ? <Link key={i} to={item.to} className="block hover:bg-muted/30 rounded -mx-1 px-1 transition-colors">{content}</Link>
                : <div key={i}>{content}</div>;
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}