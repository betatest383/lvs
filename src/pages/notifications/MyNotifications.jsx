import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Bell, AlertTriangle, Clock, CheckCircle2, Archive, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import NotificationCard from '@/components/notifications/NotificationCard';
import { useMyNotifications } from '@/hooks/useMyNotifications';
import { isUnread, isCritical, isToday, requiresAction, isApproval } from '@/lib/notificationConstants';

const FILTERS = [
  { key: 'all', label: 'All', icon: Bell },
  { key: 'unread', label: 'Unread', icon: Bell },
  { key: 'critical', label: 'Critical', icon: AlertTriangle },
  { key: 'today', label: 'Today', icon: Clock },
  { key: 'approvals', label: 'Approvals', icon: CheckCircle2 },
  { key: 'ack', label: 'Acknowledgment Required', icon: CheckCircle2 },
];

export default function MyNotifications() {
  const [filter, setFilter] = useState('all');
  const { filteredNotifications: notifications, loading, refetch } = useMyNotifications();
  const navigate = useNavigate();

  const filtered = notifications.filter((n) => {
    if (filter === 'all') return true;
    if (filter === 'unread') return isUnread(n);
    if (filter === 'critical') return isCritical(n);
    if (filter === 'today') return isToday(n);
    if (filter === 'approvals') return isApproval(n);
    if (filter === 'ack') return requiresAction(n);
    return true;
  });

  const handleAcknowledge = async (n) => {
    try {
      const response = await base44.functions.invoke('manageNotification', {
        action: 'acknowledge',
        notificationId: n.id,
        response: 'acknowledged',
      });
      if (response.data?.success) {
        toast.success('Notification acknowledged');
        refetch();
      } else {
        toast.error(response.data?.error || 'Failed to acknowledge');
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to acknowledge');
    }
  };

  const handleArchive = async (n) => {
    try {
      const response = await base44.functions.invoke('manageNotification', {
        action: 'archive',
        notificationId: n.id,
      });
      if (response.data?.success) {
        toast.success('Notification archived');
        refetch();
      } else {
        toast.error(response.data?.error || 'Failed to archive');
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to archive');
    }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Notifications</h1>
        <p className="text-muted-foreground text-sm">Notifications assigned to you, your role, or your department.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors select-none ${
              filter === f.key ? 'bg-accent text-accent-foreground' : 'bg-muted hover:bg-muted/70'
            }`}
          >
            <f.icon className="w-3.5 h-3.5" />
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground"><Inbox className="w-8 h-8 mx-auto mb-2" /> No notifications in this category.</CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((n) => (
            <NotificationCard
              key={n.id}
              notification={n}
              onClick={(n) => navigate(`/notifications/detail/${n.id}`)}
              onAcknowledge={handleAcknowledge}
              onArchive={handleArchive}
            />
          ))}
        </div>
      )}
    </div>
  );
}