import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ChevronLeft, Pencil, ExternalLink, Shield, ClipboardCheck,
  Building2, Calendar, User, FileText
} from 'lucide-react';
import PolicyFormDialog from '@/components/lvcos/PolicyFormDialog';
import {
  POLICY_STATUS_COLORS, ENFORCEMENT_LEVEL_COLORS, ENFORCEMENT_LEVELS, POLICY_REGISTRY_LINK_CONFIG
} from '@/lib/policyRegistryConstants';
import { toast } from 'sonner';
import { format } from 'date-fns';

const ArrayList = ({ items }) => {
  if (!items || items.length === 0) return <p className="text-sm text-muted-foreground">None linked</p>;
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

export default function PolicyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    base44.entities.PolicyRegistry.get(id)
      .then(setPolicy)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;
  if (!policy) return <div className="text-center py-12 text-muted-foreground">Policy not found.</div>;

  const enforcement = ENFORCEMENT_LEVELS.find(e => e.value === policy.enforcement_level);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/lvcos/policies/registry')}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
        <Button size="sm" onClick={() => setEditOpen(true)}><Pencil className="w-3.5 h-3.5 mr-1" /> Edit</Button>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{policy.policy_name}</h1>
                <span className="font-mono text-xs text-muted-foreground">{policy.policy_id}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {policy.policy_type && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{policy.policy_type}</span>}
                {policy.department && <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 font-medium">{policy.department}</span>}
                {policy.status && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${POLICY_STATUS_COLORS[policy.status]}`}>{policy.status}</span>}
                {policy.enforcement_level && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ENFORCEMENT_LEVEL_COLORS[policy.enforcement_level]}`}>{policy.enforcement_level}</span>}
                {policy.version && <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">v{policy.version}</span>}
              </div>
            </div>
            {policy.trainual_link && (
              <a href={policy.trainual_link} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm"><ExternalLink className="w-3.5 h-3.5 mr-1" /> Trainual</Button>
              </a>
            )}
          </div>
          {policy.description && <p className="text-sm text-muted-foreground mt-3">{policy.description}</p>}
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="relationships">Relationships</TabsTrigger>
          <TabsTrigger value="acknowledgment">Acknowledgment</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><User className="w-4 h-4" /> Ownership</CardTitle></CardHeader>
              <CardContent>
                <InfoRow label="Policy Owner" value={policy.policy_owner} />
                <InfoRow label="Version" value={policy.version} />
                <InfoRow label="Status" value={policy.status} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Calendar className="w-4 h-4" /> Dates</CardTitle></CardHeader>
              <CardContent>
                <InfoRow label="Effective Date" value={policy.effective_date ? format(new Date(policy.effective_date), 'MMM d, yyyy') : ''} />
                <InfoRow label="Review Date" value={policy.review_date ? format(new Date(policy.review_date), 'MMM d, yyyy') : ''} />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4" /> Enforcement Level</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-1 rounded-full text-sm font-medium ${ENFORCEMENT_LEVEL_COLORS[policy.enforcement_level]}`}>{policy.enforcement_level}</span>
              </div>
              {enforcement && <p className="text-sm text-muted-foreground">{enforcement.description}</p>}
            </CardContent>
          </Card>
          {policy.notes && (
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground mb-1">Notes</p><p className="text-sm">{policy.notes}</p></CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="relationships" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {POLICY_REGISTRY_LINK_CONFIG.map(cfg => (
              <Card key={cfg.field}>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> {cfg.label}</CardTitle></CardHeader>
                <CardContent><ArrayList items={policy[cfg.field]} /></CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="acknowledgment" className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ClipboardCheck className="w-4 h-4" /> Acknowledgment Requirements</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <InfoRow label="Requires Acknowledgment" value={policy.requires_acknowledgment ? 'Yes' : 'No'} />
              <InfoRow label="Acknowledgment Frequency" value={policy.acknowledgment_frequency || '—'} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PolicyFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initialData={policy}
        onSave={async (data) => {
          await base44.entities.PolicyRegistry.update(policy.id, data);
          toast.success('Policy updated');
          setPolicy({ ...policy, ...data });
          setEditOpen(false);
        }}
      />
    </div>
  );
}