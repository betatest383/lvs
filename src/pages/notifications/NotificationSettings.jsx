import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings, Bell, Shield, Users, Send, Check } from 'lucide-react';
import {
  NOTIFICATION_TYPES, NOTIFICATION_PRIORITIES, NOTIFICATION_STATUSES,
  DELIVERY_METHODS, DELIVERY_METHOD_STATUS, PERMISSIONS,
  NOTIFICATION_TYPE_COLORS, PRIORITY_COLORS, NOTIFICATION_STATUS_COLORS,
} from '@/lib/notificationConstants';

export default function NotificationSettings() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notification Settings</h1>
        <p className="text-muted-foreground text-sm">Configuration and reference for the Enterprise Notification Center.</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Send className="w-4 h-4 text-accent" /> Delivery Methods</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {DELIVERY_METHODS.map(method => {
            const status = DELIVERY_METHOD_STATUS[method];
            return (
              <div key={method} className="flex items-center justify-between text-sm p-2 rounded bg-muted/30">
                <span className="font-medium">{method}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${status.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                  {status.active ? '✓ Active' : status.label}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4 text-accent" /> Permission Matrix</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-medium">Role</th>
                  <th className="text-left py-2 px-2 font-medium">Can View</th>
                  <th className="text-left py-2 px-2 font-medium">Acknowledge</th>
                  <th className="text-left py-2 px-2 font-medium">Create</th>
                  <th className="text-left py-2 px-2 font-medium">Manage</th>
                </tr>
              </thead>
              <tbody>
                {PERMISSIONS.map(p => (
                  <tr key={p.role} className="border-b last:border-0">
                    <td className="py-2 px-2 font-medium">{p.role}</td>
                    <td className="py-2 px-2 text-muted-foreground">{p.canView}</td>
                    <td className="py-2 px-2 text-muted-foreground">{p.canAcknowledge}</td>
                    <td className="py-2 px-2 text-muted-foreground">{p.canCreate}</td>
                    <td className="py-2 px-2 text-muted-foreground">{p.canManage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Bell className="w-4 h-4 text-accent" /> Notification Types ({NOTIFICATION_TYPES.length})</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {NOTIFICATION_TYPES.map(t => <span key={t} className={`px-2 py-0.5 rounded-full text-xs font-medium border ${NOTIFICATION_TYPE_COLORS[t] || ''}`}>{t}</span>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Settings className="w-4 h-4 text-accent" /> Priorities ({NOTIFICATION_PRIORITIES.length})</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {NOTIFICATION_PRIORITIES.map(p => <span key={p} className={`px-2 py-0.5 rounded-full text-xs font-medium border ${PRIORITY_COLORS[p] || ''}`}>{p}</span>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Check className="w-4 h-4 text-accent" /> Statuses ({NOTIFICATION_STATUSES.length})</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {NOTIFICATION_STATUSES.map(s => <span key={s} className={`px-2 py-0.5 rounded-full text-xs font-medium ${NOTIFICATION_STATUS_COLORS[s] || ''}`}>{s}</span>)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><Users className="w-4 h-4 text-accent" /> Architecture</h3>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>• Every LVC OS module creates events — no hardcoded notification logic in individual modules.</p>
            <p>• The Notification Center determines: who receives, priority, delivery, escalation, acknowledgment, and history.</p>
            <p>• Recipient targeting supports: specific email, role-based, department-based, and broadcast.</p>
            <p>• Notifications requiring acknowledgment track: employee, date, time, and electronic confirmation.</p>
            <p>• Escalation levels automatically increase for unacknowledged critical notifications.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}