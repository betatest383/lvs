import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function EmployeeRolesTab({ employee }) {
  const [primaryRole, setPrimaryRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employee.primary_role) { setLoading(false); return; }
    base44.entities.RoleRegistry.list('-sort_order', 200)
      .then(roles => {
        const match = roles.find(r => r.role_id === employee.primary_role || r.role_name === employee.primary_role);
        setPrimaryRole(match || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [employee]);

  if (loading) return <p className="text-sm text-muted-foreground text-center py-4">Loading roles...</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Primary Role</CardTitle></CardHeader>
        <CardContent>
          {primaryRole ? (
            <div className="space-y-2">
              <Link to={`/roles/detail/${primaryRole.id}`} className="font-medium text-sm hover:text-accent">{primaryRole.role_name}</Link>
              <p className="text-xs text-muted-foreground">{primaryRole.role_description}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                <span className="px-2 py-0.5 rounded-full bg-muted text-xs">Dept: {primaryRole.department}</span>
                <span className="px-2 py-0.5 rounded-full bg-muted text-xs">Permission: {primaryRole.permission_level}</span>
                <span className="px-2 py-0.5 rounded-full bg-muted text-xs">Portal: {primaryRole.default_portal}</span>
              </div>
            </div>
          ) : <p className="text-sm text-muted-foreground">No primary role assigned.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Secondary Roles</CardTitle></CardHeader>
        <CardContent>
          {employee.secondary_roles?.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {employee.secondary_roles.map((r, i) => (
                <span key={i} className="px-2 py-1 rounded-full bg-muted text-sm font-medium">{r}</span>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">No secondary roles assigned.</p>}
        </CardContent>
      </Card>
    </div>
  );
}