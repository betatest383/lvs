import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function EmployeePoliciesTab({ employee }) {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employee.primary_role) { setLoading(false); return; }
    base44.entities.PolicyRegistry.filter({ status: 'Active' }, '-created_date', 200)
      .then(allPolicies => {
        const required = allPolicies.filter(p => {
          const roles = p.related_roles || [];
          return roles.includes(employee.primary_role) || roles.includes(employee.role);
        });
        setPolicies(required);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [employee]);

  if (loading) return <p className="text-sm text-muted-foreground text-center py-4">Loading policies...</p>;

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Required Policies ({policies.length})</CardTitle></CardHeader>
      <CardContent className="space-y-1">
        {policies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No policies required for this role.</p>
        ) : policies.map(p => (
          <Link key={p.id} to={`/lvcos/policies/detail/${p.id}`} className="flex items-center justify-between text-sm hover:bg-muted/50 rounded px-2 py-1.5 transition-colors">
            <span className="truncate">{p.policy_id} — {p.policy_name}</span>
            <span className={`text-xs font-medium ${p.requires_acknowledgment ? 'text-amber-600' : 'text-muted-foreground'}`}>
              {p.requires_acknowledgment ? 'Ack Required' : 'Reference'}
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}