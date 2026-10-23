import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Clock, CheckCircle2, AlertTriangle, Users, Package, Monitor, ClipboardCheck } from 'lucide-react';
import { ONBOARDING_STATUS_COLORS, PHASE_FIELDS, parseJSON } from '@/lib/onboardingConstants';

const PHASE_NAMES = ['Pre-Hire', 'System Setup', 'Training', 'Policies', 'Certifications', 'Equipment', 'Fleet', 'Dept Training', 'Reviews'];

export default function OnboardingReports() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.EmployeeOnboarding.list('-created_date', 500)
      .then(setRecords)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  const active = records.filter(r => r.status === 'In Progress' || r.status === 'Planned');
  const avgPct = records.length > 0 ? Math.round(records.reduce((s, r) => s + (r.overall_completion_pct || 0), 0) / records.length) : 0;

  let trainingTotal = 0, trainingComplete = 0;
  let certTotal = 0, certComplete = 0;
  let policyTotal = 0, policySigned = 0;
  let equipTotal = 0, equipAssigned = 0;
  let swTotal = 0, swComplete = 0;
  let taskTotal = 0, taskComplete = 0;
  let review30Done = 0, review60Done = 0, review90Done = 0;
  let review30Total = 0, review60Total = 0, review90Total = 0;

  records.forEach(r => {
    const training = parseJSON(r.phase3_training, []);
    trainingTotal += training.length;
    trainingComplete += training.filter(t => t.completed).length;

    const certs = parseJSON(r.phase5_certifications, []);
    certTotal += certs.length;
    certComplete += certs.filter(c => c.completed).length;

    const policies = parseJSON(r.phase4_policies, []);
    policyTotal += policies.length;
    policySigned += policies.filter(p => p.completed).length;

    const equip = parseJSON(r.phase6_equipment, []);
    equipTotal += equip.length;
    equipAssigned += equip.filter(e => e.completed).length;

    const sw = parseJSON(r.phase2_system_setup, []);
    swTotal += sw.length;
    swComplete += sw.filter(s => s.completed).length;

    const tasks = parseJSON(r.tasks, []);
    taskTotal += tasks.length;
    taskComplete += tasks.filter(t => t.status === 'complete').length;

    const reviews = parseJSON(r.phase9_reviews, []);
    if (reviews[0]) { review30Total++; if (reviews[0].completed) review30Done++; }
    if (reviews[1]) { review60Total++; if (reviews[1].completed) review60Done++; }
    if (reviews[2]) { review90Total++; if (reviews[2].completed) review90Done++; }
  });

  const reportCards = [
    { title: 'Currently Onboarding', value: active.length, total: records.length, icon: Users, color: 'bg-blue-100 text-blue-600' },
    { title: 'Average Completion', value: `${avgPct}%`, total: null, icon: BarChart3, color: 'bg-purple-100 text-purple-600' },
    { title: 'Outstanding Tasks', value: taskComplete, total: taskTotal, icon: Clock, color: 'bg-amber-100 text-amber-600' },
    { title: 'Training Completion', value: trainingComplete, total: trainingTotal, icon: CheckCircle2, color: 'bg-green-100 text-green-600' },
    { title: 'Certification Compliance', value: certComplete, total: certTotal, icon: CheckCircle2, color: 'bg-cyan-100 text-cyan-600' },
    { title: 'Policy Acknowledgments', value: policySigned, total: policyTotal, icon: CheckCircle2, color: 'bg-indigo-100 text-indigo-600' },
    { title: 'Equipment Assigned', value: equipAssigned, total: equipTotal, icon: Package, color: 'bg-orange-100 text-orange-600' },
    { title: 'Software Provisioning', value: swComplete, total: swTotal, icon: Monitor, color: 'bg-pink-100 text-pink-600' },
  ];

  const reviewData = [
    { title: '30-Day Reviews', done: review30Done, total: review30Total },
    { title: '60-Day Reviews', done: review60Done, total: review60Total },
    { title: '90-Day Reviews', done: review90Done, total: review90Total },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Onboarding Reports</h1>
        <p className="text-muted-foreground text-sm">Compliance and progress metrics across all onboarding records.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {reportCards.map((rpt, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${rpt.color}`}>
                <rpt.icon className="w-4 h-4" />
              </div>
              <p className="text-2xl font-bold">{rpt.value}</p>
              <p className="text-xs text-muted-foreground">{rpt.title}</p>
              {typeof rpt.total === 'number' && rpt.total > 0 && (
                <p className="text-xs text-muted-foreground mt-1">of {rpt.total}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-accent" /> 30/60/90 Day Reviews</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reviewData.map((rv, i) => {
              const pct = rv.total > 0 ? Math.round((rv.done / rv.total) * 100) : 0;
              return (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{rv.title}</span>
                    <span className="font-medium">{rv.done}/{rv.total}</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Outstanding Items by Phase</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {Object.entries(PHASE_FIELDS).map(([phase, field]) => {
              const phaseNum = Number(phase);
              let incomplete = 0;
              records.forEach(r => {
                incomplete += parseJSON(r[field], []).filter(i => !i.completed).length;
              });
              return (
                <div key={phase} className="flex justify-between text-sm py-1 border-b last:border-0">
                  <span className="text-muted-foreground">Phase {phase}: {PHASE_NAMES[phaseNum - 1]}</span>
                  <span className="font-medium text-amber-600">{incomplete} pending</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">All Onboarding Records</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {records.map(r => (
              <Link key={r.id} to={`/lvcos/onboarding/detail/${r.id}`} className="flex items-center justify-between text-sm hover:bg-muted/50 rounded px-2 py-1.5 transition-colors">
                <span className="font-medium truncate">{r.employee_name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{r.primary_role}</span>
                  <span className={`px-1.5 py-0.5 rounded text-xs ${ONBOARDING_STATUS_COLORS[r.status] || ''}`}>{r.status}</span>
                  <span className="text-xs font-bold w-8 text-right">{r.overall_completion_pct || 0}%</span>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}