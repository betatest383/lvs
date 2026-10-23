import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Bell, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { isUnread, isCritical, requiresAction } from '@/lib/notificationConstants';

export default function RoleNotificationWidget({ user }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.email) return;
    base44.entities.EnterpriseNotification.list('-created_date', 200)
      .then(all => {
        const mine = all.filter(n =>
          n.recipient_email === user.email ||
          (!n.recipient_email && !n.is_archived)
        );
        setNotifications(mine);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return null;
  if (notifications.length === 0) return null;

  const active = notifications.filter(n => n.status !== 'Cancelled' && n.status !== 'Expired' && !n.is_archived);
  const unread = active.filter(isUnread);
  const critical = active.filter(isCritical);
  const pendingAck = active.filter(requiresAction);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Bell className="w-4 h-4 text-accent" /> Notifications</h3>
          <Link to="/notifications/my" className="text-xs text-accent hover:underline">View All</Link>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 rounded-lg bg-blue-50">
            <Bell className="w-4 h-4 text-blue-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-blue-600">{unread.length}</p>
            <p className="text-xs text-muted-foreground">Unread</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-red-50">
            <AlertTriangle className="w-4 h-4 text-red-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-red-600">{critical.length}</p>
            <p className="text-xs text-muted-foreground">Critical</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-amber-50">
            <CheckCircle2 className="w-4 h-4 text-amber-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-amber-600">{pendingAck.length}</p>
            <p className="text-xs text-muted-foreground">Ack Req.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}