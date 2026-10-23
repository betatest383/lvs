import { useState } from 'react';
import { useEmployeeContext } from '@/hooks/useEmployeeContext';
import { useMyJobs } from '@/hooks/useMyJobs';
import { useJobHubDaily } from '@/hooks/useJobHubDaily';
import { useAuth } from '@/lib/AuthContext';
import ClockInCard from '@/components/jobhub/daily/ClockInCard';
import MorningWorkflowCard from '@/components/jobhub/daily/MorningWorkflowCard';
import FirstJobCard from '@/components/jobhub/daily/FirstJobCard';
import DayStartProgressBar from '@/components/jobhub/daily/DayStartProgressBar';
import DispatchCard from '@/components/jobhub/daily/DispatchCard';
import ManagerOverrideDialog from '@/components/jobhub/daily/ManagerOverrideDialog';
import NoJobActions from '@/components/jobhub/daily/NoJobActions';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink, CheckCircle2, Send, Loader2, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DAY_START_STEPS, getNextStep } from '@/lib/jobHubDailyConfig';

export default function JobHubDaily() {
  const { employee, effectiveName } = useEmployeeContext();
  const { user } = useAuth();
  const { todayJobs, loading: jobsLoading } = useMyJobs(employee);
  const navigate = useNavigate();
  const [overrideOpen, setOverrideOpen] = useState(false);

  const {
    session, morningRun, checklist, firstJobData, timer,
    loading, error, clockIn, completeStep, skipStep,
    startMorningWorkflow, dispatch, managerOverride, refresh,
  } = useJobHubDaily(employee, todayJobs);

  const hasJob = session?.has_scheduled_job || todayJobs.length > 0;
  const firstJob = firstJobData || todayJobs[0] || null;
  const clockedIn = !!session?.clock_in_time;
  const dispatched = session?.status === 'dispatched';

  const nextStep = getNextStep(checklist, hasJob);
  const nextTaskLabel = nextStep ? nextStep.label : null;

  const handleClockIn = async () => {
    try {
      await clockIn();
      toast.success('Clocked in — morning workflow timer started');
    } catch (e) {
      toast.error('Failed to clock in: ' + e.message);
    }
  };

  const handleCompleteStep = async (stepId) => {
    try {
      await completeStep(stepId);
      toast.success('Step completed');
      refresh();
    } catch (e) {
      toast.error('Failed: ' + e.message);
    }
  };

  const handleStartMorningWorkflow = async () => {
    try {
      await startMorningWorkflow();
    } catch (e) {
      toast.error('Failed to start morning workflow: ' + e.message);
    }
  };

  const handleOpenMorningWorkflow = async () => {
    await handleStartMorningWorkflow();
    navigate('/tech/readiness');
  };

  const handleDispatch = async () => {
    try {
      await dispatch();
      toast.success('Dispatched! Morning workflow timer stopped.');
      if (firstJob?.id) {
        navigate(`/tech/job-hub/${firstJob.id}`);
      }
    } catch (e) {
      toast.error('Failed to dispatch: ' + e.message);
    }
  };

  const handleManagerOverride = async (reason, signature) => {
    try {
      await managerOverride(reason, signature, user?.full_name || effectiveName);
      toast.success('Manager override applied — dispatch unlocked');
      refresh();
    } catch (e) {
      toast.error('Override failed: ' + e.message);
    }
  };

  if (loading || jobsLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
        <p className="text-sm text-muted-foreground">Loading your Job Hub...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-6 text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
          <p className="text-sm text-red-700 font-medium">{error}</p>
          <Button variant="outline" size="sm" onClick={refresh}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  // Build step action buttons for steps that navigate
  const renderStepActions = () => {
    if (!clockedIn || dispatched) return null;
    if (!nextStep || nextStep.isDispatch) return null;

    return (
      <Card className="border-0 shadow-sm border-l-4 border-l-accent">
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Next Action</p>
            <p className="font-semibold text-sm">{nextStep.label}</p>
          </div>
          <div className="flex gap-2">
            {nextStep.navigates && (
              <Button size="sm" variant="outline" className="gap-1" onClick={() => navigate(nextStep.link)}>
                <ExternalLink className="w-3.5 h-3.5" /> {nextStep.linkLabel || 'Open'}
              </Button>
            )}
            <Button size="sm" className="gap-1" onClick={() => handleCompleteStep(nextStep.id)}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Mark Complete
            </Button>
            {nextStep.conditional && (
              <Button size="sm" variant="ghost" onClick={() => skipStep(nextStep.id)}>
                Skip
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Job Hub</h1>
          <p className="text-sm text-muted-foreground">
            {effectiveName ? `Good morning, ${effectiveName.split(' ')[0]}` : 'Your daily workflow'}
            {' — '}
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Clock-In / Timer Card */}
      <ClockInCard session={session} timer={timer} onClockIn={handleClockIn} />

      {/* Progress Bar */}
      {clockedIn && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <DayStartProgressBar
              checklist={checklist}
              hasJob={hasJob}
              managerOverrideUsed={session?.manager_override_used}
              clockedIn={clockedIn}
            />
          </CardContent>
        </Card>
      )}

      {/* Next Action */}
      {renderStepActions()}

      {/* Morning Workflow + First Job side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {clockedIn && (
          <MorningWorkflowCard
            morningRun={morningRun}
            checklist={checklist}
            onStart={handleStartMorningWorkflow}
            onComplete={() => handleCompleteStep('morning_workflow')}
            hasJob={hasJob}
          />
        )}

        {hasJob && firstJob && (
          <FirstJobCard job={firstJob} nextTaskLabel={nextTaskLabel} />
        )}
      </div>

      {/* No Job Actions */}
      {clockedIn && !hasJob && (
        <NoJobActions onStartMorningWorkflow={handleOpenMorningWorkflow} />
      )}

      {/* Dispatch Card */}
      {clockedIn && hasJob && (
        <DispatchCard
          checklist={checklist}
          managerOverrideUsed={session?.manager_override_used}
          hasJob={hasJob}
          onDispatch={handleDispatch}
          onManagerOverride={() => setOverrideOpen(true)}
          session={session}
          truckAssignmentStatus={firstJob?.truck_assignment_status || 'Not Required'}
          onRequestManagerReview={() => {
            toast.info('Manager review requested for truck assignment');
          }}
        />
      )}

      {/* Dispatched state — link to Job Hub */}
      {dispatched && firstJob && (
        <Card className="border-0 shadow-sm bg-purple-50/40">
          <CardContent className="p-5 flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-sm">You're dispatched!</p>
              <p className="text-xs text-muted-foreground">Open the Job Hub for {firstJob.customer_name}</p>
            </div>
            <Button onClick={() => navigate(`/tech/job-hub/${firstJob.id}`)} className="gap-1.5">
              <Send className="w-4 h-4" /> Go to Job Hub
            </Button>
          </CardContent>
        </Card>
      )}

      <ManagerOverrideDialog
        open={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        onConfirm={handleManagerOverride}
      />
    </div>
  );
}