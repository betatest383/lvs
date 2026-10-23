import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Shield, GraduationCap, GitBranch, CheckCircle2, UserCog, Building2, BarChart3 } from 'lucide-react';

export default function RoleDashboard() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.RoleRegistry.list('-sort_order', 500)
      .then(setRoles)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  const active = roles.filter(r => r.status === 'Active');
  const draft = roles.filter(r => r.status === 'Draft');
  const byDept = {};
  roles.forEach(r => {
    const d = r.department || 'Unassigned';
    byDept[d] = (byDept[d] || 0) + 1;
  });
  const withOverrides = roles.filter(r => r.can_override_readiness).length;
  const withApproval = roles.filter(r => r.manager_approval_authority).length;
  const withEmployeeMgmt = roles.filter(r => r.can_manage_employees).length;
  const totalTrainingItems = roles.reduce((s, r) =>
    s + (r.required_sops?.length || 0) + (r.required_workflows?.length || 0) + (r.required_forms?.length || 0) + (r.required_certifications?.length || 0), 0);

  const kpis = [
    { label: 'Total Roles', value: roles.length, icon: Users, to: '/roles/registry', color: 'bg-blue-100 text-blue-600' },
    { label: 'Active', value: active.length, icon: CheckCircle2, to: '/roles/registry', color: 'bg-green-100 text-green-600' },
    { label: 'Draft', value: draft.length, icon: UserCog, to: '/roles/registry', color: 'bg-gray-100 text-gray-600' },
    { label: 'Departments', value: Object.keys(byDept).length, icon: Building2, to: '/roles/relationships', color: 'bg-cyan-100 text-cyan-600' },
    { label: 'Approval Authority', value: withApproval, icon: Shield, to: '/roles/permissions', color: 'bg-purple-100 text-purple-600' },
    { label: 'Override Readiness', value: withOverrides, icon: Shield, to: '/roles/permissions', color: 'bg-amber-100 text-amber-600' },
    { label: 'Manage Employees', value: withEmployeeMgmt, icon: Users, to: '/roles/permissions', color: 'bg-indigo-100 text-indigo-600' },
    { label: 'Training Items', value: totalTrainingItems, icon: GraduationCap, to: '/roles/training', color: 'bg-pink-100 text-pink-600' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Role Registry Dashboard</h1>
        <p className="text-muted-foreground text-sm">Master database for every company role — dashboards, permissions, onboarding, training, and documentation.</p>
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
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /> Roles by Department</h3>
            <div className="space-y-2">
              {Object.entries(byDept).sort((a, b) => b[1] - a[1]).map(([dept, count]) => (
                <div key={dept} className="flex justify-between text-sm">
                  <span>{dept}</span>
                  <span className="px-2 py-0.5 rounded-full bg-muted text-xs font-medium">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-muted-foreground" /> Active Roles</h3>
            <div className="space-y-1">
              {active.slice(0, 8).map(role => (
                <Link key={role.id} to={`/roles/detail/${role.id}`} className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                  <span className="truncate">{role.role_name}</span>
                  <span className="text-xs text-muted-foreground">{role.department}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <Link to="/roles/relationships" className="block">
          <Card className="hover:shadow-md transition-shadow"><CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-emerald-100 text-emerald-600"><GitBranch className="w-5 h-5" /></div>
            <div><p className="text-sm font-medium">Role Relationships</p><p className="text-xs text-muted-foreground">Org hierarchy & reporting</p></div>
          </CardContent></Card>
        </Link>
        <Link to="/roles/permissions" className="block">
          <Card className="hover:shadow-md transition-shadow"><CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-100 text-purple-600"><Shield className="w-5 h-5" /></div>
            <div><p className="text-sm font-medium">Permissions</p><p className="text-xs text-muted-foreground">Access levels & authority</p></div>
          </CardContent></Card>
        </Link>
        <Link to="/roles/training" className="block">
          <Card className="hover:shadow-md transition-shadow"><CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-pink-100 text-pink-600"><GraduationCap className="w-5 h-5" /></div>
            <div><p className="text-sm font-medium">Training Requirements</p><p className="text-xs text-muted-foreground">SOPs, forms, certifications</p></div>
          </CardContent></Card>
        </Link>
      </div>
    </div>
  );
}