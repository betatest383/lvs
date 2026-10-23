import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Bell, Clock, CheckCircle2, Shield } from 'lucide-react';
import {
  isUnread, isCritical, requiresAction, isApproval,
} from '@/lib/notificationConstants';

export default function CompanyNotificationsWidget() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.EnterpriseNotification.list('-created_date', 200)
      .then(setNotifications)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Card><CardContent className="p-4"><div className="w-6 h-6 border-2 border-muted border-t-accent rounded-full animate-spin mx-auto" /></CardContent></Card>;

  const active = notifications.filter(n => n.status !== 'Cancelled' && n.status !== 'Expired' && !n.is_archived);
  const unread = active.filter(isUnread);
  const critical = active.filter(isCritical);
  const pendingAck = active.filter(requiresAction);
  const systemAlerts = active.filter(n => n.notification_type === 'System' || n.notification_type === 'Failure');
  const approvals = active.filter(isApproval);

  const stats = [
    { label: 'Critical', value: critical.length, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Unread', value: unread.length, icon: Bell, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Pending Ack', value: pendingAck.length, icon: CheckCircle2, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'System Alerts', value: systemAlerts.length, icon: Shield, color: 'text-slate-600', bg: 'bg-slate-50' },
    { label: 'Approvals', value: approvals.length, icon: Clock, color: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Bell className="w-4 h-4 text-accent" /> Company Notifications</h3>
          <Link to="/notifications" className="text-xs text-accent hover:underline">View All</Link>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {stats.map((s, i) => (
            <div key={i} className="text-center">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-1 ${s.bg}`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <p className="text-lg font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}