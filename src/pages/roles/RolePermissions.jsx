import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Shield, CheckCircle2, XCircle } from 'lucide-react';
import { PERMISSION_LEVELS, PERMISSION_LEVEL_COLORS, PERMISSION_FLAGS, STATUS_COLORS } from '@/lib/roleRegistryConstants';

export default function RolePermissions() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.RoleRegistry.filter({ status: 'Active' }, 'sort_order', 200)
      .then(setRoles)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Role Permissions</h1>
        <p className="text-muted-foreground text-sm">Permission levels, authority flags, and access comparison</p>
      </div>

      {/* Permission Level Legend */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4" /> Permission Levels</CardTitle></CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-2">
            {PERMISSION_LEVELS.map(p => (
              <div key={p.value} className="border rounded-lg p-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PERMISSION_LEVEL_COLORS[p.value]}`}>{p.label}</span>
                </div>
                <p className="text-xs text-muted-foreground">{p.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Comparison Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium sticky left-0 bg-muted/50">Role</th>
              <th className="px-3 py-2 font-medium hidden md:table-cell">Department</th>
              <th className="px-3 py-2 font-medium">Level</th>
              {PERMISSION_FLAGS.map(f => (
                <th key={f.key} className="px-3 py-2 font-medium text-center" title={f.label}>
                  <span className="text-xs">{f.label.split(' ').slice(-2).join(' ')}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map(r => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2">
                  <Link to={`/roles/detail/${r.id}`} className="font-medium hover:text-accent">{r.role_name}</Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{r.department}</td>
                <td className="px-3 py-2">
                  {r.permission_level && <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${PERMISSION_LEVEL_COLORS[r.permission_level] || ''}`}>{r.permission_level}</span>}
                </td>
                {PERMISSION_FLAGS.map(f => (
                  <td key={f.key} className="px-3 py-2 text-center">
                    {r[f.key]
                      ? <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto" />
                      : <XCircle className="w-4 h-4 text-muted-foreground/30 mx-auto" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary by flag */}
      <div className="grid md:grid-cols-3 gap-3">
        {PERMISSION_FLAGS.map(flag => {
          const count = roles.filter(r => r[flag.key]).length;
          return (
            <Card key={flag.key}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{flag.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{flag.description}</p>
                  </div>
                  <span className="text-2xl font-bold text-accent">{count}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}