import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, BarChart3, Building2 } from 'lucide-react';
import { EMPLOYMENT_STATUS_COLORS, EMPLOYMENT_TYPE_COLORS } from '@/lib/employeeRegistryConstants';
import { DEPARTMENTS } from '@/lib/roleRegistryConstants';

export default function EmployeeReports() {
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

  const byDept = {};
  DEPARTMENTS.forEach(d => { const count = active.filter(e => e.department === d).length; if (count > 0) byDept[d] = count; });

  const byType = {};
  active.forEach(e => { const t = e.employment_type || 'Unknown'; byType[t] = (byType[t] || 0) + 1; });

  const byStatus = {};
  employees.forEach(e => { const s = e.employment_status || 'Unknown'; byStatus[s] = (byStatus[s] || 0) + 1; });

  const maxDept = Math.max(...Object.values(byDept), 1);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Employee Reports</h1>
        <p className="text-muted-foreground text-sm">Analytics across all employees</p>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Status Breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {Object.entries(byStatus).map(([status, count]) => (
              <div key={status} className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-full text-sm font-medium ${EMPLOYMENT_STATUS_COLORS[status] || 'bg-muted'}`}>{status}</span>
                <span className="text-lg font-bold">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Building2 className="w-4 h-4" /> Employees by Department</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(byDept).sort((a, b) => b[1] - a[1]).map(([dept, count]) => (
              <div key={dept}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 text-xs font-medium">{dept}</span>
                  <span className="font-bold">{count}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div className="bg-accent h-full rounded-full" style={{ width: `${(count / maxDept) * 100}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Employees by Type</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(byType).map(([type, count]) => (
                <div key={type} className="flex justify-between items-center text-sm">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${EMPLOYMENT_TYPE_COLORS[type] || 'bg-muted'}`}>{type}</span>
                  <span className="font-bold">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Employee Summary Table</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 font-medium">Employee</th>
                  <th className="py-2 font-medium hidden md:table-cell">Dept</th>
                  <th className="py-2 font-medium hidden md:table-cell">Role</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium hidden lg:table-cell">Truck</th>
                  <th className="py-2 font-medium hidden lg:table-cell">Type</th>
                </tr>
              </thead>
              <tbody>
                {active.map(e => (
                  <tr key={e.id} className="border-b hover:bg-muted/30">
                    <td className="py-2"><Link to={`/lvcos/employees/detail/${e.id}`} className="font-medium hover:text-accent">{e.first_name} {e.last_name}</Link></td>
                    <td className="py-2 text-muted-foreground hidden md:table-cell">{e.department || '—'}</td>
                    <td className="py-2 text-muted-foreground hidden md:table-cell">{e.primary_role || '—'}</td>
                    <td className="py-2"><span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${EMPLOYMENT_STATUS_COLORS[e.employment_status]}`}>{e.employment_status}</span></td>
                    <td className="py-2 text-muted-foreground hidden lg:table-cell">{e.assigned_truck || '—'}</td>
                    <td className="py-2 text-muted-foreground hidden lg:table-cell">{e.employment_type || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}