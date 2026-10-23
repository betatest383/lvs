import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserPlus, CheckCircle2, AlertTriangle, ChevronRight } from 'lucide-react';
import {
  ONBOARDING_PHASES, PHASE_FIELDS, ONBOARDING_STATUS_COLORS,
  parseJSON, calcCompletionPct,
} from '@/lib/onboardingConstants';

export default function EmployeeOnboardingTab({ employee }) {
  const [onboarding, setOnboarding] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employee?.employee_id && !employee?.email) return;
    base44.entities.EmployeeOnboarding.list('-created_date', 500)
      .then(records => {
        const found = records.find(r =>
          r.employee_id === employee.employee_id ||
          r.employee_email === employee.email ||
          r.employee_name === `${employee.first_name} ${employee.last_name}`,
        );
        setOnboarding(found || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [employee]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading onboarding...</p>;

  if (!onboarding) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <UserPlus className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-3">No onboarding record found for this employee.</p>
          <Link to="/lvcos/onboarding/registry">
            <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">Start Onboarding</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const pct = onboarding.overall_completion_pct || calcCompletionPct(onboarding);
  const tasks = parseJSON(onboarding.tasks, []);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold">{onboarding.onboarding_id}</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ONBOARDING_STATUS_COLORS[onboarding.status] || ''}`}>{onboarding.status}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">Role: {onboarding.primary_role} • Supervisor: {onboarding.supervisor || '—'}</p>
              {onboarding.start_date && <p className="text-sm text-muted-foreground">Start: {onboarding.start_date}</p>}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">{pct}%</p>
              <div className="w-32 h-2 bg-muted rounded-full overflow-hidden mt-1">
                <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid sm:grid-cols-2 gap-2">
        {ONBOARDING_PHASES.map(p => {
          const items = parseJSON(onboarding[PHASE_FIELDS[p.phase]], []);
          const completed = items.filter(i => i.completed).length;
          const phasePct = items.length > 0 ? Math.round((completed / items.length) * 100) : 0;
          const isComplete = phasePct === 100 && items.length > 0;
          return (
            <Card key={p.phase}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{p.phase}. {p.name}</span>
                  {isComplete
                    ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                    : <AlertTriangle className="w-4 h-4 text-amber-500" />}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: `${phasePct}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground">{completed}/{items.length}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold mb-2">Upcoming Tasks</h4>
          {tasks.filter(t => t.status !== 'complete').length === 0 ? (
            <p className="text-sm text-muted-foreground">All tasks complete.</p>
          ) : (
            <div className="space-y-1">
              {tasks.filter(t => t.status !== 'complete').slice(0, 5).map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{t.department}</span>
                  <span>{t.task}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{t.status}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Link to={`/lvcos/onboarding/detail/${onboarding.id}`}>
        <Button variant="outline" size="sm" className="w-full">
          Open Full Onboarding Wizard <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </Link>
    </div>
  );
}