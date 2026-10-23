import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, UserPlus, Building2, Award, AlertTriangle, CheckCircle2, Plus, UserCog } from 'lucide-react';
import { EMPLOYMENT_STATUS_COLORS, EMPLOYMENT_TYPE_COLORS } from '@/lib/employeeRegistryConstants';

export default function EmployeeDashboard() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.EmployeeRegistry.list('-created_date', 500)
      .then(setEmployees)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  const active = employees.filter(e => e.employment_status === 'Active');
  const onLeave = employees.filter(e => e.employment_status === 'On Leave');
  const inactive = employees.filter(e => e.employment_status === 'Inactive');
  const terminated = employees.filter(e => e.employment_status === 'Terminated');

  const byDept = {};
  active.forEach(e => { const d = e.department || 'Unassigned'; byDept[d] = (byDept[d] || 0) + 1; });

  const byType = {};
  active.forEach(e => { const t = e.employment_type || 'Unknown'; byType[t] = (byType[t] || 0) + 1; });

  const kpis = [
    { label: 'Total Employees', value: employees.length, icon: Users, to: '/lvcos/employees/registry', color: 'bg-blue-100 text-blue-600' },
    { label: 'Active', value: active.length, icon: CheckCircle2, to: '/lvcos/employees/registry', color: 'bg-green-100 text-green-600' },
    { label: 'On Leave', value: onLeave.length, icon: AlertTriangle, to: '/lvcos/employees/registry', color: 'bg-amber-100 text-amber-600' },
    { label: 'Inactive', value: inactive.length, icon: Users, to: '/lvcos/employees/registry', color: 'bg-gray-100 text-gray-600' },
    { label: 'Terminated', value: terminated.length, icon: Users, to: '/lvcos/employees/registry', color: 'bg-red-100 text-red-600' },
    { label: 'Departments', value: Object.keys(byDept).length, icon: Building2, to: '/lvcos/employees/reports', color: 'bg-purple-100 text-purple-600' },
    { label: 'Roles', value: new Set(active.map(e => e.primary_role).filter(Boolean)).size, icon: UserCog, to: '/lvcos/employees/role-assignments', color: 'bg-cyan-100 text-cyan-600' },
    { label: 'Full Time', value: active.filter(e => e.employment_type === 'Full Time').length, icon: Award, to: '/lvcos/employees/reports', color: 'bg-indigo-100 text-indigo-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employee Dashboard</h1>
          <p className="text-muted-foreground text-sm">Central employee database — roles, training, certifications, equipment, and career paths.</p>
        </div>
        <Link to="/lvcos/employees/registry">
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="w-4 h-4 mr-2" /> New Employee</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <Link key={i} to={kpi.to}>
            <Card className="hover:shadow-md transition-shadow h-full">
              <CardContent className="p-4">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${kpi.color}`}><kpi.icon className="w-4 h-4" /></div>
                <p className="text-2xl font-bold">{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /> Active by Department</h3>
            {Object.keys(byDept).length === 0 ? <p className="text-sm text-muted-foreground">No employees.</p> : (
              <div className="space-y-1">
                {Object.entries(byDept).sort((a, b) => b[1] - a[1]).map(([dept, count]) => (
                  <Link key={dept} to="/lvcos/employees/registry" className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                    <span>{dept}</span><span className="font-bold">{count}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><UserPlus className="w-4 h-4 text-muted-foreground" /> Active by Type</h3>
            {Object.keys(byType).length === 0 ? <p className="text-sm text-muted-foreground">No employees.</p> : (
              <div className="space-y-1">
                {Object.entries(byType).map(([type, count]) => (
                  <div key={type} className="flex justify-between text-sm items-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${EMPLOYMENT_TYPE_COLORS[type] || 'bg-muted'}`}>{type}</span>
                    <span className="font-bold">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Recent Employees</h3>
          {active.length === 0 ? <p className="text-sm text-muted-foreground">No employees yet.</p> : (
            <div className="space-y-1">
              {active.slice(0, 8).map(e => (
                <Link key={e.id} to={`/lvcos/employees/detail/${e.id}`} className="flex items-center justify-between text-sm hover:bg-muted/50 rounded px-2 py-1.5 transition-colors">
                  <span className="truncate font-medium">{e.first_name} {e.last_name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{e.department}</span>
                    <span className="text-xs text-muted-foreground">{e.primary_role}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}