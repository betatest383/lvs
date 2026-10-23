import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function EmployeeSOPsTab({ employee }) {
  const [sops, setSops] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employee.primary_role) { setLoading(false); return; }
    base44.entities.SopRegistry.list('-created_date', 200)
      .then(allSops => {
        const required = allSops.filter(s => {
          const roles = s.applies_to || [];
          return roles.includes(employee.primary_role) || roles.includes(employee.role);
        });
        setSops(required);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [employee]);

  if (loading) return <p className="text-sm text-muted-foreground text-center py-4">Loading SOPs...</p>;

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Required SOPs ({sops.length})</CardTitle></CardHeader>
      <CardContent className="space-y-1">
        {sops.length === 0 ? (
          <p className="text-sm text-muted-foreground">No SOPs required for this role.</p>
        ) : sops.map(s => (
          <Link key={s.id} to={`/lvcos/sop-registry`} className="flex items-center justify-between text-sm hover:bg-muted/50 rounded px-2 py-1.5 transition-colors">
            <span className="truncate">{s.sop_id} — {s.title}</span>
            <span className="text-xs text-muted-foreground">{s.status}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}