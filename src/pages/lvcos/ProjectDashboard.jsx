import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  FileText, CheckCircle2, FileEdit, GitBranch, Zap,
  FolderKanban, TrendingUp, ChevronRight, Save, Target
} from 'lucide-react';
import { toast } from 'sonner';

export default function ProjectDashboard() {
  const [sops, setSops] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTargets, setEditingTargets] = useState(false);
  const [targetDraft, setTargetDraft] = useState({});
  const [savingTargets, setSavingTargets] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [sopRecs, wfRecs, tgtRecs] = await Promise.all([
          base44.entities.SopRegistry.list('-created_date', 500),
          base44.entities.WorkflowRegistry.list('-created_date', 500),
          base44.entities.ProjectTarget.list('sort_order', 50),
        ]);
        setSops(sopRecs);
        setWorkflows(wfRecs);
        setTargets(tgtRecs);
        const draft = {};
        tgtRecs.forEach(t => { draft[t.id] = { target_sops: t.target_sops, target_workflows: t.target_workflows, target_automations: t.target_automations }; });
        setTargetDraft(draft);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const written = sops.filter(s => ['Draft', 'In Review', 'Approved'].includes(s.status));
  const approved = sops.filter(s => s.status === 'Approved');
  const workflowsBuilt = workflows.filter(w => ['In Development', 'Testing', 'Live'].includes(w.status));
  const automationsComplete = workflows.filter(w => w.status === 'Live' && w.automation_required);

  const totalTargetSops = targets.reduce((sum, t) => sum + (t.target_sops || 0), 0);
  const totalTargetWorkflows = targets.reduce((sum, t) => sum + (t.target_workflows || 0), 0);
  const totalTargetAutomations = targets.reduce((sum, t) => sum + (t.target_automations || 0), 0);

  const deptProgress = targets.map(t => {
    const deptSops = sops.filter(s => s.department === t.department);
    const writtenCount = deptSops.filter(s => ['Draft', 'In Review', 'Approved'].includes(s.status)).length;
    const pct = t.target_sops > 0 ? Math.round((writtenCount / t.target_sops) * 100) : 0;
    return { ...t, written: writtenCount, total: deptSops.length, pct };
  });

  const upcoming = sops
    .filter(s => s.status === 'Planned' || s.status === 'Draft')
    .sort((a, b) => (a.sop_id || '').localeCompare(b.sop_id || ''))
    .slice(0, 10);

  const handleSaveTargets = async () => {
    setSavingTargets(true);
    try {
      const updates = Object.entries(targetDraft).map(([id, data]) =>
        base44.entities.ProjectTarget.update(id, data)
      );
      await Promise.all(updates);
      const refreshed = await base44.entities.ProjectTarget.list('sort_order', 50);
      setTargets(refreshed);
      setEditingTargets(false);
      toast.success('Department targets updated');
    } catch {
      toast.error('Failed to save targets');
    } finally {
      setSavingTargets(false);
    }
  };

  const overallCards = [
    { label: 'Planned SOPs', value: totalTargetSops, icon: Target, color: 'text-blue-600 bg-blue-50' },
    { label: 'Written', value: written.length, icon: FileEdit, color: 'text-amber-600 bg-amber-50' },
    { label: 'Approved', value: approved.length, icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
    { label: 'Workflows Built', value: workflowsBuilt.length, icon: GitBranch, color: 'text-teal-600 bg-teal-50' },
    { label: 'Automations Live', value: automationsComplete.length, icon: Zap, color: 'text-orange-600 bg-orange-50' },
  ];

  const overallPct = totalTargetSops > 0 ? Math.round((written.length / totalTargetSops) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">LVC OS Development</h1>
          <p className="text-muted-foreground text-sm">
            Build progress tracker for the Lehigh Valley Chimney Operating System.
          </p>
        </div>
        {!editingTargets ? (
          <Button variant="outline" size="sm" onClick={() => setEditingTargets(true)}>
            <Target className="w-4 h-4 mr-1.5" /> Edit Targets
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setEditingTargets(false); setTargetDraft(Object.fromEntries(targets.map(t => [t.id, { target_sops: t.target_sops, target_workflows: t.target_workflows, target_automations: t.target_automations }]))); }}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveTargets} disabled={savingTargets} className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Save className="w-4 h-4 mr-1.5" /> {savingTargets ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Overall Progress */}
          <Card className="border shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-accent" />
                <h2 className="text-sm font-semibold">Overall Progress</h2>
                <span className="ml-auto text-2xl font-bold text-accent">{overallPct}%</span>
              </div>
              <Progress value={overallPct} className="h-2.5 mb-4" />
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {overallCards.map((card, i) => (
                  <div key={i} className="rounded-lg border border-border p-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${card.color}`}>
                      <card.icon className="w-4 h-4" />
                    </div>
                    <p className="text-2xl font-bold leading-none">{card.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{card.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* By Department */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FolderKanban className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold">By Department</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {deptProgress.map(dept => (
                <Card key={dept.id} className="border shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono font-medium">{dept.prefix || '—'}</span>
                        <span className="text-sm font-medium">{dept.department}</span>
                      </div>
                      {editingTargets ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            className="w-16 h-7 text-xs"
                            value={targetDraft[dept.id]?.target_sops ?? 0}
                            onChange={e => setTargetDraft(prev => ({
                              ...prev,
                              [dept.id]: { ...prev[dept.id], target_sops: parseInt(e.target.value) || 0 }
                            }))}
                          />
                          <span className="text-xs text-muted-foreground">SOPs</span>
                        </div>
                      ) : (
                        <span className="text-sm font-bold text-accent">{dept.pct}%</span>
                      )}
                    </div>
                    <Progress value={dept.pct} className="h-2 mb-1.5" />
                    <p className="text-xs text-muted-foreground">
                      {dept.written} written of {dept.target_sops} target
                    </p>
                  </CardContent>
                </Card>
              ))}
              {deptProgress.length === 0 && (
                <Card className="col-span-full"><CardContent className="p-4 text-center text-sm text-muted-foreground">No department targets set. Click "Edit Targets" to set goals.</CardContent></Card>
              )}
            </div>
          </div>

          {/* Upcoming Work */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold">Upcoming Work</h2>
            </div>
            {upcoming.length === 0 ? (
              <Card><CardContent className="p-4 text-center text-sm text-muted-foreground">No planned or draft SOPs in queue.</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {upcoming.map(sop => (
                  <Link key={sop.id} to="/lvcos/sop-registry">
                    <Card className="border shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono font-medium whitespace-nowrap">{sop.sop_id || '—'}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{sop.title}</p>
                            <p className="text-xs text-muted-foreground">{sop.department || 'Unassigned'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sop.status === 'Draft' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                            {sop.status}
                          </span>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}