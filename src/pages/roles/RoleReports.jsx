import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, BarChart3, Users, Building2, Shield, GraduationCap, Package } from 'lucide-react';
import { PERMISSION_LEVEL_COLORS, STATUS_COLORS } from '@/lib/roleRegistryConstants';

export default function RoleReports() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.RoleRegistry.list('-sort_order', 500)
      .then(setRoles)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  // Department breakdown
  const byDept = {};
  roles.forEach(r => {
    const d = r.department || 'Unassigned';
    if (!byDept[d]) byDept[d] = { total: 0, active: 0, draft: 0, managers: 0 };
    byDept[d].total++;
    if (r.status === 'Active') byDept[d].active++;
    if (r.status === 'Draft') byDept[d].draft++;
    if (r.manager_approval_authority) byDept[d].managers++;
  });

  // Permission level breakdown
  const byPerm = {};
  roles.forEach(r => {
    const p = r.permission_level || 'none';
    byPerm[p] = (byPerm[p] || 0) + 1;
  });

  // Training coverage
  const trainingFields = ['required_sops', 'required_workflows', 'required_forms', 'required_policies', 'required_kpis', 'required_audits', 'required_certifications', 'required_software'];
  const coverageByField = {};
  trainingFields.forEach(f => {
    coverageByField[f] = {
      withItems: roles.filter(r => (r[f]?.length || 0) > 0).length,
      totalItems: roles.reduce((s, r) => s + (r[f]?.length || 0), 0),
    };
  });

  // Status breakdown
  const byStatus = {};
  roles.forEach(r => {
    const s = r.status || 'Unknown';
    byStatus[s] = (byStatus[s] || 0) + 1;
  });

  const maxDept = Math.max(...Object.values(byDept).map(d => d.total), 1);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Role Reports</h1>
        <p className="text-muted-foreground text-sm">Analytics across all company roles</p>
      </div>

      {/* Status breakdown */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Role Status Breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {Object.entries(byStatus).map(([status, count]) => (
              <div key={status} className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[status] || 'bg-muted'}`}>{status}</span>
                <span className="text-lg font-bold">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Department breakdown */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Building2 className="w-4 h-4" /> Roles by Department</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(byDept).sort((a, b) => b[1].total - a[1].total).map(([dept, data]) => (
            <div key={dept}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">{dept}</span>
                <span className="text-muted-foreground">{data.total} role{data.total !== 1 ? 's' : ''} · {data.active} active · {data.managers} with approval</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div className="bg-accent h-full rounded-full" style={{ width: `${(data.total / maxDept) * 100}%` }} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Permission level breakdown */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4" /> Permission Level Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(byPerm).sort((a, b) => b[1] - a[1]).map(([perm, count]) => (
                <div key={perm} className="flex justify-between items-center text-sm">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PERMISSION_LEVEL_COLORS[perm] || 'bg-muted'}`}>{perm}</span>
                  <span className="font-bold">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Training coverage */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><GraduationCap className="w-4 h-4" /> Training Coverage</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {Object.entries(coverageByField).map(([field, data]) => {
                const pct = roles.length > 0 ? Math.round((data.withItems / roles.length) * 100) : 0;
                const label = field.replace(/required_|business_/g, '').replace(/_/g, ' ');
                return (
                  <div key={field} className="flex justify-between items-center text-xs">
                    <span className="capitalize">{label}</span>
                    <span className={pct === 100 ? 'text-green-600 font-medium' : pct > 50 ? 'text-amber-600' : 'text-muted-foreground'}>
                      {data.withItems}/{roles.length} roles · {data.totalItems} items
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Full role list with key metrics */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Role Training Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 font-medium">Role</th>
                  <th className="py-2 font-medium text-center">SOPs</th>
                  <th className="py-2 font-medium text-center hidden md:table-cell">Workflows</th>
                  <th className="py-2 font-medium text-center hidden md:table-cell">Forms</th>
                  <th className="py-2 font-medium text-center hidden lg:table-cell">Certs</th>
                  <th className="py-2 font-medium text-center hidden lg:table-cell">Software</th>
                  <th className="py-2 font-medium text-center">Total</th>
                </tr>
              </thead>
              <tbody>
                {roles.map(r => {
                  const sops = r.required_sops?.length || 0;
                  const wfs = r.required_workflows?.length || 0;
                  const forms = r.required_forms?.length || 0;
                  const certs = r.required_certifications?.length || 0;
                  const sw = r.required_software?.length || 0;
                  const total = sops + wfs + forms + certs + sw;
                  return (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="py-2">
                        <Link to={`/roles/detail/${r.id}`} className="font-medium hover:text-accent">{r.role_name}</Link>
                      </td>
                      <td className="py-2 text-center">{sops || '—'}</td>
                      <td className="py-2 text-center hidden md:table-cell">{wfs || '—'}</td>
                      <td className="py-2 text-center hidden md:table-cell">{forms || '—'}</td>
                      <td className="py-2 text-center hidden lg:table-cell">{certs || '—'}</td>
                      <td className="py-2 text-center hidden lg:table-cell">{sw || '—'}</td>
                      <td className="py-2 text-center font-bold">{total}</td>
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