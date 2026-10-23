import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import {
  Sunrise, Package, Truck, RotateCcw, AlertTriangle, Bell, CheckCircle2,
} from 'lucide-react';
import moment from 'moment';

const dateOnly = (d) => d ? String(d).split('T')[0] : '';

export default function NeedsAttention({
  wh105Status, transferSheets = [], consumableReqs = [], correctiveActions = [],
  equipment = [], materialReturns = [], tasks = [], notifications = [],
}) {
  const today = new Date().toLocaleDateString('en-CA');
  const items = [];

  // 1. Complete Morning Readiness
  if (wh105Status !== 'departed' && wh105Status !== 'ready') {
    items.push({
      icon: Sunrise, label: 'Complete Morning Readiness',
      sub: wh105Status === 'blocked' ? 'Blocking issues need resolution' : 'Finish WH-105 checklist steps',
      to: '/tech/readiness', color: 'text-amber-600', bg: 'bg-amber-50',
    });
  }

  // 2. Material Transfer Waiting
  const pendingTransfers = transferSheets.filter(t => !t.technician_received);
  if (pendingTransfers.length > 0) {
    items.push({
      icon: Package, label: `${pendingTransfers.length} Material Transfer${pendingTransfers.length > 1 ? 's' : ''} Waiting`,
      sub: 'Receive transfers before dispatch',
      to: '/warehouse/material-returns/new', color: 'text-indigo-600', bg: 'bg-indigo-50',
    });
  }

  // 3. Truck Inspection Required (equipment issues suggest truck inspection needed)
  const equipmentIssues = equipment.filter(e =>
    e.condition === 'damaged' || e.condition === 'lost' || e.condition === 'poor'
  );
  if (equipmentIssues.length > 0 && wh105Status !== 'departed') {
    items.push({
      icon: Truck, label: 'Truck Inspection Required',
      sub: `${equipmentIssues.length} equipment item${equipmentIssues.length > 1 ? 's' : ''} need attention`,
      to: '/tech/truck', color: 'text-orange-600', bg: 'bg-orange-50',
    });
  }

  // 4. Return Equipment
  const pendingReturns = materialReturns.filter(r =>
    r.status !== 'Completed' && r.status !== 'Closed' && r.status !== 'Cancelled'
  );
  const tempCheckouts = equipment.filter(e =>
    e.assignment_type === 'temporary' && !e.actual_return_datetime
  );
  if (pendingReturns.length > 0 || tempCheckouts.length > 0) {
    const count = pendingReturns.length + tempCheckouts.length;
    items.push({
      icon: RotateCcw, label: 'Return Equipment',
      sub: `${count} item${count > 1 ? 's' : ''} pending return`,
      to: '/warehouse/material-returns', color: 'text-purple-600', bg: 'bg-purple-50',
    });
  }

  // 5. Overdue Task
  const overdueTasks = tasks.filter(t =>
    t.status === 'Overdue' ||
    (t.due_date && dateOnly(t.due_date) < today && t.status !== 'Completed' && t.status !== 'Cancelled')
  );
  if (overdueTasks.length > 0) {
    items.push({
      icon: AlertTriangle, label: `${overdueTasks.length} Overdue Task${overdueTasks.length > 1 ? 's' : ''}`,
      sub: overdueTasks[0]?.title || 'Review and complete',
      to: '/tasks/my-tasks', color: 'text-red-600', bg: 'bg-red-50',
    });
  }

  // 6. Critical Notification
  const criticalNotifs = notifications.filter(n =>
    !n.is_archived &&
    n.status !== 'Read' &&
    n.status !== 'Acknowledged' &&
    n.status !== 'Cancelled' &&
    n.status !== 'Expired' &&
    (n.priority === 'Critical' || n.priority === 'High')
  );
  if (criticalNotifs.length > 0) {
    items.push({
      icon: Bell, label: `${criticalNotifs.length} Critical Notification${criticalNotifs.length > 1 ? 's' : ''}`,
      sub: criticalNotifs[0]?.title || 'Review required',
      to: '/notifications/my', color: 'text-red-600', bg: 'bg-red-50',
    });
  }

  // 7. Open Corrective Actions
  const openCorrective = correctiveActions.filter(c =>
    c.status === 'Open' || c.status === 'In Progress' || c.status === 'Overdue'
  );
  if (openCorrective.length > 0) {
    items.push({
      icon: AlertTriangle, label: `${openCorrective.length} Corrective Action${openCorrective.length > 1 ? 's' : ''}`,
      sub: 'Open items need resolution',
      to: '/audits/corrective-actions', color: 'text-red-600', bg: 'bg-red-50',
    });
  }

  return (
    <Card className="border-0 shadow-sm h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Needs My Attention
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-sm font-medium text-green-700">All clear — ready to work!</p>
            <p className="text-xs text-muted-foreground">No pending actions for today</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, i) => (
              <Link key={i} to={item.to}>
                <div className="flex items-start gap-3 p-2.5 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center flex-shrink-0`}>
                    <item.icon className={`w-4 h-4 ${item.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.sub}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}