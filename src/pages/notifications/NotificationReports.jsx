import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart3, Bell, AlertTriangle, CheckCircle2, Clock, Ban, Building2, Monitor, Type,
} from 'lucide-react';
import {
  NOTIFICATION_TYPES, NOTIFICATION_TYPE_COLORS,
} from '@/lib/notificationConstants';

export default function NotificationReports() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.EnterpriseNotification.list('-created_date', 500)
      .then(setNotifications)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  const active = notifications.filter(n => n.status !== 'Cancelled');
  const unread = active.filter(n => n.status === 'Sent' || n.status === 'Delivered' || n.status === 'Pending');
  const critical = active.filter(n => n.priority === 'Critical' || n.notification_type === 'Critical');
  const expired = active.filter(n => n.status === 'Expired');
  const acknowledged = active.filter(n => n.status === 'Acknowledged');

  // Average read time
  const readTimes = notifications
    .filter(n => n.read_date && n.sent_date)
    .map(n => (new Date(n.read_date) - new Date(n.sent_date)) / (1000 * 60));
  const avgReadTime = readTimes.length > 0 ? (readTimes.reduce((a, b) => a + b, 0) / readTimes.length).toFixed(0) : 0;

  // Average acknowledgment time
  const ackTimes = notifications
    .filter(n => n.acknowledged_date && n.sent_date)
    .map(n => (new Date(n.acknowledged_date) - new Date(n.sent_date)) / (1000 * 60));
  const avgAckTime = ackTimes.length > 0 ? (ackTimes.reduce((a, b) => a + b, 0) / ackTimes.length).toFixed(0) : 0;

  const byDept = {};
  active.forEach(n => { const d = n.recipient_department || n.related_department || 'Unassigned'; byDept[d] = (byDept[d] || 0) + 1; });
  const bySource = {};
  active.forEach(n => { const s = n.source_module || 'Unknown'; bySource[s] = (bySource[s] || 0) + 1; });
  const byType = {};
  active.forEach(n => { byType[n.notification_type] = (byType[n.notification_type] || 0) + 1; });

  const kpis = [
    { label: 'Total', value: notifications.length, icon: BarChart3, color: 'bg-blue-100 text-blue-600' },
    { label: 'Unread', value: unread.length, icon: Bell, color: 'bg-cyan-100 text-cyan-600' },
    { label: 'Critical', value: critical.length, icon: AlertTriangle, color: 'bg-red-100 text-red-600' },
    { label: 'Acknowledged', value: acknowledged.length, icon: CheckCircle2, color: 'bg-green-100 text-green-600' },
    { label: 'Expired', value: expired.length, icon: Ban, color: 'bg-gray-100 text-gray-600' },
    { label: 'Avg Read Time (min)', value: avgReadTime, icon: Clock, color: 'bg-purple-100 text-purple-600' },
    { label: 'Avg Ack Time (min)', value: avgAckTime, icon: CheckCircle2, color: 'bg-amber-100 text-amber-600' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notification Reports</h1>
        <p className="text-muted-foreground text-sm">Analytics across all enterprise notifications.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${kpi.color}`}><kpi.icon className="w-4 h-4" /></div>
              <p className="text-2xl font-bold">{kpi.value}</p>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Building2 className="w-4 h-4 text-accent" /> By Department</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {Object.entries(byDept).sort((a, b) => b[1] - a[1]).map(([dept, count]) => (
              <div key={dept} className="flex justify-between text-sm px-2 py-1">
                <span className="truncate">{dept}</span><span className="font-medium">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Monitor className="w-4 h-4 text-accent" /> By Source Module</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([src, count]) => (
              <div key={src} className="flex justify-between text-sm px-2 py-1">
                <span className="truncate text-xs">{src}</span><span className="font-medium">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Type className="w-4 h-4 text-accent" /> Most Common Types</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {NOTIFICATION_TYPES.filter(t => byType[t]).sort((a, b) => byType[b] - byType[a]).map(type => (
              <div key={type} className="flex justify-between items-center text-sm px-2 py-1">
                <span className={`px-2 py-0.5 rounded text-xs font-medium border ${NOTIFICATION_TYPE_COLORS[type] || ''}`}>{type}</span>
                <span className="font-bold">{byType[type]}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-accent" /> Critical & Expired</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm px-2 py-1">
              <span className="text-red-600 font-medium">Critical Notifications</span><span className="font-bold text-red-600">{critical.length}</span>
            </div>
            <div className="flex justify-between text-sm px-2 py-1">
              <span className="text-gray-600 font-medium">Expired Notifications</span><span className="font-bold text-gray-600">{expired.length}</span>
            </div>
            <div className="flex justify-between text-sm px-2 py-1 border-t pt-1 mt-1">
              <span className="text-muted-foreground">Acknowledgment Rate</span>
              <span className="font-bold">{active.filter(n => n.requires_acknowledgment).length > 0 ? Math.round((acknowledged.filter(n => n.requires_acknowledgment).length / active.filter(n => n.requires_acknowledgment).length) * 100) : 0}%</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}