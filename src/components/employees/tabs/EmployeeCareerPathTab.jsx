import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUpRight, CheckCircle2, XCircle } from 'lucide-react';

export default function EmployeeCareerPathTab({ employee }) {
  const [currentRole, setCurrentRole] = useState(null);
  const [nextRoles, setNextRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employee.primary_role) { setLoading(false); return; }
    base44.entities.RoleRegistry.list('-sort_order', 200)
      .then(roles => {
        const match = roles.find(r => r.role_id === employee.primary_role || r.role_name === employee.primary_role);
        setCurrentRole(match || null);
        if (match?.career_path_to) {
          const nexts = roles.filter(r => match.career_path_to.includes(r.role_id) || match.career_path_to.includes(r.role_name));
          setNextRoles(nexts);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [employee]);

  if (loading) return <p className="text-sm text-muted-foreground text-center py-4">Loading career path...</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Current Role</CardTitle></CardHeader>
        <CardContent>
          {currentRole ? (
            <div>
              <Link to={`/roles/detail/${currentRole.id}`} className="font-medium text-sm hover:text-accent">{currentRole.role_name}</Link>
              <p className="text-xs text-muted-foreground mt-1">{currentRole.role_description}</p>
            </div>
          ) : <p className="text-sm text-muted-foreground">No role assigned.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ArrowUpRight className="w-4 h-4" /> Eligible Next Roles</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {nextRoles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No career progression path defined.</p>
          ) : nextRoles.map(role => (
            <div key={role.id} className="border rounded-lg p-3">
              <Link to={`/roles/detail/${role.id}`} className="font-medium text-sm hover:text-accent">{role.role_name}</Link>
              <p className="text-xs text-muted-foreground mt-1">{role.role_description}</p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <p className="text-xs font-medium mb-1">Required Training:</p>
                  <div className="flex flex-wrap gap-1">
                    {(role.required_sops || []).slice(0, 3).map((s, i) => <span key={i} className="px-1.5 py-0.5 rounded-full bg-muted text-xs">{s}</span>)}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1">Required Certs:</p>
                  <div className="flex flex-wrap gap-1">
                    {(role.required_certifications || []).slice(0, 3).map((c, i) => <span key={i} className="px-1.5 py-0.5 rounded-full bg-muted text-xs">{c}</span>)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Skill Gaps</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <XCircle className="w-4 h-4 text-amber-600" />
            Complete required training and certifications for next role to close skill gaps.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}