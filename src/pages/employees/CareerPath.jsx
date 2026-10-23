import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function CareerPath() {
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

  const active = employees.filter(e => e.employment_status === 'Active');

  const getCareerPath = (emp) => {
    if (!emp.primary_role) return { current: null, next: [] };
    const current = roles.find(r => r.role_id === emp.primary_role || r.role_name === emp.primary_role);
    const next = current?.career_path_to
      ? roles.filter(r => current.career_path_to.includes(r.role_id) || current.career_path_to.includes(r.role_name))
      : [];
    return { current, next };
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Career Path</h1>
        <p className="text-muted-foreground text-sm">Current roles, eligible next roles, and skill gaps by employee</p>
      </div>

      <div className="space-y-3">
        {active.map(e => {
          const { current, next } = getCareerPath(e);
          return (
            <Card key={e.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <Link to={`/lvcos/employees/detail/${e.id}`} className="font-medium text-sm hover:text-accent">{e.first_name} {e.last_name}</Link>
                    <div className="flex items-center gap-2 mt-1">
                      {current ? (
                        <>
                          <Link to={`/roles/detail/${current.id}`} className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium hover:bg-blue-200 transition-colors">{current.role_name}</Link>
                          {next.length > 0 && <ArrowUpRight className="w-3 h-3 text-muted-foreground" />}
                        </>
                      ) : <span className="text-xs text-muted-foreground">No role assigned</span>}
                      {next.map(r => (
                        <Link key={r.id} to={`/roles/detail/${r.id}`} className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium hover:bg-green-200 transition-colors">{r.role_name}</Link>
                      ))}
                    </div>
                  </div>
                  {next.length === 0 && current && <span className="text-xs text-muted-foreground">No progression path defined</span>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}