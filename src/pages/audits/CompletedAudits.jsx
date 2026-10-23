import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, Search, Plus } from 'lucide-react';
import AuditResultView from '@/components/audits/AuditResultView';
import CorrectiveActionDialog from '@/components/audits/CorrectiveActionDialog';
import { AUDIT_STATUS_COLORS, getScoreColor } from '@/lib/auditConstants';

export default function CompletedAudits() {
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [correctiveOpen, setCorrectiveOpen] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try { setAudits(await base44.entities.ManagementAudit.list('-created_date', 500)); } catch (e) { console.error(e); }
    setLoading(false);
  };

  const completed = audits.filter((a) => a.status === 'Completed' || a.status === 'Closed');
  const filtered = completed.filter((a) =>
    !search || a.employee?.toLowerCase().includes(search.toLowerCase()) || a.audit_number?.toLowerCase().includes(search.toLowerCase())
  );

  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{selected.audit_number}</h1>
            <p className="text-sm text-muted-foreground">{selected.employee} · {selected.date}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCorrectiveOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Corrective Action
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelected(null)}>← Back</Button>
          </div>
        </div>
        <AuditResultView audit={selected} />
        <CorrectiveActionDialog
          open={correctiveOpen}
          onClose={() => setCorrectiveOpen(false)}
          auditNumber={selected.audit_number}
          auditId={selected.id}
          onSaved={() => setCorrectiveOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CheckCircle2 className="w-6 h-6 text-accent" /> Completed Audits
        </h1>
        <p className="text-muted-foreground text-sm">View completed audit results and scores</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search by employee or audit number..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No completed audits yet.</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="px-4 py-2 font-medium">Audit #</th>
                    <th className="px-4 py-2 font-medium">Employee</th>
                    <th className="px-4 py-2 font-medium hidden md:table-cell">Template</th>
                    <th className="px-4 py-2 font-medium">Score</th>
                    <th className="px-4 py-2 font-medium">Failed</th>
                    <th className="px-4 py-2 font-medium">Critical</th>
                    <th className="px-4 py-2 font-medium hidden sm:table-cell">Date</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => {
                    const sc = AUDIT_STATUS_COLORS[a.status] || AUDIT_STATUS_COLORS.Completed;
                    const scoreC = getScoreColor(a.pass_percentage || 0);
                    return (
                      <tr key={a.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setSelected(a)}>
                        <td className="px-4 py-2.5 font-mono text-xs">{a.audit_number}</td>
                        <td className="px-4 py-2.5 font-medium">{a.employee}</td>
                        <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell truncate max-w-[150px]">{a.audit_template_name}</td>
                        <td className={`px-4 py-2.5 font-bold ${scoreC.text}`}>{a.pass_percentage || 0}%</td>
                        <td className="px-4 py-2.5 text-red-600">{a.failed_items || 0}</td>
                        <td className="px-4 py-2.5 text-red-700 font-medium">{a.critical_failures || 0}</td>
                        <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{a.date}</td>
                        <td className="px-4 py-2.5"><span className={`px-1.5 py-0.5 rounded-full text-xs ${sc.bg} ${sc.text}`}>{a.status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}