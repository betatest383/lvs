import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, UserCog } from 'lucide-react';
import { EMPLOYMENT_STATUS_COLORS } from '@/lib/employeeRegistryConstants';

export default function RoleAssignments() {
  const [employees, setEmployees] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.EmployeeRegistry.list('-created_date', 500),
      base44.entities.RoleRegistry.list('-sort_order', 200),
    ]).then(([emps, rls]) => { setEmployees(emps); setRoles(rls); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const byRole = {};
  employees.forEach(e => {
    const r = e.primary_role || 'Unassigned';
    if (!byRole[r]) byRole[r] = [];
    byRole[r].push(e);
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Role Assignments</h1>
        <p className="text-muted-foreground text-sm">Employees grouped by primary role</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><p className="text-2xl font-bold">{employees.filter(e => e.employment_status === 'Active').length}</p><p className="text-xs text-muted-foreground">Active Employees</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold">{Object.keys(byRole).length}</p><p className="text-xs text-muted-foreground">Distinct Roles</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold">{roles.length}</p><p className="text-xs text-muted-foreground">Total Roles</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold">{roles.filter(r => !byRole[r.role_id] && !byRole[r.role_name]).length}</p><p className="text-xs text-muted-foreground">Unfilled Roles</p></CardContent></Card>
      </div>

      <div className="space-y-4">
        {roles.map(role => {
          const assigned = byRole[role.role_id] || byRole[role.role_name] || [];
          return (
            <Card key={role.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <Link to={`/roles/detail/${role.id}`} className="hover:text-accent flex items-center gap-2">
                    <UserCog className="w-4 h-4" /> {role.role_name}
                  </Link>
                  <span className="text-xs text-muted-foreground">{assigned.length} assigned</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {assigned.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No employees assigned.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {assigned.map(e => (
                      <Link key={e.id} to={`/lvcos/employees/detail/${e.id}`} className="flex items-center gap-2 px-2 py-1 rounded-full bg-muted text-xs hover:bg-muted/70 transition-colors">
                        <span>{e.first_name} {e.last_name}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${EMPLOYMENT_STATUS_COLORS[e.employment_status]}`}>{e.employment_status}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}