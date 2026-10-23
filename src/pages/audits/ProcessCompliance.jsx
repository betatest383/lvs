import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import { BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { calcCompliance, getScoreColor, getMostCommonFailures } from '@/lib/auditConstants';

function TrendIndicator({ trend }) {
  if (trend > 0) return <TrendingUp className="w-4 h-4 text-green-500" />;
  if (trend < 0) return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
}

export default function ProcessCompliance() {
  const [audits, setAudits] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [a, t] = await Promise.all([
        base44.entities.ManagementAudit.list('-created_date', 500),
        base44.entities.AuditTemplate.list('-created_date', 500),
      ]);
      setAudits(a); setTemplates(t);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;
  }

  // Group by SOP
  const sopData = {};
  audits.forEach((a) => {
    const sop = a.related_sop || a.audit_template_name || 'Unknown';
    if (!sopData[sop]) sopData[sop] = [];
    sopData[sop].push(a);
  });

  const sopRows = Object.entries(sopData).map(([sop, sopAudits]) => {
    const { compliance, avgScore, count } = calcCompliance(sopAudits);
    const sorted = sopAudits.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const lastAudit = sorted[sorted.length - 1];
    // Trend: compare last 3 vs previous
    const recent = sorted.slice(-3);
    const older = sorted.slice(0, -3);
    const recentAvg = recent.length > 0 ? recent.reduce((s, a) => s + (a.pass_percentage || 0), 0) / recent.length : 0;
    const olderAvg = older.length > 0 ? older.reduce((s, a) => s + (a.pass_percentage || 0), 0) / older.length : 0;
    const trend = Math.round(recentAvg - olderAvg);
    // Most common failure
    const failures = getMostCommonFailures(sopAudits.filter((a) => a.status === 'Completed' || a.status === 'Closed'));
    const topFailure = failures[0]?.item || '—';
    return { sop, sopAudits, compliance, avgScore, count, lastAudit, trend, topFailure };
  }).sort((a, b) => a.sop.localeCompare(b.sop));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-accent" /> Process Compliance
        </h1>
        <p className="text-muted-foreground text-sm">Compliance metrics by SOP across the company</p>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">SOP Compliance Overview</CardTitle></CardHeader>
        <CardContent className="p-0">
          {sopRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No audit data available.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="px-4 py-2 font-medium">SOP / Template</th>
                    <th className="px-4 py-2 font-medium">Audits</th>
                    <th className="px-4 py-2 font-medium">Avg Score</th>
                    <th className="px-4 py-2 font-medium">Compliance</th>
                    <th className="px-4 py-2 font-medium hidden md:table-cell">Last Audit</th>
                    <th className="px-4 py-2 font-medium">Trend</th>
                    <th className="px-4 py-2 font-medium hidden lg:table-cell">Top Failure</th>
                  </tr>
                </thead>
                <tbody>
                  {sopRows.map((row) => {
                    const scoreC = getScoreColor(row.avgScore);
                    return (
                      <tr key={row.sop} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 font-medium">{row.sop}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{row.count}</td>
                        <td className={`px-4 py-2.5 font-bold ${scoreC.text}`}>{row.avgScore}%</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className={`h-full ${row.compliance >= 75 ? 'bg-green-500' : 'bg-yellow-500'}`} style={{ width: `${row.compliance}%` }} />
                            </div>
                            <span className="text-xs">{row.compliance}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">{row.lastAudit?.date || '—'}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            <TrendIndicator trend={row.trend} />
                            {row.trend !== 0 && <span className={`text-xs ${row.trend > 0 ? 'text-green-600' : 'text-red-600'}`}>{row.trend > 0 ? '+' : ''}{row.trend}%</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground hidden lg:table-cell truncate max-w-[200px]">{row.topFailure}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}