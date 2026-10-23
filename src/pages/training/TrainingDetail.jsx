import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft, Pencil, GraduationCap, Clock, User, Target,
  ListChecks, FileText, Calendar, CheckCircle2, Archive
} from 'lucide-react';
import TrainingGuideFormDialog from '@/components/training/TrainingGuideFormDialog';
import LinkedResourcesPanel from '@/components/resources/LinkedResourcesPanel';
import {
  TRAINING_STATUS_COLORS, TRAINING_TYPE_COLORS, TRAINING_STATUSES,
  TRAINING_TRANSITIONS, ROLE_OPTIONS, MODULE_ROUTE_OPTIONS,
  TRANSITION_PERMISSIONS, ROLE_TRANSITION_PERMISSIONS
} from '@/lib/trainingRegistryConstants';
import { toast } from 'sonner';

function parseSteps(str) {
  try { return JSON.parse(str || '[]'); } catch { return []; }
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between items-start gap-2 py-1.5 border-b last:border-0">
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
      <span className="text-sm font-medium text-right">{value || '—'}</span>
    </div>
  );
}

export default function TrainingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [guide, setGuide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthor, setIsAuthor] = useState(false);
  const [roleKey, setRoleKey] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [progress, setProgress] = useState(null);
  const [transitioning, setTransitioning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('manageTraining', {
        action: 'get',
        trainingId: id,
      });
      if (res.data?.success) {
        setGuide(res.data.guide);
        setIsAuthor(res.data.is_author || false);
        setRoleKey(res.data.canonical_role_key || '');
      } else if (res.data?.error) {
        toast.error(res.data.error);
      }
      // Also load progress
      const progRes = await base44.functions.invoke('manageTraining', {
        action: 'get_progress',
        trainingId: id,
      });
      if (progRes.data?.success) {
        setProgress(progRes.data.progress);
      }
    } catch (err) {
      toast.error('Failed to load training guide');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleTransition = async (newStatus) => {
    setTransitioning(true);
    try {
      const res = await base44.functions.invoke('manageTraining', {
        action: 'transition',
        trainingId: id,
        newStatus,
      });
      if (res.data?.success) {
        toast.success(`Status changed to ${newStatus}`);
        load();
      } else {
        toast.error(res.data?.error || 'Transition failed');
      }
    } catch {
      toast.error('Transition failed');
    } finally {
      setTransitioning(false);
    }
  };

  const handleRetire = async () => {
    if (!confirm(`Retire "${guide.title || guide.training_name}"? This will remove it from active use.`)) return;
    try {
      const res = await base44.functions.invoke('manageTraining', {
        action: 'retire',
        trainingId: id,
      });
      if (res.data?.success) {
        toast.success('Training guide retired');
        load();
      } else {
        toast.error(res.data?.error || 'Retire failed');
      }
    } catch {
      toast.error('Retire failed');
    }
  };

  const userTransitionPerms = ROLE_TRANSITION_PERMISSIONS[roleKey] || [];
  const canEditGuide = isAuthor && (roleKey === 'admin' || roleKey === 'owner' ||
    (roleKey === 'director_of_operations' && (guide?.status === 'Draft' || guide?.status === 'Needs Update')) ||
    roleKey === 'operations_manager');
  const canRetire = roleKey === 'admin' || roleKey === 'owner';

  const handleSave = async (data) => {
    try {
      const res = await base44.functions.invoke('manageTraining', {
        action: 'update',
        trainingId: guide.id,
        trainingData: data,
      });
      if (res.data?.success) {
        toast.success('Training guide updated');
        load();
      } else {
        throw new Error(res.data?.error);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to save');
    }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;
  if (!guide) return <div className="text-center py-12 text-muted-foreground">Training guide not found.</div>;

  const steps = parseSteps(guide.training_steps);
  const allowedTransitions = TRAINING_TRANSITIONS[guide.status] || [];
  const roleNames = (guide.applicable_roles || guide.required_roles || []).map(
    rk => ROLE_OPTIONS.find(r => r.key === rk)?.label || rk
  );
  const moduleLabel = MODULE_ROUTE_OPTIONS.find(m => m.module === guide.related_module)?.label || guide.related_module;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/lvcos/training/registry')}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex items-center gap-2">
          {canEditGuide && (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
            </Button>
          )}
          {canRetire && guide.status !== 'Retired' && (
            <Button size="sm" variant="outline" onClick={handleRetire}>
              <Archive className="w-3.5 h-3.5 mr-1" /> Retire
            </Button>
          )}
          {guide.status === 'Published' && (
            <Button
              size="sm"
              onClick={() => navigate(`/lvcos/training/guide/${guide.id}`)}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <GraduationCap className="w-3.5 h-3.5 mr-1" />
              {progress?.status === 'completed' ? 'Review Training' : progress?.status === 'in_progress' ? 'Resume Training' : 'Start Guided Training'}
            </Button>
          )}
        </div>
      </div>

      {/* Header Card */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{guide.title || guide.training_name}</h1>
                <span className="font-mono text-xs text-muted-foreground">{guide.training_number || guide.training_id}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {guide.training_type && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TRAINING_TYPE_COLORS[guide.training_type]}`}>{guide.training_type}</span>}
                {guide.department && <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 font-medium">{guide.department}</span>}
                {guide.status && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TRAINING_STATUS_COLORS[guide.status]}`}>{guide.status}</span>}
                {guide.version && <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">v{guide.version}</span>}
              </div>
            </div>
            {progress?.status === 'completed' && (
              <Badge className="bg-green-100 text-green-700">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Completed
              </Badge>
            )}
          </div>
          {guide.description && <p className="text-sm text-muted-foreground mt-3">{guide.description}</p>}
        </CardContent>
      </Card>

      {/* Status Transitions */}
      {isAuthor && allowedTransitions.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Status Actions</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {allowedTransitions
                .filter(status => {
                  const perm = TRANSITION_PERMISSIONS[status];
                  if (!perm) return false;
                  return userTransitionPerms.includes(perm);
                })
                .map(status => (
                  <Button
                    key={status}
                    size="sm"
                    variant="outline"
                    disabled={transitioning}
                    onClick={() => handleTransition(status)}
                  >
                    → {status}
                  </Button>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overview */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Target className="w-4 h-4" /> Learning</CardTitle></CardHeader>
          <CardContent>
            <InfoRow label="Learning Objective" value={guide.learning_objective} />
            <InfoRow label="Prerequisites" value={guide.prerequisites} />
            <InfoRow label="Estimated Time" value={guide.estimated_completion_time} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> Links</CardTitle></CardHeader>
          <CardContent>
            <InfoRow label="Related Module" value={moduleLabel} />
            <InfoRow label="Related Route" value={guide.related_route} />
            <InfoRow label="Related Task Type" value={guide.related_task_type} />
            <InfoRow label="Linked Task" value={guide.linked_task_number} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><User className="w-4 h-4" /> Applicable Roles</CardTitle></CardHeader>
          <CardContent>
            {roleNames.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {roleNames.map((name, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-muted text-xs font-medium">{name}</span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">All roles</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Calendar className="w-4 h-4" /> Versioning</CardTitle></CardHeader>
          <CardContent>
            <InfoRow label="Version" value={guide.version} />
            <InfoRow label="Effective Date" value={guide.effective_date} />
            <InfoRow label="Review Date" value={guide.review_date} />
            <InfoRow label="Published By" value={guide.published_by} />
            <InfoRow label="Published At" value={guide.published_at ? new Date(guide.published_at).toLocaleDateString() : null} />
          </CardContent>
        </Card>
      </div>

      {/* Training Steps Preview */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ListChecks className="w-4 h-4" /> Training Steps ({steps.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No steps configured.</p>
          ) : (
            <div className="space-y-2">
              {steps.map((step, i) => (
                <div key={i} className="border rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-accent">{step.step_number}</span>
                    <span className="text-sm font-medium">{step.title}</span>
                  </div>
                  {step.instructions && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{step.instructions}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Linked Product Resources */}
      <LinkedResourcesPanel entityType="TrainingRegistry" entityId={guide.id} title="Product Resources" />

      <TrainingGuideFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initialData={guide}
        onSave={handleSave}
      />
    </div>
  );
}