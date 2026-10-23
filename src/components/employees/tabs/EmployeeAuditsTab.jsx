import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle } from 'lucide-react';

export default function EmployeeAuditsTab({ employee }) {
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ManagementAudit records would be filtered by employee name/email
    base44.entities.ManagementAudit.list('-created_date', 200)
      .then(all => {
        const mine = all.filter(a =>
          a.audited_employee === `${employee.first_name} ${employee.last_name}` ||
          a.audited_employee_email === employee.email
        );
        setAudits(mine);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [employee]);

  if (loading) return <p className="text-sm text-muted-foreground text-center py-4">Loading audits...</p>;

  const avgScore = audits.length > 0
    ? Math.round(audits.reduce((sum, a) => sum + (a.overall_score || 0), 0) / audits.length)
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><p className="text-2xl font-bold">{audits.length}</p><p className="text-xs text-muted-foreground">Total Audits</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold">{avgScore}%</p><p className="text-xs text-muted-foreground">Avg Score</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold">{audits.filter(a => a.status === 'Completed').length}</p><p className="text-xs text-muted-foreground">Completed</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Audit History</CardTitle></CardHeader>
        <CardContent>
          {audits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audits found.</p>
          ) : (
            <div className="space-y-1">
              {audits.map(a => (
                <div key={a.id} className="flex items-center justify-between text-sm border-b last:border-0 py-1.5">
                  <span className="truncate">{a.template_name || a.audit_type || 'Audit'}</span>
                  <span className="text-xs text-muted-foreground">{a.audit_date}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}