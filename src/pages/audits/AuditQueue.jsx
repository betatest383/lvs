import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { List, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import AuditResultView from '@/components/audits/AuditResultView';
import CorrectiveActionDialog from '@/components/audits/CorrectiveActionDialog';
import { AUDIT_STATUS_COLORS, getScoreColor } from '@/lib/auditConstants';

export default function AuditQueue() {
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedAudit, setSelectedAudit] = useState(null);
  const [correctiveOpen, setCorrectiveOpen] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try { setAudits(await base44.entities.ManagementAudit.list('-created_date', 500)); } catch (e) { console.error(e); }
    setLoading(false);
  };

  const queue = audits.filter((a) => a.status === 'In Progress' || a.status === 'Under Review');

  const filtered = queue.filter((a) =>
    !search || a.employee?.toLowerCase().includes(search.toLowerCase()) || a.audit_number?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <List className="w-6 h-6 text-accent" /> Audit Queue
        </h1>
        <p className="text-muted-foreground text-sm">Audits in progress or awaiting review</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No audits in queue.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const sc = AUDIT_STATUS_COLORS[a.status] || AUDIT_STATUS_COLORS['In Progress'];
            return (
              <Card key={a.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedAudit(a)}>
                <CardContent className="p-3 flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${sc.dot}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.audit_number} — {a.employee}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.audit_template_name} · {a.date} · {a.auditor}</p>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded-full text-xs shrink-0 ${sc.bg} ${sc.text}`}>{a.status}</span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedAudit && (
        <CorrectiveActionDialog
          open={!!selectedAudit}
          onClose={() => setSelectedAudit(null)}
          auditNumber={selectedAudit.audit_number}
          auditId={selectedAudit.id}
          onSaved={() => { setSelectedAudit(null); load(); }}
        />
      )}

      <CorrectiveActionDialog
        open={correctiveOpen}
        onClose={() => setCorrectiveOpen(false)}
        onSaved={load}
      />
    </div>
  );
}