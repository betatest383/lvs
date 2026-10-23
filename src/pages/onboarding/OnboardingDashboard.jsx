import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  UserPlus, Clock, CheckCircle2, AlertTriangle, GraduationCap,
  Award, Shield, Package, Monitor, ClipboardCheck, Plus, Calendar,
} from 'lucide-react';
import {
  ONBOARDING_STATUS_COLORS, parseJSON,
} from '@/lib/onboardingConstants';

export default function OnboardingDashboard() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.EmployeeOnboarding.list('-created_date', 500)
      .then(setRecords)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  const startingSoon = records.filter(r => r.status === 'Planned');
  const inProgress = records.filter(r => r.status === 'In Progress');
  const completed = records.filter(r => r.status === 'Completed');
  const avgPct = records.length > 0
    ? Math.round(records.reduce((sum, r) => sum + (r.overall_completion_pct || 0), 0) / records.length)
    : 0;

  let missingTraining = 0, missingCerts = 0, unsignedPolicies = 0, equipmentWaiting = 0, softwarePending = 0, reviewsDue = 0;
  records.forEach(r => {
    missingTraining += parseJSON(r.phase3_training, []).filter(t => !t.completed).length;
    missingCerts += parseJSON(r.phase5_certifications, []).filter(c => !c.completed).length;
    unsignedPolicies += parseJSON(r.phase4_policies, []).filter(p => !p.completed).length;
    equipmentWaiting += parseJSON(r.phase6_equipment, []).filter(e => !e.completed).length;
    softwarePending += parseJSON(r.phase2_system_setup, []).filter(s => !s.completed && s.label?.includes('Software')).length;
    reviewsDue += parseJSON(r.phase9_reviews, []).filter(rv => !rv.completed).length;
  });

  const kpis = [
    { label: 'Starting Soon', value: startingSoon.length, icon: Calendar, to: '/lvcos/onboarding/registry', color: 'bg-blue-100 text-blue-600' },
    { label: 'In Progress', value: inProgress.length, icon: Clock, to: '/lvcos/onboarding/registry', color: 'bg-amber-100 text-amber-600' },
    { label: 'Completed', value: completed.length, icon: CheckCircle2, to: '/lvcos/onboarding/registry', color: 'bg-green-100 text-green-600' },
    { label: 'Avg Completion', value: `${avgPct}%`, icon: UserPlus, to: '/lvcos/onboarding/reports', color: 'bg-purple-100 text-purple-600' },
    { label: 'Missing Training', value: missingTraining, icon: GraduationCap, to: '/lvcos/onboarding/reports', color: 'bg-orange-100 text-orange-600' },
    { label: 'Missing Certs', value: missingCerts, icon: Award, to: '/lvcos/onboarding/reports', color: 'bg-red-100 text-red-600' },
    { label: 'Unsigned Policies', value: unsignedPolicies, icon: Shield, to: '/lvcos/onboarding/reports', color: 'bg-yellow-100 text-yellow-700' },
    { label: 'Equipment Waiting', value: equipmentWaiting, icon: Package, to: '/lvcos/onboarding/reports', color: 'bg-cyan-100 text-cyan-600' },
    { label: 'Software Pending', value: softwarePending, icon: Monitor, to: '/lvcos/onboarding/reports', color: 'bg-indigo-100 text-indigo-600' },
    { label: 'Reviews Due', value: reviewsDue, icon: ClipboardCheck, to: '/lvcos/onboarding/reports', color: 'bg-pink-100 text-pink-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employee Onboarding Dashboard</h1>
          <p className="text-muted-foreground text-sm">Guided onboarding powered by LVC OS registries.</p>
        </div>
        <Link to="/lvcos/onboarding/registry">
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="w-4 h-4 mr-2" /> New Onboarding</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" /> Starting Soon</h3>
            {startingSoon.length === 0 ? (
              <p className="text-sm text-muted-foreground">No employees starting soon.</p>
            ) : (
              <div className="space-y-1">
                {startingSoon.slice(0, 6).map(r => (
                  <Link key={r.id} to={`/lvcos/onboarding/detail/${r.id}`} className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                    <span className="truncate">{r.employee_name}</span>
                    <span className="text-xs text-blue-600">{r.start_date || 'No date'}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-muted-foreground" /> In Progress</h3>
            {inProgress.length === 0 ? (
              <p className="text-sm text-muted-foreground">No onboarding in progress.</p>
            ) : (
              <div className="space-y-1">
                {inProgress.slice(0, 6).map(r => (
                  <Link key={r.id} to={`/lvcos/onboarding/detail/${r.id}`} className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                    <span className="truncate">{r.employee_name}</span>
                    <span className="text-xs font-medium">{r.overall_completion_pct || 0}%</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-muted-foreground" /> Needs Attention</h3>
          {records.filter(r => r.status !== 'Completed' && r.status !== 'Cancelled').length === 0 ? (
            <p className="text-sm text-muted-foreground">All onboarding records are complete.</p>
          ) : (
            <div className="space-y-1">
              {records.filter(r => r.status !== 'Completed' && r.status !== 'Cancelled').slice(0, 8).map(r => {
                const pct = r.overall_completion_pct || 0;
                return (
                  <Link key={r.id} to={`/lvcos/onboarding/detail/${r.id}`} className="flex items-center justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                    <span className="truncate">{r.employee_name}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-medium w-8 text-right">{pct}%</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}