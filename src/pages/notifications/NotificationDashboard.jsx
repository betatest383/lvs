import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Bell, AlertTriangle, Clock, CheckCircle2, Ban, Plus, Building2, Monitor,
} from 'lucide-react';
import {
  NOTIFICATION_TYPE_COLORS, isUnread, isCritical, isToday, requiresAction,
} from '@/lib/notificationConstants';

export default function NotificationDashboard() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.EnterpriseNotification.list('-created_date', 500)
      .then(setNotifications)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  const active = notifications.filter(n => n.status !== 'Cancelled' && !n.is_archived);
  const unread = active.filter(isUnread);
  const critical = active.filter(isCritical);
  const today = active.filter(isToday);
  const ackRequired = active.filter(requiresAction);
  const pending = active.filter(n => n.status === 'Pending');
  const failed = active.filter(n => n.notification_type === 'Failure' || n.status === 'Expired');

  const byDept = {};
  active.forEach(n => { const d = n.recipient_department || n.related_department || 'Unassigned'; byDept[d] = (byDept[d] || 0) + 1; });
  const bySource = {};
  active.forEach(n => { const s = n.source_module || 'Unknown'; bySource[s] = (bySource[s] || 0) + 1; });

  const kpis = [
    { label: 'Unread', value: unread.length, icon: Bell, to: '/notifications/my', color: 'bg-blue-100 text-blue-600' },
    { label: 'Critical', value: critical.length, icon: AlertTriangle, to: '/notifications/center', color: 'bg-red-100 text-red-600' },
    { label: 'Today', value: today.length, icon: Clock, to: '/notifications/history', color: 'bg-purple-100 text-purple-600' },
    { label: 'Acknowledgments Required', value: ackRequired.length, icon: CheckCircle2, to: '/notifications/my', color: 'bg-amber-100 text-amber-600' },
    { label: 'Pending', value: pending.length, icon: Clock, to: '/notifications/center', color: 'bg-cyan-100 text-cyan-600' },
    { label: 'Failed / Expired', value: failed.length, icon: Ban, to: '/notifications/reports', color: 'bg-pink-100 text-pink-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notification Dashboard</h1>
          <p className="text-muted-foreground text-sm">Central notification service for all LVC OS modules.</p>
        </div>
        <Link to="/notifications/center">
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="w-4 h-4 mr-2" /> Create Notification</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {kpis.map((kpi, i) => (
          <Link key={i} to={kpi.to}>
            <Card className="hover:shadow-md transition-shadow h-full">
              <CardContent className="p-4">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${kpi.color}`}>
                  <kpi.icon className="w-4 h-4" />
                </div>
                <p className="text-2xl font-bold">{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /> By Department</h3>
            {Object.keys(byDept).length === 0 ? <p className="text-sm text-muted-foreground">No notifications.</p> : (
              <div className="space-y-1">
                {Object.entries(byDept).sort((a, b) => b[1] - a[1]).map(([dept, count]) => (
                  <Link key={dept} to="/notifications/center" className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                    <span className="truncate">{dept}</span><span className="font-medium">{count}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Monitor className="w-4 h-4 text-muted-foreground" /> By Source Module</h3>
            {Object.keys(bySource).length === 0 ? <p className="text-sm text-muted-foreground">No notifications.</p> : (
              <div className="space-y-1">
                {Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([src, count]) => (
                  <div key={src} className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                    <span className="truncate text-xs">{src}</span><span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}