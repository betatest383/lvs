import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, GraduationCap, FileText, Workflow, ClipboardList, Shield, BarChart3, ClipboardCheck, Package, Award, Monitor } from 'lucide-react';

const TRACKERS = [
  { field: 'required_sops', label: 'SOPs', icon: FileText, entity: 'SopRegistry', idField: 'sop_id' },
  { field: 'required_workflows', label: 'Workflows', icon: Workflow, entity: 'WorkflowRegistry', idField: 'workflow_id' },
  { field: 'required_forms', label: 'Forms', icon: ClipboardList, entity: 'FormRegistry', idField: 'form_id' },
  { field: 'required_kpis', label: 'KPIs', icon: BarChart3, entity: 'KpiRegistry', idField: 'kpi_id' },
  { field: 'required_audits', label: 'Audits', icon: ClipboardCheck, entity: 'AuditTemplate', idField: 'template_id' },
  { field: 'business_processes', label: 'Business Processes', icon: Package, entity: 'BusinessProcess', idField: 'process_id' },
];

export default function TrainingRequirements() {
  const [roles, setRoles] = useState([]);
  const [registryData, setRegistryData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const rolesData = await base44.entities.RoleRegistry.filter({ status: 'Active' }, 'sort_order', 200);
        setRoles(rolesData);

        const entries = await Promise.all(
          TRACKERS.map(async t => {
            try {
              const recs = await base44.entities[t.entity].list('-created_date', 200);
              return [t.field, recs || []];
            } catch {
              return [t.field, []];
            }
          })
        );
        setRegistryData(Object.fromEntries(entries));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const findLabel = (tracker, id) => {
    const recs = registryData[tracker.field] || [];
    const rec = recs.find(r => r[tracker.idField] === id);
    return rec ? rec.title || rec.template_name : id;
  };

  const totalItems = roles.reduce((s, r) =>
    s + (r.required_sops?.length || 0) + (r.required_workflows?.length || 0) + (r.required_forms?.length || 0) + (r.required_certifications?.length || 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Training Requirements</h1>
        <p className="text-muted-foreground text-sm">SOPs, workflows, forms, certifications, and audits required per role</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-blue-100 text-blue-600"><GraduationCap className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{roles.length}</p><p className="text-xs text-muted-foreground">Active Roles</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-pink-100 text-pink-600"><FileText className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{roles.reduce((s, r) => s + (r.required_sops?.length || 0), 0)}</p><p className="text-xs text-muted-foreground">Total SOPs</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-amber-100 text-amber-600"><Award className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{roles.reduce((s, r) => s + (r.required_certifications?.length || 0), 0)}</p><p className="text-xs text-muted-foreground">Certifications</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-purple-100 text-purple-600"><Package className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{totalItems}</p><p className="text-xs text-muted-foreground">Total Training Items</p>
        </CardContent></Card>
      </div>

      <div className="space-y-3">
        {roles.map(role => {
          const hasAny = TRACKERS.some(t => (role[t.field]?.length || 0) > 0) || (role.required_certifications?.length || 0) > 0 || (role.required_software?.length || 0) > 0 || role.required_equipment_package;
          if (!hasAny) return null;

          return (
            <Card key={role.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <Link to={`/roles/detail/${role.id}`} className="hover:text-accent flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-muted-foreground" />
                    {role.role_name}
                  </Link>
                  <span className="text-xs text-muted-foreground">{role.department}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {TRACKERS.map(tracker => {
                  const items = role[tracker.field];
                  if (!items || items.length === 0) return null;
                  return (
                    <div key={tracker.field}>
                      <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                        <tracker.icon className="w-3 h-3" /> {tracker.label} ({items.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {items.map((id, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-full bg-muted text-xs">{findLabel(tracker, id)}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {role.required_certifications?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><Award className="w-3 h-3" /> Certifications ({role.required_certifications.length})</p>
                    <div className="flex flex-wrap gap-1">
                      {role.required_certifications.map((c, i) => <span key={i} className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs">{c}</span>)}
                    </div>
                  </div>
                )}
                {role.required_software?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><Monitor className="w-3 h-3" /> Software ({role.required_software.length})</p>
                    <div className="flex flex-wrap gap-1">
                      {role.required_software.map((s, i) => <span key={i} className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs">{s}</span>)}
                    </div>
                  </div>
                )}
                {role.required_equipment_package && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><Package className="w-3 h-3" /> Equipment Package</p>
                    <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs">{role.required_equipment_package}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}