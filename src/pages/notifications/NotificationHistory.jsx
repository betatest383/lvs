import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History, Filter } from 'lucide-react';
import NotificationCard from '@/components/notifications/NotificationCard';
import {
  NOTIFICATION_TYPE_COLORS, NOTIFICATION_STATUS_COLORS,
  isUnread, isCritical, requiresAction,
} from '@/lib/notificationConstants';

export default function NotificationHistory() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('all');

  useEffect(() => {
    base44.entities.EnterpriseNotification.list('-created_date', 500)
      .then(setNotifications)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  const now = new Date();
  const filtered = notifications.filter(n => {
    if (!n.created_date) return dateFilter === 'all';
    const created = new Date(n.created_date);
    const diffDays = (now - created) / (1000 * 60 * 60 * 24);
    if (dateFilter === 'today') return diffDays < 1;
    if (dateFilter === 'week') return diffDays < 7;
    if (dateFilter === 'month') return diffDays < 30;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notification History</h1>
          <p className="text-muted-foreground text-sm">Permanent chronological record of all notifications.</p>
        </div>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-40"><Filter className="w-3.5 h-3.5 mr-1" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">Last 7 Days</SelectItem>
            <SelectItem value="month">Last 30 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3"><p className="text-xl font-bold">{filtered.length}</p><p className="text-xs text-muted-foreground">Total</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xl font-bold text-blue-600">{filtered.filter(isUnread).length}</p><p className="text-xs text-muted-foreground">Unread</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xl font-bold text-red-600">{filtered.filter(isCritical).length}</p><p className="text-xs text-muted-foreground">Critical</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xl font-bold text-green-600">{filtered.filter(n => n.status === 'Acknowledged').length}</p><p className="text-xs text-muted-foreground">Acknowledged</p></CardContent></Card>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground"><History className="w-8 h-8 mx-auto mb-2" /> No notifications in this period.</CardContent></Card>
      ) : (
        <div className="space-y-1">
          {filtered.map(n => (
            <Link key={n.id} to={`/notifications/detail/${n.id}`} className="block">
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-3 flex items-center gap-3">
                  {isUnread(n) && <span className="w-2 h-2 rounded-full bg-accent shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{n.title}</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${NOTIFICATION_TYPE_COLORS[n.notification_type] || ''}`}>{n.notification_type}</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${NOTIFICATION_STATUS_COLORS[n.status] || ''}`}>{n.status}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {n.notification_id} • {n.source_module || 'Manual'} • {n.recipient_name || n.recipient_email || 'Broadcast'}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{n.created_date ? new Date(n.created_date).toLocaleString() : ''}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}