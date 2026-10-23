import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Bell, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useEmployeeContext } from '@/hooks/useEmployeeContext';
import { useMyNotifications } from '@/hooks/useMyNotifications';
import { BADGE_COLORS } from '@/lib/notificationInclusionResolver';

/**
 * Warehouse Dashboard My Notifications card.
 * Uses the shared useMyNotifications hook — same filtering logic as the Developer Panel.
 */
export default function MyNotificationsCard() {
  const { employee } = useEmployeeContext();
  const { filteredNotifications: notifications, notificationCount, unreadCount, criticalCount, acknowledgmentRequiredCount, loading } = useMyNotifications(employee);

  return (
    <Card className="border shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Bell className="w-4 h-4 text-accent" /> My Notifications
            {notificationCount > 0 && <span className="text-muted-foreground font-normal">({notificationCount})</span>}
          </h3>
          <Link to="/notifications/my" className="text-xs text-accent hover:underline">View All</Link>
        </div>

        <p className="text-[10px] text-muted-foreground/60 mb-2">
          Debug: showing {notificationCount} filtered notifications for {employee?.employee_id || '—'}
        </p>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 rounded-lg bg-blue-50">
                <Bell className="w-4 h-4 text-blue-600 mx-auto mb-1" />
                <p className="text-xl font-bold text-blue-600">{unreadCount}</p>
                <p className="text-xs text-muted-foreground">Unread</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-red-50">
                <AlertTriangle className="w-4 h-4 text-red-600 mx-auto mb-1" />
                <p className="text-xl font-bold text-red-600">{criticalCount}</p>
                <p className="text-xs text-muted-foreground">Critical</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-amber-50">
                <CheckCircle2 className="w-4 h-4 text-amber-600 mx-auto mb-1" />
                <p className="text-xl font-bold text-amber-600">{acknowledgmentRequiredCount}</p>
                <p className="text-xs text-muted-foreground">Ack Required</p>
              </div>
            </div>
            {notifications.length > 0 && (
              <div className="mt-3 space-y-1">
                {notifications.slice(0, 3).map(n => {
                  const badge = n._inclusion?.badge;
                  return (
                    <Link key={n.id} to={`/notifications/detail/${n.id}`} className="block text-xs p-2 rounded bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="font-medium">{n.title}</span>
                        {badge && <span className={`px-1 py-0.5 rounded text-[10px] font-medium border ${BADGE_COLORS[badge] || ''}`}>{badge}</span>}
                        {n._inclusion?.unexpectedMatch && <span className="px-1 py-0.5 rounded text-[10px] bg-red-500 text-white">!</span>}
                      </div>
                      <span className="text-muted-foreground">{n.source_module}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}