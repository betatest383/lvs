import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, TrendingUp } from 'lucide-react';
import { EMPLOYMENT_STATUS_COLORS } from '@/lib/employeeRegistryConstants';

export default function PerformanceSummary() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.EmployeeRegistry.list('-created_date', 500)
      .then(setEmployees)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const active = employees.filter(e => e.employment_status === 'Active');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Performance Summary</h1>
        <p className="text-muted-foreground text-sm">Performance scores, audit results, and corrective actions by employee</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><p className="text-2xl font-bold">{active.length}</p><p className="text-xs text-muted-foreground">Active Employees</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-600" /><p className="text-2xl font-bold">—</p></div><p className="text-xs text-muted-foreground mt-1">Avg Performance</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold">—</p><p className="text-xs text-muted-foreground">Avg Audit Score</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Employee Performance</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 font-medium hidden md:table-cell">Role</th>
                  <th className="px-3 py-2 font-medium text-center">Hire Date</th>
                  <th className="px-3 py-2 font-medium text-center hidden md:table-cell">Years</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {active.map(e => {
                  const years = e.hire_date ? Math.floor((new Date() - new Date(e.hire_date)) / (365.25 * 24 * 60 * 60 * 1000)) : null;
                  return (
                    <tr key={e.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2"><Link to={`/lvcos/employees/detail/${e.id}`} className="font-medium hover:text-accent">{e.first_name} {e.last_name}</Link></td>
                      <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{e.primary_role || '—'}</td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{e.hire_date || '—'}</td>
                      <td className="px-3 py-2 text-center text-muted-foreground hidden md:table-cell">{years !== null ? `${years}y` : '—'}</td>
                      <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${EMPLOYMENT_STATUS_COLORS[e.employment_status]}`}>{e.employment_status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}