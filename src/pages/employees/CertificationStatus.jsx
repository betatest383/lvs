import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { EMPLOYMENT_STATUS_COLORS } from '@/lib/employeeRegistryConstants';

export default function CertificationStatus() {
  const [employees, setEmployees] = useState([]);
  const [certs, setCerts] = useState([]);
  const [empCerts, setEmpCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([
      base44.entities.EmployeeRegistry.list('-created_date', 500),
      base44.entities.CertificationRegistry.filter({ status: 'Active' }, 'certification_type', 200),
      base44.entities.EmployeeCertification.list('-created_date', 500),
    ]).then(([emps, c, ec]) => { setEmployees(emps); setCerts(c); setEmpCerts(ec); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const filtered = employees.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) || e.employee_id?.toLowerCase().includes(q);
  });

  const today = new Date();
  const thirtyDays = new Date(); thirtyDays.setDate(today.getDate() + 30);

  const getCertStats = (emp) => {
    if (!emp.primary_role) return { required: 0, active: 0, missing: 0, expired: 0, expiring: 0 };
    const required = certs.filter(c => {
      const roles = c.required_roles || [];
      return roles.includes(emp.primary_role) || roles.includes(emp.role);
    });
    const mine = empCerts.filter(e =>
      e.employee_email === emp.email ||
      `${emp.first_name} ${emp.last_name}` === e.employee_name
    );
    let active = 0, missing = 0, expired = 0, expiring = 0;
    required.forEach(cert => {
      const empCert = mine.find(e => e.certification_id === cert.certification_id);
      if (!empCert) { missing++; return; }
      if (empCert.status === 'Expired' || (empCert.expiration_date && new Date(empCert.expiration_date) < today)) { expired++; return; }
      if (empCert.expiration_date && new Date(empCert.expiration_date) <= thirtyDays) { expiring++; return; }
      active++;
    });
    return { required: required.length, active, missing, expired, expiring };
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Certification Status</h1>
        <p className="text-muted-foreground text-sm">Required certifications by employee — active, missing, expired, expiring</p>
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
              <th className="px-3 py-2 font-medium text-center text-green-600">Active</th>
              <th className="px-3 py-2 font-medium text-center text-gray-500">Missing</th>
              <th className="px-3 py-2 font-medium text-center text-red-600">Expired</th>
              <th className="px-3 py-2 font-medium text-center text-amber-600 hidden md:table-cell">Expiring</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(e => {
              const s = getCertStats(e);
              return (
                <tr key={e.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Link to={`/lvcos/employees/detail/${e.id}`} className="font-medium hover:text-accent">{e.first_name} {e.last_name}</Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{e.primary_role || '—'}</td>
                  <td className="px-3 py-2 text-center">{s.required}</td>
                  <td className="px-3 py-2 text-center font-medium text-green-600">{s.active}</td>
                  <td className="px-3 py-2 text-center font-medium">{s.missing}</td>
                  <td className="px-3 py-2 text-center font-medium text-red-600">{s.expired}</td>
                  <td className="px-3 py-2 text-center font-medium text-amber-600 hidden md:table-cell">{s.expiring}</td>
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