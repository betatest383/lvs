import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, GitBranch, ArrowRight, ChevronLeft } from 'lucide-react';

export default function CareerPaths() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.RoleRegistry.list('-sort_order', 500)
      .then(setRoles)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const nameMap = {};
  roles.forEach(r => { nameMap[r.role_name] = r; });

  // Find entry-level roles (no one promotes to them, or they have career_path_from empty)
  const isEntryLevel = (role) => {
    const isTarget = roles.some(r => (r.career_path_to || []).includes(role.role_name));
    return !isEntryLevel && (!role.career_path_from || role.career_path_from.length === 0);
  };

  const entryRoles = roles.filter(isEntryLevel);
  const allPaths = [];

  // Build paths from each entry role
  const buildPath = (role, visited = new Set()) => {
    if (visited.has(role.role_name)) return [];
    visited.add(role.role_name);
    const paths = [];
    const nextRoles = (role.career_path_to || []).map(name => nameMap[name]).filter(Boolean);
    if (nextRoles.length === 0) {
      return [[role]];
    }
    for (const next of nextRoles) {
      const subPaths = buildPath(next, new Set(visited));
      for (const sub of subPaths) {
        paths.push([role, ...sub]);
      }
    }
    return paths.length > 0 ? paths : [[role]];
  };

  for (const entry of entryRoles) {
    allPaths.push(...buildPath(entry));
  }

  // Also include any roles not captured
  const inPaths = new Set();
  allPaths.forEach(path => path.forEach(r => inPaths.add(r.role_name)));
  const orphans = roles.filter(r => !inPaths.has(r.role_name));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Career Paths</h1>
        <p className="text-muted-foreground text-sm">Role progression and advancement paths</p>
      </div>

      {roles.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-xl">
          <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No roles yet. Define "Promotes To" and "Promoted From" fields to map career paths.
        </div>
      ) : (
        <div className="space-y-4">
          {allPaths.map((path, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {path.map((role, idx) => (
                    <div key={role.id} className="flex items-center gap-2">
                      <Link to={`/roles/detail/${role.id}`} className="px-3 py-1.5 rounded-lg border bg-card hover:bg-muted/50 transition-colors text-sm font-medium">
                        {role.role_name}
                      </Link>
                      {idx < path.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {path.length} step{path.length !== 1 ? 's' : ''} · {path[0].department || 'Various'}
                </p>
              </CardContent>
            </Card>
          ))}
          {orphans.length > 0 && (
            <Card className="border-dashed">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-2">Roles not yet linked to a career path:</p>
                <div className="flex flex-wrap gap-1.5">
                  {orphans.map(r => (
                    <Link key={r.id} to={`/roles/detail/${r.id}`} className="px-2 py-1 rounded-full bg-muted text-xs hover:bg-muted/70 transition-colors">
                      {r.role_name}
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}