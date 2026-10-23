import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import {
  ClipboardCheck, Plus, List, CheckCircle2, Users, BarChart3, AlertTriangle,
  TrendingUp, TrendingDown, FileStack, Gauge,
} from 'lucide-react';
import StatCard from '@/components/ci/StatCard';
import { AUDIT_STATUS_COLORS, CORRECTIVE_STATUS_COLORS, getScoreColor, calcCompliance, getMostCommonFailures } from '@/lib/auditConstants';

export default function AuditDashboard() {
  const [audits, setAudits] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [corrective, setCorrective] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [a, t, c] = await Promise.all([
        base44.entities.ManagementAudit.list('-created_date', 500),
        base44.entities.AuditTemplate.list('-created_date', 500),
        base44.entities.CorrectiveAction.list('-created_date', 500),
      ]);
      setAudits(a); setTemplates(t); setCorrective(c);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;
  }

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const auditsToday = audits.filter((a) => a.date === today);
  const auditsThisWeek = audits.filter((a) => a.date >= weekAgo);
  const completed = audits.filter((a) => a.status === 'Completed' || a.status === 'Closed');
  const avgScore = completed.length > 0 ? Math.round(completed.reduce((s, a) => s + (a.pass_percentage || 0), 0) / completed.length) : 0;
  const { compliance } = calcCompliance(audits);
  const openCorrective = corrective.filter((c) => c.status === 'Open' || c.status === 'In Progress');
  const criticalFailures = completed.reduce((s, a) => s + (a.critical_failures || 0), 0);
  const scoreColor = getScoreColor(avgScore);

  // Most failed SOPs
  const sopFailCounts = {};
  completed.forEach((a) => {
    if (a.related_sop) {
      if (!sopFailCounts[a.related_sop]) sopFailCounts[a.related_sop] = { sop: a.related_sop, fails: 0, audits: 0 };
      sopFailCounts[a.related_sop].audits++;
      sopFailCounts[a.related_sop].fails += a.failed_items || 0;
    }
  });
  const mostFailedSops = Object.values(sopFailCounts).sort((a, b) => b.fails - a.fails).slice(0, 5);

  // Most improved employees
  const empScores = {};
  completed.forEach((a) => {
    if (!a.employee) return;
    if (!empScores[a.employee]) empScores[a.employee] = [];
    empScores[a.employee].push({ date: a.date, score: a.pass_percentage || 0 });
  });
  const improvedEmployees = Object.entries(empScores)
    .map(([name, scores]) => {
      const sorted = scores.sort((a, b) => a.date.localeCompare(b.date));
      if (sorted.length < 2) return null;
      const recent = sorted.slice(-3).reduce((s, x) => s + x.score, 0) / Math.min(3, sorted.length);
      const older = sorted.slice(0, -3).reduce((s, x) => s + x.score, 0) / Math.max(1, sorted.length - 3);
      return { name, improvement: Math.round(recent - older), recent: Math.round(recent) };
    })
    .filter(Boolean)
    .sort((a, b) => b.improvement - a.improvement)
    .slice(0, 5);

  const commonFailures = getMostCommonFailures(completed).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-accent" /> Management Audits
          </h1>
          <p className="text-muted-foreground text-sm">Verify employees are following LVC OS standards</p>
        </div>
        <Link to="/audits/new" className="inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-accent/90">
          <Plus className="w-4 h-4" /> New Audit
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link to="/audits/templates"><button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input text-sm hover:bg-accent/10"><FileStack className="w-3.5 h-3.5" /> Templates</button></Link>
        <Link to="/audits/new"><button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input text-sm hover:bg-accent/10"><Plus className="w-3.5 h-3.5" /> New</button></Link>
        <Link to="/audits/queue"><button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input text-sm hover:bg-accent/10"><List className="w-3.5 h-3.5" /> Queue</button></Link>
        <Link to="/audits/completed"><button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input text-sm hover:bg-accent/10"><CheckCircle2 className="w-3.5 h-3.5" /> Completed</button></Link>
        <Link to="/audits/employee-history"><button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input text-sm hover:bg-accent/10"><Users className="w-3.5 h-3.5" /> Employee History</button></Link>
        <Link to="/audits/compliance"><button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input text-sm hover:bg-accent/10"><BarChart3 className="w-3.5 h-3.5" /> Compliance</button></Link>
        <Link to="/audits/corrective-actions"><button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input text-sm hover:bg-accent/10"><AlertTriangle className="w-3.5 h-3.5" /> Corrective Actions</button></Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard label="Audits Today" value={auditsToday.length} icon={ClipboardCheck} color="text-blue-500" />
        <StatCard label="Audits This Week" value={auditsThisWeek.length} icon={List} color="text-indigo-500" />
        <StatCard label="Average Score" value={`${avgScore}%`} icon={Gauge} color={scoreColor.text} />
        <StatCard label="Compliance" value={`${compliance}%`} icon={CheckCircle2} color="text-green-500" />
        <StatCard label="Corrective Actions Open" value={openCorrective.length} icon={AlertTriangle} color="text-yellow-500" />
        <StatCard label="Critical Failures" value={criticalFailures} icon={AlertTriangle} color="text-red-500" />
        <StatCard label="Active Templates" value={templates.filter((t) => t.status === 'Active').length} icon={FileStack} color="text-purple-500" />
        <StatCard label="Total Audits" value={audits.length} icon={ClipboardCheck} color="text-teal-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Most Failed SOPs</CardTitle></CardHeader>
          <CardContent>
            {mostFailedSops.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No data yet.</p>
            ) : (
              <div className="space-y-2">
                {mostFailedSops.map((s) => (
                  <div key={s.sop} className="flex items-center justify-between text-sm">
                    <span className="font-mono">{s.sop}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-red-600">{s.fails} fails</span>
                      <span className="text-muted-foreground">{s.audits} audits</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Most Improved Employees</CardTitle></CardHeader>
          <CardContent>
            {improvedEmployees.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Not enough data yet.</p>
            ) : (
              <div className="space-y-2">
                {improvedEmployees.map((e) => (
                  <div key={e.name} className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate">{e.name}</span>
                    <div className="flex items-center gap-3">
                      {e.improvement > 0 ? <TrendingUp className="w-4 h-4 text-green-500" /> : <TrendingDown className="w-4 h-4 text-red-500" />}
                      <span className={e.improvement > 0 ? 'text-green-600' : 'text-red-600'}>{e.improvement > 0 ? '+' : ''}{e.improvement}%</span>
                      <span className="text-muted-foreground">{e.recent}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Most Common Failures</CardTitle></CardHeader>
          <CardContent>
            {commonFailures.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No failures recorded.</p>
            ) : (
              <div className="space-y-2">
                {commonFailures.map((f) => (
                  <div key={f.item} className="flex items-center justify-between text-sm">
                    <span className="truncate flex-1 min-w-0">{f.item}</span>
                    <span className="text-red-600 font-medium ml-2 shrink-0">{f.count}x</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Recent Audits</CardTitle></CardHeader>
          <CardContent>
            {audits.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No audits yet.</p>
            ) : (
              <div className="space-y-2">
                {audits.slice(0, 6).map((a) => {
                  const sc = AUDIT_STATUS_COLORS[a.status] || AUDIT_STATUS_COLORS['In Progress'];
                  const scoreC = getScoreColor(a.pass_percentage || 0);
                  return (
                    <Link key={a.id} to="/audits/completed" className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/30 transition-colors">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${sc.dot}`} />
                      <span className="text-sm flex-1 min-w-0 truncate">{a.employee} — {a.audit_template_name}</span>
                      <span className={`text-xs font-medium ${scoreC.text} shrink-0`}>{a.pass_percentage || 0}%</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}