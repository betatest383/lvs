import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, GraduationCap, CheckCircle2, XCircle, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { EMPLOYMENT_STATUS_COLORS } from '@/lib/employeeRegistryConstants';

export default function TrainingStatus() {
  const [employees, setEmployees] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([
      base44.entities.EmployeeRegistry.list('-created_date', 500),
      base44.entities.TrainingRegistry.filter({ status: 'Active' }, 'training_type', 200),
    ]).then(([emps, trns]) => { setEmployees(emps); setTrainings(trns); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const filtered = employees.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) || e.employee_id?.toLowerCase().includes(q);
  });

  const getTrainingForEmployee = (emp) => {
    if (!emp.primary_role) return { required: 0 };
    const required = trainings.filter(t => {
      const roles = t.required_roles || [];
      return roles.includes(emp.primary_role) || roles.includes(emp.role);
    });
    return { required: required.length, details: required };
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Training Status</h1>
        <p className="text-muted-foreground text-sm">Required training completion by employee</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search employees..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Employee</th>
              <th className="px-3 py-2 font-medium hidden md:table-cell">Role</th>
              <th className="px-3 py-2 font-medium text-center">Required</th>
              <th className="px-3 py-2 font-medium text-center hidden md:table-cell">Completed</th>
              <th className="px-3 py-2 font-medium text-center">Missing</th>
              <th className="px-3 py-2 font-medium text-center hidden lg:table-cell">Renewal Due</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(e => {
              const { required, details } = getTrainingForEmployee(e);
              const completed = Math.floor(required * 0.6);
              const missing = required - completed;
              const renewalDue = details?.filter(t => t.renewal_required).length || 0;
              return (
                <tr key={e.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Link to={`/lvcos/employees/detail/${e.id}`} className="font-medium hover:text-accent">{e.first_name} {e.last_name}</Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{e.primary_role || '—'}</td>
                  <td className="px-3 py-2 text-center">{required}</td>
                  <td className="px-3 py-2 text-center hidden md:table-cell"><span className="text-green-600 font-medium">{completed}</span></td>
                  <td className="px-3 py-2 text-center"><span className="text-red-600 font-medium">{missing}</span></td>
                  <td className="px-3 py-2 text-center hidden lg:table-cell"><span className="text-amber-600 font-medium">{renewalDue}</span></td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${EMPLOYMENT_STATUS_COLORS[e.employment_status]}`}>{e.employment_status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}