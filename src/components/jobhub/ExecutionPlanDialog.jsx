import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, ClipboardList, Users, Wrench, Package, Clock,
  ShieldAlert, CheckCircle2, CalendarDays, FileCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

function safeParse(str, fallback) {
  if (!str) return fallback;
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
}

function SectionCard({ icon: Icon, title, children, accent = 'text-foreground' }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Icon className={`w-4 h-4 ${accent}`} />
          <h4 className="text-sm font-semibold">{title}</h4>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export default function ExecutionPlanDialog({
  open,
  jobId,
  scopeOfWork,
  draftEstimateItems,
  estimate,
  effectiveName,
  onClose,
  onComplete,
}) {
  const [completing, setCompleting] = useState(false);

  const workPhases = safeParse(scopeOfWork?.work_phases, []);
  const requiredEquipment = safeParse(scopeOfWork?.required_equipment, []);
  const requiredMaterials = safeParse(scopeOfWork?.required_materials, []);
  const safetyNotes = safeParse(scopeOfWork?.safety_notes, []);
  const cleanupTasks = safeParse(scopeOfWork?.cleanup_tasks, []);

  // Approved / ready estimate items
  const approvedItems = (draftEstimateItems || []).filter(
    i => ['approved', 'ready'].includes(i.status)
  );

  const totalHours = scopeOfWork?.total_estimated_hours || 0;
  const totalCrew = scopeOfWork?.total_crew_required || 0;
  const totalJobDays = estimate?.total_job_days || 0;

  const handleComplete = async () => {
    setCompleting(true);
    try {
      // Generate multi-day appointments from the execution plan if the backend function exists
      let appointmentsGenerated = 0;
      if (jobId && totalJobDays > 0) {
        try {
          const response = await base44.functions.invoke('generateAppointmentsFromPlan', {
            job_id: jobId,
          });
          appointmentsGenerated = response?.data?.appointments_created || response?.appointments_created || 0;
          console.log('[ExecutionPlan] Appointments generated:', appointmentsGenerated);
        } catch (e) {
          console.warn('[ExecutionPlan] generateAppointmentsFromPlan failed:', e.message);
        }
      }

      await onComplete?.({ appointmentsGenerated });
    } catch (e) {
      console.error('[ExecutionPlan] Completion failed:', e);
      toast.error('Failed to complete execution plan: ' + e.message);
    } finally {
      setCompleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !completing) onClose?.(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-accent" />
            Execution Plan
          </DialogTitle>
        </DialogHeader>

        {!scopeOfWork ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No Scope of Work found. Please complete the Scope of Work stage first.
          </div>
        ) : (
          <div className="space-y-3">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-lg border bg-card p-3 text-center">
                <Clock className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-lg font-bold">{totalHours}h</p>
                <p className="text-[10px] text-muted-foreground uppercase">Est. Hours</p>
              </div>
              <div className="rounded-lg border bg-card p-3 text-center">
                <Users className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-lg font-bold">{totalCrew}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Crew Size</p>
              </div>
              <div className="rounded-lg border bg-card p-3 text-center">
                <CalendarDays className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-lg font-bold">{totalJobDays}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Job Days</p>
              </div>
              <div className="rounded-lg border bg-card p-3 text-center">
                <FileCheck className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-lg font-bold">{approvedItems.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Services</p>
              </div>
            </div>

            {/* Daily Work Plan */}
            {workPhases.length > 0 && (
              <SectionCard icon={CalendarDays} title="Daily Work Plan" accent="text-blue-600">
                <div className="space-y-2">
                  {workPhases.map((phase, i) => (
                    <div key={i} className="rounded-lg border p-2.5 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold">{phase.phase_name || `Phase ${i + 1}`}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {phase.estimated_hours || 0}h · {phase.crew_size || totalCrew} crew
                        </Badge>
                      </div>
                      {phase.service_name && (
                        <p className="text-muted-foreground">{phase.service_name}</p>
                      )}
                      {phase.tasks && phase.tasks.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-muted-foreground">
                          {phase.tasks.map((t, j) => (
                            <li key={j}>• {typeof t === 'string' ? t : t.task || t.name || JSON.stringify(t)}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Approved Estimate Items */}
            {approvedItems.length > 0 && (
              <SectionCard icon={FileCheck} title="Approved Services" accent="text-green-600">
                <div className="space-y-1.5">
                  {approvedItems.map((item, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border p-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{item.service_name || 'Unnamed Service'}</p>
                        {item.service_code && (
                          <p className="text-muted-foreground text-[10px]">{item.service_code}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="font-semibold">${(item.total_item_price || item.service_price || 0).toFixed(2)}</p>
                        <p className="text-[10px] text-muted-foreground">Qty: {item.quantity || 1}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Materials & Equipment */}
            <div className="grid sm:grid-cols-2 gap-3">
              <SectionCard icon={Package} title="Materials" accent="text-amber-600">
                {requiredMaterials.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No materials specified</p>
                ) : (
                  <div className="space-y-1">
                    {requiredMaterials.map((m, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="truncate">{m.material_name || 'Unknown'}</span>
                        <span className="text-muted-foreground shrink-0 ml-2">{m.quantity || 0} {m.unit || ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard icon={Wrench} title="Equipment" accent="text-purple-600">
                {requiredEquipment.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No equipment specified</p>
                ) : (
                  <div className="space-y-1">
                    {requiredEquipment.map((e, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="truncate">{e.item_name || 'Unknown'}</span>
                        <span className="text-muted-foreground shrink-0 ml-2">×{e.quantity || 1}</span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

            {/* Safety & Cleanup */}
            {(safetyNotes.length > 0 || cleanupTasks.length > 0) && (
              <div className="grid sm:grid-cols-2 gap-3">
                {safetyNotes.length > 0 && (
                  <SectionCard icon={ShieldAlert} title="Safety Notes" accent="text-red-600">
                    <ul className="space-y-1 text-xs">
                      {safetyNotes.map((s, i) => (
                        <li key={i}>• {typeof s === 'string' ? s : JSON.stringify(s)}</li>
                      ))}
                    </ul>
                  </SectionCard>
                )}
                {cleanupTasks.length > 0 && (
                  <SectionCard icon={CheckCircle2} title="Cleanup Tasks" accent="text-teal-600">
                    <ul className="space-y-1 text-xs">
                      {cleanupTasks.map((c, i) => (
                        <li key={i}>• {typeof c === 'string' ? c : JSON.stringify(c)}</li>
                      ))}
                    </ul>
                  </SectionCard>
                )}
              </div>
            )}

            {scopeOfWork?.internal_notes && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
                <p className="font-semibold text-amber-800 mb-1">Internal Notes</p>
                <p className="text-amber-700 whitespace-pre-wrap">{scopeOfWork.internal_notes}</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={completing}>
            Close
          </Button>
          <Button onClick={handleComplete} disabled={completing || !scopeOfWork}>
            {completing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Completing...</>
            ) : (
              <><CheckCircle2 className="w-4 h-4" /> Complete Execution Plan</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}