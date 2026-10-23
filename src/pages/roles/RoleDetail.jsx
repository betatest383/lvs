import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeft, Pencil, ExternalLink, Shield, GraduationCap, GitBranch, Building2, Monitor, Package, CheckCircle2, XCircle } from 'lucide-react';
import RoleRegistryFormDialog from '@/components/lvcos/RoleRegistryFormDialog';
import { PERMISSION_LEVELS, PERMISSION_FLAGS, PERMISSION_LEVEL_COLORS, STATUS_COLORS, PORTALS } from '@/lib/roleRegistryConstants';
import { toast } from 'sonner';

const ArrayList = ({ items }) => {
  if (!items || items.length === 0) return <p className="text-sm text-muted-foreground">None specified</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={i} className="px-2 py-0.5 rounded-full bg-muted text-xs font-medium">{item}</span>
      ))}
    </div>
  );
};

const InfoRow = ({ label, value }) => (
  <div className="flex justify-between items-start gap-2 py-1.5 border-b last:border-0">
    <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
    <span className="text-sm font-medium text-right">{value || '—'}</span>
  </div>
);

export default function RoleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    base44.entities.RoleRegistry.get(id)
      .then(setRole)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;
  if (!role) return <div className="text-center py-12 text-muted-foreground">Role not found. <Link to="/roles/registry" className="text-accent">Back to registry</Link></div>;

  const permLevel = PERMISSION_LEVELS.find(p => p.value === role.permission_level);
  const portal = PORTALS.find(p => p.value === role.default_portal);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/roles/registry')}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
        <Button size="sm" onClick={() => setEditOpen(true)}><Pencil className="w-3.5 h-3.5 mr-1" /> Edit</Button>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{role.role_name}</h1>
                <span className="font-mono text-xs text-muted-foreground">{role.role_id}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {role.department && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{role.department}</span>}
                {role.status && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[role.status] || ''}`}>{role.status}</span>}
                {role.permission_level && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PERMISSION_LEVEL_COLORS[role.permission_level] || ''}`}>{role.permission_level}</span>}
              </div>
            </div>
            {role.trainual_document && (
              <a href={role.trainual_document} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm"><ExternalLink className="w-3.5 h-3.5 mr-1" /> Trainual</Button>
              </a>
            )}
          </div>
          {role.role_description && <p className="text-sm text-muted-foreground mt-3">{role.role_description}</p>}
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="career">Career Path</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Building2 className="w-4 h-4" /> Hierarchy</CardTitle></CardHeader>
              <CardContent>
                <InfoRow label="Reports To" value={role.reports_to} />
                <InfoRow label="Supervises" value={Array.isArray(role.supervises) ? role.supervises.join(', ') : ''} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Monitor className="w-4 h-4" /> Portal & Dashboard</CardTitle></CardHeader>
              <CardContent>
                <InfoRow label="Default Portal" value={portal?.label || role.default_portal} />
                <InfoRow label="Dashboard" value={role.dashboard} />
                <InfoRow label="Home Screen" value={role.home_screen} />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Package className="w-4 h-4" /> Equipment & Software</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Required Equipment Package</p>
                <p className="text-sm font-medium">{role.required_equipment_package || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Required Software</p>
                <ArrayList items={role.required_software} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="training" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Business Processes</CardTitle></CardHeader>
              <CardContent><ArrayList items={role.business_processes} /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Required SOPs</CardTitle></CardHeader>
              <CardContent><ArrayList items={role.required_sops} /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Required Workflows</CardTitle></CardHeader>
              <CardContent><ArrayList items={role.required_workflows} /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Required Forms</CardTitle></CardHeader>
              <CardContent><ArrayList items={role.required_forms} /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Required Policies</CardTitle></CardHeader>
              <CardContent><ArrayList items={role.required_policies} /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Required KPIs</CardTitle></CardHeader>
              <CardContent><ArrayList items={role.required_kpis} /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Required Audits</CardTitle></CardHeader>
              <CardContent><ArrayList items={role.required_audits} /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><GraduationCap className="w-4 h-4" /> Required Certifications</CardTitle></CardHeader>
              <CardContent><ArrayList items={role.required_certifications} /></CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="permissions" className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4" /> Permission Level</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-1 rounded-full text-sm font-medium ${PERMISSION_LEVEL_COLORS[role.permission_level] || ''}`}>{role.permission_level}</span>
              </div>
              {permLevel && <p className="text-sm text-muted-foreground">{permLevel.description}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Authority Flags</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {PERMISSION_FLAGS.map(flag => {
                const enabled = role[flag.key];
                return (
                  <div key={flag.key} className="flex items-center gap-2 py-1">
                    {enabled ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-muted-foreground/40" />}
                    <div>
                      <p className="text-sm font-medium">{flag.label}</p>
                      <p className="text-xs text-muted-foreground">{flag.description}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="career" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><GitBranch className="w-4 h-4" /> Promoted From</CardTitle></CardHeader>
              <CardContent><ArrayList items={role.career_path_from} /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><GitBranch className="w-4 h-4" /> Promotes To</CardTitle></CardHeader>
              <CardContent><ArrayList items={role.career_path_to} /></CardContent>
            </Card>
          </div>
          {role.notes && (
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground mb-1">Notes</p><p className="text-sm">{role.notes}</p></CardContent></Card>
          )}
        </TabsContent>
      </Tabs>

      <RoleRegistryFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initialData={role}
        onSave={async (data) => {
          await base44.entities.RoleRegistry.update(role.id, data);
          toast.success('Role updated');
          setRole({ ...role, ...data });
          setEditOpen(false);
        }}
        allRoles={[]}
      />
    </div>
  );
}