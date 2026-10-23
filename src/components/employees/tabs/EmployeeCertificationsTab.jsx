import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

export default function EmployeeCertificationsTab({ employee }) {
  const [requiredCerts, setRequiredCerts] = useState([]);
  const [employeeCerts, setEmployeeCerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employee.primary_role) { setLoading(false); return; }
    Promise.all([
      base44.entities.CertificationRegistry.filter({ status: 'Active' }, 'certification_type', 200).catch(() => []),
      base44.entities.EmployeeCertification.filter({}, '-created_date', 200).catch(() => []),
    ]).then(([certs, empCerts]) => {
      const required = certs.filter(c => {
        const roles = c.required_roles || [];
        return roles.includes(employee.primary_role) || roles.includes(employee.role);
      });
      setRequiredCerts(required);
      const mine = empCerts.filter(e =>
        e.employee_email === employee.email ||
        `${employee.first_name} ${employee.last_name}` === e.employee_name
      );
      setEmployeeCerts(mine);
    }).finally(() => setLoading(false));
  }, [employee]);

  if (loading) return <p className="text-sm text-muted-foreground text-center py-4">Loading certifications...</p>;

  const today = new Date();
  const thirtyDays = new Date(); thirtyDays.setDate(today.getDate() + 30);

  const getStatus = (cert) => {
    const empCert = employeeCerts.find(e => e.certification_id === cert.certification_id);
    if (!empCert) return 'missing';
    if (empCert.status === 'Expired' || (empCert.expiration_date && new Date(empCert.expiration_date) < today)) return 'expired';
    if (empCert.expiration_date && new Date(empCert.expiration_date) <= thirtyDays) return 'expiring';
    return 'active';
  };

  const stats = {
    active: requiredCerts.filter(c => getStatus(c) === 'active').length,
    missing: requiredCerts.filter(c => getStatus(c) === 'missing').length,
    expired: requiredCerts.filter(c => getStatus(c) === 'expired').length,
    expiring: requiredCerts.filter(c => getStatus(c) === 'expiring').length,
  };

  const STATUS_ICONS = { active: CheckCircle2, missing: XCircle, expired: XCircle, expiring: AlertTriangle };
  const STATUS_COLORS = { active: 'text-green-600', missing: 'text-gray-500', expired: 'text-red-600', expiring: 'text-amber-600' };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(stats).map(([key, val]) => {
          const Icon = STATUS_ICONS[key];
          const color = { active: 'bg-green-100 text-green-600', missing: 'bg-gray-100 text-gray-600', expired: 'bg-red-100 text-red-600', expiring: 'bg-amber-100 text-amber-600' };
          return (
            <Card key={key}><CardContent className="p-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${color[key]}`}><Icon className="w-4 h-4" /></div>
              <p className="text-2xl font-bold">{val}</p><p className="text-xs text-muted-foreground capitalize">{key}</p>
            </CardContent></Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Required Certifications</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {requiredCerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No required certifications for this role.</p>
          ) : requiredCerts.map(c => {
            const status = getStatus(c);
            const Icon = STATUS_ICONS[status];
            return (
              <Link key={c.id} to={`/lvcos/certifications/detail/${c.id}`} className="flex items-center justify-between text-sm hover:bg-muted/50 rounded px-2 py-1.5 transition-colors">
                <span className="truncate">{c.certification_name}</span>
                <span className={`text-xs font-medium flex items-center gap-1 capitalize ${STATUS_COLORS[status]}`}><Icon className="w-3 h-3" /> {status}</span>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}