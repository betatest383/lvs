import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Award, AlertTriangle, CheckCircle2, XCircle, CalendarClock,
  Plus, Users, Building2
} from 'lucide-react';
import {
  CERTIFICATION_STATUS_COLORS, CERTIFICATION_TYPE_COLORS, EMPLOYEE_CERT_STATUS_COLORS
} from '@/lib/certificationRegistryConstants';

export default function CertificationDashboard() {
  const [certifications, setCertifications] = useState([]);
  const [employeeCerts, setEmployeeCerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.CertificationRegistry.list('-created_date', 500),
      base44.entities.EmployeeCertification.list('-created_date', 500),
    ]).then(([certs, emps]) => {
      setCertifications(certs);
      setEmployeeCerts(emps);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  const today = new Date();
  const thirtyDays = new Date(); thirtyDays.setDate(today.getDate() + 30);

  const activeCerts = certifications.filter(c => c.status === 'Active');
  const expired = employeeCerts.filter(e => e.status === 'Expired' || (e.expiration_date && new Date(e.expiration_date) < today));
  const expiringSoon = employeeCerts.filter(e => {
    if (e.status === 'Expired') return false;
    if (!e.expiration_date) return false;
    const exp = new Date(e.expiration_date);
    return exp > today && exp <= thirtyDays;
  });
  const activeEmpCerts = employeeCerts.filter(e => e.status === 'Active');
  const missingTrainual = certifications.filter(c => c.status === 'Active' && !c.trainual_link);

  const byType = {};
  certifications.forEach(c => {
    const tp = c.certification_type || 'Unassigned';
    byType[tp] = (byType[tp] || 0) + 1;
  });

  const kpis = [
    { label: 'Total Certifications', value: certifications.length, icon: Award, to: '/lvcos/certifications/registry', color: 'bg-blue-100 text-blue-600' },
    { label: 'Active', value: activeCerts.length, icon: CheckCircle2, to: '/lvcos/certifications/registry', color: 'bg-green-100 text-green-600' },
    { label: 'Employee Certs', value: employeeCerts.length, icon: Users, to: '/lvcos/certifications/employees', color: 'bg-purple-100 text-purple-600' },
    { label: 'Expired', value: expired.length, icon: XCircle, to: '/lvcos/certifications/expiration', color: 'bg-red-100 text-red-600' },
    { label: 'Expiring Soon', value: expiringSoon.length, icon: AlertTriangle, to: '/lvcos/certifications/expiration', color: 'bg-amber-100 text-amber-600' },
    { label: 'Active Emp Certs', value: activeEmpCerts.length, icon: CheckCircle2, to: '/lvcos/certifications/employees', color: 'bg-green-100 text-green-600' },
    { label: 'Missing Trainual', value: missingTrainual.length, icon: AlertTriangle, to: '/lvcos/certifications/reports', color: 'bg-orange-100 text-orange-600' },
    { label: 'Role Coverage', value: new Set(certifications.flatMap(c => c.required_roles || [])).size, icon: Building2, to: '/lvcos/certifications/matrix', color: 'bg-indigo-100 text-indigo-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Certification Registry Dashboard</h1>
          <p className="text-muted-foreground text-sm">Master database for employee certifications, licenses, and required credentials.</p>
        </div>
        <Link to="/lvcos/certifications/registry">
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="w-4 h-4 mr-2" /> New Certification</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <Link key={i} to={kpi.to}>
            <Card className="hover:shadow-md transition-shadow h-full">
              <CardContent className="p-4">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${kpi.color}`}>
                  <kpi.icon className="w-4 h-4" />
                </div>
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
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-muted-foreground" /> Expiring Soon (30 Days)</h3>
            {expiringSoon.length === 0 ? (
              <p className="text-sm text-muted-foreground">No certifications expiring soon.</p>
            ) : (
              <div className="space-y-1">
                {expiringSoon.slice(0, 6).map(e => (
                  <Link key={e.id} to="/lvcos/certifications/expiration" className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                    <span className="truncate">{e.employee_name}</span>
                    <span className="text-xs text-amber-600 font-medium">{e.expiration_date}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><XCircle className="w-4 h-4 text-muted-foreground" /> Expired Certifications</h3>
            {expired.length === 0 ? (
              <p className="text-sm text-muted-foreground">No expired certifications.</p>
            ) : (
              <div className="space-y-1">
                {expired.slice(0, 6).map(e => (
                  <Link key={e.id} to="/lvcos/certifications/expiration" className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                    <span className="truncate">{e.employee_name}</span>
                    <span className="text-xs text-red-600 font-medium">{e.certification_name}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /> Certifications by Type</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <div key={type} className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CERTIFICATION_TYPE_COLORS[type] || 'bg-muted'}`}>{type}</span>
                <span className="text-sm font-bold">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}