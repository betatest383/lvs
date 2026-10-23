import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronRight, ArrowDown, Network } from 'lucide-react';
import { PERMISSION_LEVEL_COLORS, STATUS_COLORS } from '@/lib/roleRegistryConstants';

export default function RoleRelationships() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.RoleRegistry.list('-sort_order', 500)
      .then(setRoles)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  const nameMap = {};
  roles.forEach(r => { nameMap[r.role_name] = r; });

  // Build hierarchy: roles that no one reports to (top-level) or have no reports_to
  const topLevel = roles.filter(r => !r.reports_to);
  const bySupervisor = {};
  roles.forEach(r => {
    if (r.reports_to) {
      if (!bySupervisor[r.reports_to]) bySupervisor[r.reports_to] = [];
      bySupervisor[r.reports_to].push(r);
    }
  });

  const renderRoleNode = (role, depth = 0) => {
    const reports = bySupervisor[role.role_name] || [];
    return (
      <div key={role.id} className="relative" style={{ marginLeft: depth > 0 ? 24 : 0 }}>
        <Link to={`/roles/detail/${role.id}`}>
          <Card className={`hover:shadow-md transition-shadow mb-2 ${depth === 0 ? 'border-l-4 border-l-accent' : ''}`}>
            <CardContent className="p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{role.role_name}</p>
                  {role.role_id && <span className="text-[10px] font-mono text-muted-foreground">{role.role_id}</span>}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {role.department && <span className="text-xs text-muted-foreground">{role.department}</span>}
                  {role.permission_level && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${PERMISSION_LEVEL_COLORS[role.permission_level] || ''}`}>{role.permission_level}</span>}
                  {role.status && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[role.status] || ''}`}>{role.status}</span>}
                </div>
              </div>
              {reports.length > 0 && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
            </CardContent>
          </Card>
        </Link>
        {reports.length > 0 && (
          <div className="border-l-2 border-border ml-4 pl-2">
            {reports.map(child => renderRoleNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const orphans = roles.filter(r => r.reports_to && !nameMap[r.reports_to]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Role Relationships</h1>
        <p className="text-muted-foreground text-sm">Organizational hierarchy and reporting structure</p>
      </div>

      {roles.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-xl">
          <Network className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No roles yet. Create roles with "Reports To" fields to build the hierarchy.
        </div>
      ) : (
        <div className="space-y-3">
          {topLevel.map(role => renderRoleNode(role))}
          {orphans.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Unlinked roles (supervisor not found):</p>
              {orphans.map(role => renderRoleNode(role))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}