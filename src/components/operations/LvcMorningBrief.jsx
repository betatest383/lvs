import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useOperationsData, getHealthColor, getStatusColor } from '@/hooks/useOperationsData';
import {
  Sun, Star, AlertTriangle, CheckSquare, CalendarClock, ArrowRight,
  TrendingUp, TrendingDown, Sparkles, Warehouse, Briefcase, Users, Truck, Zap, Database, KanbanSquare
} from 'lucide-react';

function MetricRow({ label, value, goal, trend }) {
  const isPositive = trend === 'up';
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{value}</span>
        {trend && (
          isPositive
            ? <TrendingUp className="w-3.5 h-3.5 text-green-500" />
            : <TrendingDown className="w-3.5 h-3.5 text-red-500" />
        )}
      </div>
    </div>
  );
}

export default function LvcMorningBrief() {
  const { data, loading } = useOperationsData();
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  if (loading || !data) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const firstName = user?.full_name?.split(' ')[0] || 'there';
  const healthColor = getHealthColor(data.healthScore);
  const topIssues = data.issues.slice(0, 5);

  const healthNarrative = data.healthScore >= 80
    ? `Operations are running smoothly with no major disruptions. ${topIssues.length} item${topIssues.length !== 1 ? 's' : ''} require attention before technicians depart.`
    : data.healthScore >= 60
    ? `Operations are functional but several areas need attention. ${topIssues.length} issue${topIssues.length !== 1 ? 's' : ''} should be addressed.`
    : `Critical issues detected. ${topIssues.length} item${topIssues.length !== 1 ? 's' : ''} require immediate attention.`;

  const priorities = [
    { text: 'Release all warehouse trucks before 7:30 AM', done: data.warehouseReadiness >= 80 },
    { text: 'Review customer escalation for Smith residence', done: false },
    { text: 'Approve purchase order #1045', done: false },
    { text: 'Complete payroll review', done: false },
    { text: 'Follow up on yesterday\'s callback', done: false },
  ];

  const upcomingDeadlines = data.overdueReviews.slice(0, 5).map(s => ({
    label: `${s.sop_id} — ${s.title}`,
    type: 'SOP Review',
    date: s.next_review_date,
  }));
  upcomingDeadlines.push(
    { label: 'Q3 Safety Meeting', type: 'Safety Meeting', date: null },
    { label: 'Monthly Inventory Count', type: 'Inventory Count', date: null },
  );

  const wins = [
    'Customer satisfaction reached 98%.',
    'Warehouse departed on time yesterday.',
    'Inventory accuracy exceeded 99%.',
    'No safety incidents this week.',
  ];

  const risks = [
    { label: 'Low inventory on 8" liner', level: 'high' },
    { label: 'Callback trend increasing', level: 'medium' },
    { label: 'Technician shortage on Friday', level: 'medium' },
  ];

  const quickActions = [
    { label: 'Operations Center', path: '/operations', icon: Database },
    { label: 'Warehouse', path: '/warehouse', icon: Warehouse },
    { label: 'Dispatch', path: '/admin/jobs', icon: Briefcase },
    { label: 'KPI Dashboard', path: '/lvcos/kpi-registry', icon: KanbanSquare },
    { label: 'Customer Escalations', path: '/admin/customers', icon: Users },
    { label: 'Review SOPs', path: '/lvcos/sop-registry', icon: CheckSquare },
  ];

  const insights = [
    'Warehouse departures averaged 18 minutes longer today.',
    'Inventory count accuracy dropped this week.',
    'Three technicians are behind on training.',
  ];

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Greeting */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
          <Sun className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Good morning, {firstName}.</h1>
          <p className="text-sm text-muted-foreground">Today is {dateStr}. There are <span className="font-semibold text-foreground">{data.jobsScheduledToday}</span> scheduled jobs today.</p>
        </div>
      </div>

      {/* Company Health */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <span className={`w-3 h-3 rounded-full ${healthColor.dot}`} />
            <span className="text-sm font-semibold">Company Health: {data.healthScore}%</span>
          </div>
          <p className="text-sm text-muted-foreground">{healthNarrative}</p>
        </CardContent>
      </Card>

      {/* Today's Overview */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold mb-3">Today's Overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Jobs Scheduled', value: data.jobsScheduledToday },
              { label: 'Technicians Working', value: data.techniciansWorking },
              { label: 'Crews Available', value: data.crewsAvailable },
              { label: 'Trucks Ready', value: `${data.trucksReady}/${data.trucksTotal}` },
              { label: 'Warehouse Ready', value: `${data.warehouseReadiness}%` },
              { label: 'Dispatch Status', value: 'On Schedule' },
            ].map(item => (
              <div key={item.label} className="rounded-lg bg-muted/40 p-2.5">
                <p className="text-lg font-bold leading-none">{item.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Yesterday's Performance */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold mb-2">Yesterday's Performance</h2>
          <MetricRow label="Revenue" value={`$${data.yesterday.revenue.toLocaleString()}`} goal={`$${data.goals.revenue.toLocaleString()}`} trend={data.yesterday.revenue >= data.goals.revenue ? 'up' : 'down'} />
          <MetricRow label="Average Ticket" value={`$${data.yesterday.averageTicket}`} goal={`$${data.goals.averageTicket}`} trend={data.yesterday.averageTicket >= data.goals.averageTicket ? 'up' : 'down'} />
          <MetricRow label="Close Rate" value={`${data.yesterday.closeRate}%`} goal={`${data.goals.closeRate}%`} trend={data.yesterday.closeRate >= data.goals.closeRate ? 'up' : 'down'} />
          <MetricRow label="Callbacks" value={data.yesterday.callbacks} goal={`< ${data.goals.callbacks}`} trend={data.yesterday.callbacks <= data.goals.callbacks ? 'up' : 'down'} />
          <MetricRow label="Customer Reviews" value={`${data.yesterday.customerReviews}★`} goal="4.5★" trend="up" />
          <MetricRow label="Training Completed" value={`${data.yesterday.trainingCompleted}%`} goal={`${data.goals.trainingCompletion}%`} trend={data.yesterday.trainingCompleted >= data.goals.trainingCompletion ? 'up' : 'down'} />
          <MetricRow label="Inventory Accuracy" value={`${data.yesterday.inventoryAccuracy}%`} goal={`${data.goals.inventoryAccuracy}%`} trend={data.yesterday.inventoryAccuracy >= data.goals.inventoryAccuracy ? 'up' : 'down'} />
          <MetricRow label="Truck Departure" value={data.yesterday.truckDepartureTime} goal={data.goals.truckDepartureTime} trend={data.yesterday.truckDepartureTime <= data.goals.truckDepartureTime ? 'up' : 'down'} />
        </CardContent>
      </Card>

      {/* Needs Attention */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" /> Needs Attention
          </h2>
          <div className="space-y-1.5">
            {topIssues.map((issue, i) => (
              <Link key={i} to={issue.link} className="flex items-center gap-2 text-sm hover:text-accent transition-colors">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${issue.severity === 'high' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                {issue.title}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Today's Priorities */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-accent" /> Today's Priorities
          </h2>
          <div className="space-y-1.5">
            {priorities.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className={`w-4 h-4 rounded border ${p.done ? 'bg-green-500 border-green-500' : 'border-muted-foreground/30'} flex items-center justify-center shrink-0`}>
                  {p.done && <CheckSquare className="w-3 h-3 text-white" />}
                </span>
                <span className={p.done ? 'text-muted-foreground line-through' : ''}>{p.text}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Deadlines */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-blue-500" /> Upcoming Deadlines
          </h2>
          <div className="space-y-1.5">
            {upcomingDeadlines.map((d, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="min-w-0 truncate">{d.label}</span>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">{d.type}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Wins */}
      <Card className="border-green-200 bg-green-50/50">
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Star className="w-4 h-4 text-green-500" /> Wins
          </h2>
          <div className="space-y-1.5">
            {wins.map((w, i) => (
              <p key={i} className="text-sm flex items-start gap-2">
                <span className="text-green-500">★★★★★</span>
                {w}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Business Risks */}
      <Card className="border-red-200 bg-red-50/30">
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" /> Business Risks
          </h2>
          <div className="space-y-1.5">
            {risks.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.level === 'high' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                {r.label}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {quickActions.map(a => (
              <Link key={a.label} to={a.path}>
                <Button variant="outline" size="sm" className="w-full justify-start text-xs">
                  <a.icon className="w-3.5 h-3.5 mr-1.5" /> {a.label}
                </Button>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Operational Insights */}
      <Card className="border-accent/30 bg-accent/5">
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" /> Operational Insights
          </h2>
          <div className="space-y-1.5">
            {insights.map((insight, i) => (
              <p key={i} className="text-sm flex items-start gap-2">
                <ArrowRight className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                {insight}
              </p>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2 italic">Future: AI-generated recommendations with predictive forecasting.</p>
        </CardContent>
      </Card>
    </div>
  );
}