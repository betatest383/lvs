import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Grid3x3, CheckCircle2, XCircle, Award } from 'lucide-react';
import { CERTIFICATION_STATUS_COLORS, CERTIFICATION_TYPE_COLORS } from '@/lib/certificationRegistryConstants';

export default function CertificationMatrix() {
  const [certifications, setCertifications] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [certRecs, roleRecs] = await Promise.all([
          base44.entities.CertificationRegistry.filter({ status: 'Active' }, 'certification_type', 200),
          base44.entities.RoleRegistry.filter({ status: 'Active' }, 'sort_order', 200),
        ]);
        setCertifications(certRecs);
        setRoles(roleRecs);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const isCertRequiredForRole = (cert, role) => {
    const roleIds = cert.required_roles || [];
    return roleIds.includes(role.role_id) || roleIds.includes(role.role_name);
  };

  const roleStats = roles.map(role => {
    const required = certifications.filter(c => isCertRequiredForRole(c, role));
    return { role, total: required.length };
  });

  const maxRoleCerts = Math.max(...roleStats.map(r => r.total), 1);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Certification Matrix</h1>
        <p className="text-muted-foreground text-sm">Which certifications are required for each role</p>
      </div>

      {certifications.length === 0 || roles.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-xl">
          <Grid3x3 className="w-8 h-8 mx-auto mb-2 opacity-40" />
          Need both active certifications and active roles to build the matrix.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-4">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-blue-100 text-blue-600"><Award className="w-4 h-4" /></div>
              <p className="text-2xl font-bold">{certifications.length}</p><p className="text-xs text-muted-foreground">Active Certifications</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-purple-100 text-purple-600"><CheckCircle2 className="w-4 h-4" /></div>
              <p className="text-2xl font-bold">{roles.length}</p><p className="text-xs text-muted-foreground">Active Roles</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-amber-100 text-amber-600"><XCircle className="w-4 h-4" /></div>
              <p className="text-2xl font-bold">{certifications.filter(c => (c.required_roles?.length || 0) === 0).length}</p><p className="text-xs text-muted-foreground">Unassigned Certs</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-green-100 text-green-600"><CheckCircle2 className="w-4 h-4" /></div>
              <p className="text-2xl font-bold">{roles.filter(r => roleStats.find(rs => rs.role.id === r.id)?.total > 0).length}</p><p className="text-xs text-muted-foreground">Roles w/ Certs</p>
            </CardContent></Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Certification Count per Role</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {roleStats.map(({ role, total }) => (
                <div key={role.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <Link to={`/roles/detail/${role.id}`} className="font-medium hover:text-accent">{role.role_name}</Link>
                    <span className="text-muted-foreground">{total} cert{total !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div className="bg-accent h-full rounded-full" style={{ width: `${(total / maxRoleCerts) * 100}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Certification × Role Matrix</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 font-medium sticky left-0 bg-card">Certification</th>
                      <th className="py-2 font-medium hidden md:table-cell">Type</th>
                      {roles.map(r => (
                        <th key={r.id} className="px-2 py-2 font-medium text-center" title={r.role_name}>
                          <span className="text-xs whitespace-nowrap">{r.role_name.split(' ').map(w => w[0]).join('')}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {certifications.map(c => (
                      <tr key={c.id} className="border-b hover:bg-muted/30">
                        <td className="py-2">
                          <Link to={`/lvcos/certifications/detail/${c.id}`} className="font-medium hover:text-accent">{c.certification_name}</Link>
                        </td>
                        <td className="py-2 hidden md:table-cell">
                          {c.certification_type && <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${CERTIFICATION_TYPE_COLORS[c.certification_type]}`}>{c.certification_type}</span>}
                        </td>
                        {roles.map(r => {
                          const required = isCertRequiredForRole(c, r);
                          return (
                            <td key={r.id} className="px-2 py-2 text-center">
                              {required
                                ? <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto" />
                                : <span className="text-muted-foreground/30">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Legend: ✓ = required for this role · — = not required</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}