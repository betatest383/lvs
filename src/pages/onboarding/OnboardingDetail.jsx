import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  ChevronLeft, ChevronRight, Pencil, Loader2, CheckCircle2,
  UserPlus, Monitor, GraduationCap, Shield, Award, Package, Truck, BookOpen, ClipboardCheck,
  AlertTriangle, ListChecks,
} from 'lucide-react';
import PhaseChecklist from '@/components/onboarding/PhaseChecklist';
import RoleAssignmentSummary from '@/components/onboarding/RoleAssignmentSummary';
import OnboardingFormDialog from '@/components/onboarding/OnboardingFormDialog';
import {
  ONBOARDING_PHASES, PHASE_FIELDS, PHASE_TYPES,
  ONBOARDING_STATUS_COLORS, ONBOARDING_STATUSES,
  TASK_STATUS_COLORS, TASK_DEPARTMENTS,
  parseJSON, calcCompletionPct,
} from '@/lib/onboardingConstants';
import { toast } from 'sonner';

const PHASE_ICONS = {
  1: UserPlus, 2: Monitor, 3: GraduationCap, 4: Shield, 5: Award,
  6: Package, 7: Truck, 8: BookOpen, 9: ClipboardCheck,
};

export default function OnboardingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [role, setRole] = useState(null);
  const [activePhase, setActivePhase] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    base44.entities.EmployeeOnboarding.get(id)
      .then(rec => {
        setRecord(rec);
        setActivePhase(rec.current_phase || 1);
        if (rec.role_id) {
          base44.entities.RoleRegistry.list('-created_date', 500)
            .then(roles => {
              const found = roles.find(r => r.role_id === rec.role_id || r.id === rec.role_id);
              setRole(found || null);
            })
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;
  if (!record) return <div className="text-center py-12 text-muted-foreground">Onboarding record not found.</div>;

  const updateRecord = (updated) => {
    const pct = calcCompletionPct(updated);
    updated.overall_completion_pct = pct;
    if (pct > 0 && updated.status === 'Planned') updated.status = 'In Progress';
    if (pct === 100 && updated.status !== 'Completed') updated.status = 'Completed';
    setRecord(updated);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await base44.entities.EmployeeOnboarding.update(updated.id, updated);
      } catch {
        toast.error('Failed to save');
      } finally {
        setSaving(false);
      }
    }, 600);
  };

  const handlePhaseChange = (phaseNum, newItems) => {
    const fieldName = PHASE_FIELDS[phaseNum];
    updateRecord({
      ...record,
      [fieldName]: JSON.stringify(newItems),
      current_phase: Math.max(record.current_phase || 1, phaseNum),
    });
  };

  const updateTask = (index, updates) => {
    const tasks = parseJSON(record.tasks, []);
    const newTasks = [...tasks];
    newTasks[index] = { ...newTasks[index], ...updates };
    updateRecord({ ...record, tasks: JSON.stringify(newTasks) });
  };

  const updateStatus = (status) => {
    setRecord(prev => ({ ...prev, status }));
    base44.entities.EmployeeOnboarding.update(record.id, { status })
      .then(() => toast.success('Status updated'))
      .catch(() => toast.error('Failed to update status'));
  };

  const updateNotes = (notes) => {
    updateRecord({ ...record, notes });
  };

  const currentPhaseItems = parseJSON(record[PHASE_FIELDS[activePhase]], []);
  const tasks = parseJSON(record.tasks, []);
  const completedTasks = tasks.filter(t => t.status === 'complete').length;
  const overallPct = record.overall_completion_pct || 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/lvcos/onboarding/registry')}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex items-center gap-2">
          {saving && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving...</span>}
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}><Pencil className="w-3.5 h-3.5 mr-1" /> Edit</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{record.employee_name}</h1>
                <span className="font-mono text-xs text-muted-foreground">{record.onboarding_id}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {record.status && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ONBOARDING_STATUS_COLORS[record.status]}`}>{record.status}</span>}
                {record.primary_role && <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{record.primary_role}</span>}
                {record.department && <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 font-medium">{record.department}</span>}
              </div>
              {record.supervisor && <p className="text-sm text-muted-foreground mt-1">Supervisor: {record.supervisor}</p>}
              {record.start_date && <p className="text-sm text-muted-foreground">Start: {record.start_date}</p>}
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">{overallPct}%</p>
              <p className="text-xs text-muted-foreground">Overall Completion</p>
              <div className="w-32 h-2 bg-muted rounded-full overflow-hidden mt-1">
                <div className="h-full bg-accent transition-all" style={{ width: `${overallPct}%` }} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-1 overflow-x-auto pb-2">
                {ONBOARDING_PHASES.map(p => {
                  const items = parseJSON(record[PHASE_FIELDS[p.phase]], []);
                  const pct = items.length > 0 ? Math.round((items.filter(i => i.completed).length / items.length) * 100) : 0;
                  const isComplete = pct === 100 && items.length > 0;
                  const isActive = activePhase === p.phase;
                  const Icon = PHASE_ICONS[p.phase];
                  return (
                    <button
                      key={p.phase}
                      onClick={() => setActivePhase(p.phase)}
                      className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors shrink-0 min-w-[80px] select-none ${
                        isActive ? 'bg-accent/10 text-accent' : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        isComplete ? 'bg-green-100 text-green-600' : isActive ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'
                      }`}>
                        {isComplete ? <CheckCircle2 className="w-4 h-4" /> : p.phase}
                      </div>
                      <span className="text-xs font-medium whitespace-nowrap">{p.name}</span>
                      {items.length > 0 && <span className="text-[10px] text-muted-foreground">{pct}%</span>}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                {(() => { const Icon = PHASE_ICONS[activePhase]; return <Icon className="w-5 h-5 text-accent" />; })()}
                <h2 className="text-lg font-bold">{ONBOARDING_PHASES.find(p => p.phase === activePhase)?.name}</h2>
                <span className="text-xs text-muted-foreground">Phase {activePhase} of 9</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{ONBOARDING_PHASES.find(p => p.phase === activePhase)?.description}</p>
              <PhaseChecklist
                items={currentPhaseItems}
                onChange={(newItems) => handlePhaseChange(activePhase, newItems)}
                phaseType={PHASE_TYPES[activePhase]}
              />
              <div className="flex justify-between mt-4">
                <Button variant="outline" size="sm" disabled={activePhase === 1} onClick={() => setActivePhase(activePhase - 1)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                </Button>
                <Button size="sm" disabled={activePhase === 9} onClick={() => setActivePhase(activePhase + 1)} className="bg-accent text-accent-foreground hover:bg-accent/90">
                  Next Phase <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold flex items-center gap-2"><ListChecks className="w-5 h-5 text-accent" /> Onboarding Tasks</h2>
                <span className="text-sm text-muted-foreground">{completedTasks} of {tasks.length} complete</span>
              </div>
              <div className="space-y-3">
                {TASK_DEPARTMENTS.map(dept => {
                  const deptTasks = tasks.map((t, i) => ({ ...t, _idx: i })).filter(t => t.department === dept);
                  if (deptTasks.length === 0) return null;
                  return (
                    <div key={dept}>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{dept}</h3>
                      <div className="space-y-1">
                        {deptTasks.map(task => (
                          <div key={task._idx} className="flex items-center gap-2 p-2 rounded-lg border bg-card">
                            <Select value={task.status} onValueChange={v => updateTask(task._idx, { status: v })}>
                              <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="in_progress">In Progress</SelectItem>
                                <SelectItem value="complete">Complete</SelectItem>
                                <SelectItem value="blocked">Blocked</SelectItem>
                              </SelectContent>
                            </Select>
                            <span className="text-sm flex-1">{task.task}</span>
                            <span className={`px-1.5 py-0.5 rounded text-xs ${TASK_STATUS_COLORS[task.status] || ''}`}>{task.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <RoleAssignmentSummary role={role} />

          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold">Onboarding Status</h3>
              <Select value={record.status} onValueChange={updateStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ONBOARDING_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Notes</label>
                <Textarea value={record.notes || ''} onChange={e => updateNotes(e.target.value)} rows={3} placeholder="Add notes..." />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Outstanding Items</h3>
              {ONBOARDING_PHASES.map(p => {
                const items = parseJSON(record[PHASE_FIELDS[p.phase]], []);
                const incomplete = items.filter(i => !i.completed).length;
                if (incomplete === 0) return null;
                return (
                  <div key={p.phase} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{p.name}</span>
                    <span className="font-medium text-amber-600">{incomplete} pending</span>
                  </div>
                );
              })}
              {(() => {
                const allComplete = ONBOARDING_PHASES.every(p => {
                  const items = parseJSON(record[PHASE_FIELDS[p.phase]], []);
                  return items.length > 0 && items.every(i => i.completed);
                }) && tasks.every(t => t.status === 'complete');
                return allComplete ? <p className="text-sm text-green-600 font-medium">All phases complete!</p> : null;
              })()}
            </CardContent>
          </Card>
        </div>
      </div>

      <OnboardingFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initialData={record}
        onSave={async (data) => {
          await base44.entities.EmployeeOnboarding.update(record.id, data);
          toast.success('Onboarding updated');
          setRecord({ ...record, ...data });
        }}
      />
    </div>
  );
}