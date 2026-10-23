import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Truck, CheckCircle2, AlertTriangle, Clock, ShieldCheck, TrendingUp, RotateCcw } from 'lucide-react';
import { STATUS_CONFIG } from '@/lib/wh105Constants';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import DeveloperResetDialog from '@/components/wh105/DeveloperResetDialog';

const DEV_RESET_ROLES = ['owner', 'admin', 'director_of_operations'];

const dateOnly = (d) => d ? String(d).split('T')[0] : '';
const today = () => new Date().toLocaleDateString('en-CA');

const formatTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

export default function MorningDepartureDashboard() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resetOpen, setResetOpen] = useState(false);
  const { user } = useAuth();

  const canDevReset = user && DEV_RESET_ROLES.includes(user.role);

  useEffect(() => {
    const t = today();
    base44.entities.Wh105DepartureCheck.filter({ date: t }, '-updated_date', 200)
      .then(recs => setRecords(recs || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleResetComplete = () => {
    setLoading(true);
    const t = today();
    base44.entities.Wh105DepartureCheck.filter({ date: t }, '-updated_date', 200)
      .then(recs => setRecords(recs || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const departed = records.filter(r => r.departed);
  const ready = records.filter(r => !r.departed && r.overall_status === 'ready');
  const blocked = records.filter(r => !r.departed && r.overall_status === 'blocked');
  const inProgress = records.filter(r => !r.departed && (r.overall_status === 'in_progress' || r.overall_status === 'waiting'));

  const departureTimes = departed.map(r => new Date(r.departure_timestamp));
  const avgDeparture = departureTimes.length > 0
    ? new Date(departureTimes.reduce((s, d) => s + d.getTime(), 0) / departureTimes.length)
    : null;

  const lateDepartures = departed.filter(r => {
    const h = new Date(r.departure_timestamp).getHours();
    return h >= 8;
  });

  const allOverrides = records.flatMap(r => {
    let ov = [];
    try { ov = JSON.parse(r.manager_overrides || '[]'); } catch {}
    return ov.map(o => ({ ...o, technician: r.technician_name, truck_number: r.truck_number }));
  });

  const blockingCounts = {};
  records.forEach(r => {
    let issues = [];
    try { issues = JSON.parse(r.blocking_issues_detail || '[]'); } catch {}
    issues.forEach(i => {
      blockingCounts[i.label] = (blockingCounts[i.label] || 0) + 1;
    });
  });

  const kpis = [
    { label: 'Ready', value: ready.length, icon: CheckCircle2, color: 'bg-green-100 text-green-600' },
    { label: 'Blocked', value: blocked.length, icon: AlertTriangle, color: 'bg-red-100 text-red-600' },
    { label: 'Departed', value: departed.length, icon: Truck, color: 'bg-blue-100 text-blue-600' },
    { label: 'In Progress', value: inProgress.length, icon: Clock, color: 'bg-amber-100 text-amber-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Morning Departure Dashboard</h1>
          <p className="text-sm text-muted-foreground">WH-105 — Technician departure gate overview</p>
        </div>
        {canDevReset && (
          <button
            onClick={() => setResetOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 transition-colors select-none"
          >
            <RotateCcw className="w-4 h-4" />
            Developer Reset Morning
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${kpi.color}`}>
                <kpi.icon className="w-4 h-4" />
              </div>
              <p className="text-2xl font-bold">{kpi.value}</p>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Average Departure Time</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{avgDeparture ? formatTime(avgDeparture.toISOString()) : '—'}</p>
            <p className="text-xs text-muted-foreground">{departed.length} truck(s) departed today</p>
          </CardContent>
        </Card>
        <Card className={lateDepartures.length > 0 ? 'border-amber-300' : ''}>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Late Departures</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{lateDepartures.length}</p>
            <p className="text-xs text-muted-foreground">Departed after 8:00 AM</p>
          </CardContent>
        </Card>
        <Card className={allOverrides.length > 0 ? 'border-purple-300' : ''}>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-purple-600" /> Manager Overrides Today</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{allOverrides.length}</p>
            <p className="text-xs text-muted-foreground">{allOverrides.length > 0 ? `${new Set(allOverrides.map(o => o.technician)).size} technician(s)` : 'No overrides'}</p>
          </CardContent>
        </Card>
      </div>

      {Object.keys(blockingCounts).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Common Blocking Issues</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(blockingCounts).sort((a, b) => b[1] - a[1]).map(([label, count]) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span>{label}</span>
                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        {/* Blocked Trucks */}
        <Card className="border-red-200">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-600" /> Blocked ({blocked.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {blocked.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> :
              blocked.map(r => {
                let issues = [];
                try { issues = JSON.parse(r.blocking_issues_detail || '[]'); } catch {}
                return (
                  <div key={r.id} className="border rounded-lg p-2.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium">{r.technician_name}</p>
                        <p className="text-xs text-muted-foreground">Truck {r.truck_number}</p>
                      </div>
                      <span className="text-sm font-bold text-red-600">{r.readiness_percentage}%</span>
                    </div>
                    {issues.length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {issues.slice(0, 3).map((iss, i) => (
                          <p key={i} className="text-xs text-red-500">• {iss.label}</p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            }
          </CardContent>
        </Card>

        {/* Ready Trucks */}
        <Card className="border-green-200">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> Ready ({ready.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {ready.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> :
              ready.map(r => (
                <div key={r.id} className="border rounded-lg p-2.5">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium">{r.technician_name}</p>
                      <p className="text-xs text-muted-foreground">Truck {r.truck_number}</p>
                    </div>
                    <span className="text-sm font-bold text-green-600">{r.readiness_percentage}%</span>
                  </div>
                </div>
              ))
            }
          </CardContent>
        </Card>

        {/* Departed Trucks */}
        <Card className="border-blue-200">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Truck className="w-4 h-4 text-blue-600" /> Departed ({departed.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {departed.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> :
              departed.map(r => (
                <div key={r.id} className="border rounded-lg p-2.5">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium">{r.technician_name}</p>
                      <p className="text-xs text-muted-foreground">Truck {r.truck_number}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {formatTime(r.departure_timestamp)}
                    </span>
                  </div>
                </div>
              ))
            }
          </CardContent>
        </Card>
      </div>

      {allOverrides.length > 0 && (
        <Card className="border-purple-200">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-purple-600" /> Override Details</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {allOverrides.map((ov, i) => (
                <div key={i} className="border rounded-lg p-2.5">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium">{ov.technician} — Truck {ov.truck_number}</p>
                      <p className="text-xs text-muted-foreground">Overridden: {ov.check_label} by {ov.override_by}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatTime(ov.override_at)}</span>
                  </div>
                  <p className="text-xs text-purple-600 mt-1">"{ov.reason}"</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {canDevReset && (
        <DeveloperResetDialog
          open={resetOpen}
          onOpenChange={(v) => { setResetOpen(v); if (!v) handleResetComplete(); }}
        />
      )}
    </div>
  );
}