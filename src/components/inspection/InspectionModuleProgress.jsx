import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Lock, Loader2, ClipboardCheck, ArrowRight } from 'lucide-react';
import { MODULE_LABELS, MODULE_COLORS, getInspectionFlow } from '@/lib/inspectionModules';

/**
 * Displays modular inspection progress in the Job Hub.
 * Shows: Inspection Setup → Selected Modules → Complete
 * Each module shows completion percentage and status.
 */
export default function InspectionModuleProgress({ jobId, setup, submissions = [] }) {
  const selectedModules = setup?.selected_modules || [];
  const setupComplete = setup?.status === 'complete';
  const flow = getInspectionFlow(selectedModules);

  // Determine which modules have submissions
  const moduleProgress = useMemo(() => {
    const result = {};
    for (const sub of submissions) {
      const modKey = sub.inspection_type;
      if (sub.status === 'submitted' || sub.status === 'reviewed' || sub.status === 'approved') {
        result[modKey] = 'complete';
      } else if (sub.status === 'draft') {
        result[modKey] = 'in_progress';
      }
    }
    return result;
  }, [submissions]);

  const getModuleStatus = (modKey) => {
    if (modKey === 'inspection_setup') return setupComplete ? 'complete' : (setup ? 'in_progress' : 'pending');
    if (modKey === 'complete') {
      const allDone = selectedModules.every(m => moduleProgress[m] === 'complete');
      return allDone ? 'complete' : 'pending';
    }
    if (!setupComplete) return 'locked';
    if (!selectedModules.includes(modKey)) return 'not_selected';
    return moduleProgress[modKey] || 'pending';
  };

  const getModuleRoute = (modKey) => {
    if (modKey === 'inspection_setup') return `/tech/inspection-setup?job_id=${jobId}`;
    if (modKey === 'interior') return `/tech/inspection?job_id=${jobId}`;
    if (modKey === 'exterior') return `/tech/exterior-inspection?job_id=${jobId}`;
    return null;
  };

  const completedCount = flow.filter(s => getModuleStatus(s.key) === 'complete').length;
  const overallPct = Math.round((completedCount / flow.length) * 100);

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Inspection Progress</h3>
          <span className="text-xs text-muted-foreground">{overallPct}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${overallPct}%` }} />
        </div>
        <div className="space-y-1.5">
          {flow.map((step, idx) => {
            const isComplete = step.key === 'complete';
            const status = getModuleStatus(step.key);
            const route = getModuleRoute(step.key);
            const isLocked = status === 'locked';
            const isNotSelected = status === 'not_selected';

            return (
              <div key={step.key} className="flex items-center gap-2">
                {/* Step indicator */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                  status === 'complete' ? 'bg-green-500 text-white' :
                  isLocked ? 'bg-muted text-muted-foreground' :
                  isNotSelected ? 'bg-muted/50 text-muted-foreground/50' :
                  status === 'in_progress' ? 'bg-blue-500 text-white' :
                  'bg-violet-500 text-white'
                }`}>
                  {status === 'complete' ? <CheckCircle2 className="w-4 h-4" /> :
                   isLocked ? <Lock className="w-3 h-3" /> :
                   isNotSelected ? <span>–</span> :
                   status === 'in_progress' ? <Loader2 className="w-3 h-3 animate-spin" /> :
                   idx + 1}
                </div>

                {/* Label */}
                <span className={`text-xs flex-1 ${
                  status === 'complete' ? 'text-green-700 font-medium' :
                  isLocked ? 'text-muted-foreground' :
                  isNotSelected ? 'text-muted-foreground/50' :
                  'text-foreground'
                }`}>
                  {isComplete ? 'Inspection Complete' : step.label}
                </span>

                {/* Action */}
                {!isComplete && !isLocked && !isNotSelected && route && status !== 'complete' && (
                  <Link to={route} className="text-xs text-violet-600 hover:text-violet-700 flex items-center gap-0.5">
                    {status === 'in_progress' ? 'Continue' : 'Start'} <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
                {status === 'complete' && !isComplete && (
                  <span className="text-xs text-green-600">✓</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Setup required banner */}
        {!setupComplete && (
          <div className="pt-2 border-t">
            <Link
              to={`/tech/inspection-setup?job_id=${jobId}`}
              className="flex items-center justify-center gap-2 w-full h-9 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 transition-colors"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              {setup ? 'Continue Setup' : 'Start Setup'}
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}