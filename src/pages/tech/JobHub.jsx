import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useEmployeeContext } from '@/hooks/useEmployeeContext';
import { useWorkflowState } from '@/hooks/useWorkflowState';
import { safeParse, computeProgressStep, getWorkflowMeta, WORKFLOW_STAGES } from '@/lib/workflowEngine';
import { startWorkflowTrace, traceStep, endWorkflowTrace, verifyPersistedCompletion, logDuplicateCheck } from '@/lib/workflowTrace';
import { resolveAuthoritativeInspectionSubmission } from '@/lib/inspectionSubmissionResolver';
// AR-001: Feature flag is evaluated once by the workflow engine (via useWorkflowState → derived → computeEffectiveStages).
// All components must consume wfMeta.useV2Workflow — never call isEstimatePackageWorkflowEnabled directly.
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ArrowLeft, AlertCircle, Ruler, ShieldCheck, Unlock, History } from 'lucide-react';
import { toast } from 'sonner';
import { formatTimeET } from '@/lib/timezone';

import JobHubHeader from '@/components/jobhub/JobHubHeader';
import JobHubSidebar from '@/components/jobhub/JobHubSidebar';
import JobTimeline from '@/components/jobhub/JobTimeline';
import CompletionEngine from '@/components/jobhub/CompletionEngine';
import DailyWorkPlanPanel from '@/components/jobhub/DailyWorkPlanPanel';
import InspectionEstimatePrompt from '@/components/jobhub/InspectionEstimatePrompt';
import SmartNextAction from '@/components/jobhub/SmartNextAction';
import WorkflowEngine from '@/components/jobhub/WorkflowEngine';
import WorkflowProgressBar from '@/components/jobhub/WorkflowProgressBar';
import ModuleAssignmentPanel from '@/components/jobhub/ModuleAssignmentPanel';
import LeadReviewPanel from '@/components/jobhub/LeadReviewPanel';
import ConflictLockDialog from '@/components/jobhub/ConflictLockDialog';
import ModuleReviewDialog from '@/components/jobhub/ModuleReviewDialog';
import InspectionSummaryDialog from '@/components/jobhub/InspectionSummaryDialog';
import RepairSystemReviewDialog from '@/components/jobhub/RepairSystemReviewDialog';
import EstimateReviewDialog from '@/components/jobhub/EstimateReviewDialog';
import PricingStage from '@/components/jobhub/PricingStage';
import AiReportSummaryDialog from '@/components/jobhub/AiReportSummaryDialog';
import CleanInspectionDialog, { useInspectionWorkflowConfig } from '@/components/jobhub/CleanInspectionDialog';
import CustomerSignatureModal from '@/components/jobhub/CustomerSignatureModal';
import ProjectProgressPanel from '@/components/jobhub/ProjectProgressPanel';
import PreviousDaySummary from '@/components/jobhub/PreviousDaySummary';
import RecommendationReviewDialog from '@/components/jobhub/RecommendationReviewDialog';
import RecommendationReviewBlockDialog from '@/components/jobhub/RecommendationReviewBlockDialog';
import RecommendationReviewDiagnostics from '@/components/jobhub/RecommendationReviewDiagnostics';
import ProposalBuilderDialog from '@/components/jobhub/ProposalBuilderDialog';
import ScopeOfWorkBuilderDialog from '@/components/jobhub/ScopeOfWorkBuilderDialog';
import InspectionOverrideDialog from '@/components/jobhub/InspectionOverrideDialog';
import ReopenInspectionDialog from '@/components/jobhub/ReopenInspectionDialog';
import SignatureBlockDialog from '@/components/jobhub/SignatureBlockDialog';
import CustomerPresentationDialog from '@/components/jobhub/presentation/CustomerPresentationDialog';
import ExecutionPlanDialog from '@/components/jobhub/ExecutionPlanDialog';
import WorkflowDebugPanel from '@/components/jobhub/WorkflowDebugPanel';
import InspectionPipelineDiagnostic from '@/components/jobhub/InspectionPipelineDiagnostic';
import WorkflowTimeline from '@/components/jobhub/WorkflowTimeline';
import ReopenStageDialog from '@/components/jobhub/ReopenStageDialog';
import WorkflowRevisionHistory from '@/components/jobhub/WorkflowRevisionHistory';
import { getMissingPhotosForSubmissions } from '@/lib/photoValidation';
import { validateRequiredSignatures, getMissingSignatureLabels, SIGNATURE_TYPES, getCapturedSignaturePurposes } from '@/lib/signatureValidation';
import { useMyJobs } from '@/hooks/useMyJobs';
import { useDeveloperMode } from '@/hooks/useDeveloperMode';
import { useWorkflowDataDiagnostics } from '@/hooks/useWorkflowDataDiagnostics';
import JobHubEmptyState from '@/components/jobhub/JobHubEmptyState';

export default function JobHub() {
  const { jobId: routeJobId } = useParams();
  const navigate = useNavigate();
  const { employee, effectiveEmail, effectiveName, effectiveTruck, effectiveRole } = useEmployeeContext();
  const { todayJobs, loading: dailyJobsLoading } = useMyJobs(employee);

  // Validate route param — reject undefined, "undefined", "null", empty string
  const isValidJobId = routeJobId && !['undefined', 'null', ''].includes(String(routeJobId).trim());
  const isDailyMode = !isValidJobId;

  // Resolve effective job ID: use route param if valid, otherwise today's first assigned job
  const jobId = isValidJobId ? routeJobId : (todayJobs[0]?.id || null);

  const {
    workflow, stages, nextAction, overallProgress, loading: wfLoading,
    updateStageState, assignModule, approveModule, rejectModule,
    acquireLock, releaseLock, takeoverLock,
    completeStage, setCrewMembers, refresh, derived,
    reopenStage, recompleteStage, clearStaleness, revisions, refreshRevisions,
  } = useWorkflowState(jobId, employee, effectiveEmail, effectiveName);

  // ── Data-Loading Diagnostics ──
  // Logs exactly what the frontend's user-scoped queries return vs what the
  // backend reports, so we can detect RLS/permission/catch-swallow issues
  // before debugging stage routing.
  useWorkflowDataDiagnostics(jobId, workflow, derived, stages, nextAction);

  const [job, setJob] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [activityLogs, setActivityLogs] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [nextJob, setNextJob] = useState(null);
  const [hubStatus, setHubStatus] = useState('scheduled');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [completionValidation, setCompletionValidation] = useState(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);

  // ── Server-authoritative inspection completion validation ──
  // Single source of truth for missing-photo requirements + overrides.
  // Defined early so override/reopen handlers can depend on it.
  const refreshCompletionValidation = useCallback(async () => {
    if (!job?.id) return;
    try {
      const res = await base44.functions.invoke('validateInspectionCompletion', { job_id: job.id, action: 'validate' });
      setCompletionValidation(res.data);
    } catch (e) {
      console.error('Completion validation failed:', e);
    }
  }, [job?.id]);
  const [noteText, setNoteText] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [conflictInfo, setConflictInfo] = useState(null);
  const [reviewModule, setReviewModule] = useState(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [repairReviewOpen, setRepairReviewOpen] = useState(false);
  const [repairGenerating, setRepairGenerating] = useState(false);
  const [repairError, setRepairError] = useState(null);
  const [estimateReviewOpen, setEstimateReviewOpen] = useState(false);
  const [proposalBuilderOpen, setProposalBuilderOpen] = useState(false);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [aiSummaryOpen, setAiSummaryOpen] = useState(false);
  const [cleanInspectionOpen, setCleanInspectionOpen] = useState(false);
  const [recReviewOpen, setRecReviewOpen] = useState(false);
  const [recReviewBlockOpen, setRecReviewBlockOpen] = useState(false);
  const [scopeBuilderOpen, setScopeBuilderOpen] = useState(false);
  const [scopeBuilderPackageId, setScopeBuilderPackageId] = useState(null);
  const [scopeEditReturnTo, setScopeEditReturnTo] = useState(null);
  const [executionPlanOpen, setExecutionPlanOpen] = useState(false);
  const [packageBuilderOpen, setPackageBuilderOpen] = useState(false);
  const [dynamicPricingOpen, setDynamicPricingOpen] = useState(false);
  const [signatureBlock, setSignatureBlock] = useState(null);
  const [reopenStageKey, setReopenStageKey] = useState(null);
  const [reopenStageState, setReopenStageState] = useState(null);
  const [revisionHistoryOpen, setRevisionHistoryOpen] = useState(false);
  const [activeTimelineStage, setActiveTimelineStage] = useState(null);
  const [presentationRefreshTrigger, setPresentationRefreshTrigger] = useState(0);
  const [debugInfo, setDebugInfo] = useState({
    lastAsyncOp: null,
    lastFunctionExecuted: null,
    lastWorkflowTransition: null,
    lastError: null,
  });
  const activityLogsRef = useRef([]);
  const pendingPresentationAction = useRef(null);
  const [appointments, setAppointments] = useState([]);
  const [todaysAppointment, setTodaysAppointment] = useState(null);
  const [allQuestions, setAllQuestions] = useState([]);
  const { requireSignatureClean, requireSignatureWithRecs } = useInspectionWorkflowConfig();
  const { isDevToolsVisible } = useDeveloperMode();

  const crewMembers = useMemo(
    () => safeParse(workflow?.crew_members, []),
    [workflow]
  );
  const conflictLocks = useMemo(
    () => safeParse(workflow?.conflict_locks, {}),
    [workflow]
  );

  const isLead = useMemo(() => {
    if (!workflow?.lead_technician_email) return true;
    return workflow.lead_technician_email === effectiveEmail;
  }, [workflow, effectiveEmail]);

  const isManager = useMemo(() => {
    const role = (effectiveRole || employee?.primary_role || '').toLowerCase();
    return role.includes('owner') || role.includes('manager') || role.includes('admin') || role.includes('lead') || role.includes('director');
  }, [effectiveRole, employee?.primary_role]);

  // Only true deficiencies (exclude observations where is_deficiency is false)
  const deficiencyCount = useMemo(
    () => (derived.findings || []).filter(f => f.is_deficiency !== false).length + (derived.legacyFindings || []).length,
    [derived.findings, derived.legacyFindings]
  );

  // Load job + related data
  useEffect(() => {
    if (!jobId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const jobData = await base44.entities.Job.get(jobId);
        if (cancelled) return;
        setJob(jobData);

        const [logs, tasksList, notifList, allJobs, appts] = await Promise.all([
          base44.entities.JobActivityLog.filter({ job_id: jobId }),
          base44.entities.EnterpriseTask.list('-created_date', 50).catch(() => []),
          base44.entities.EnterpriseNotification.list('-created_date', 50).catch(() => []),
          base44.entities.Job.list('-service_date', 200).catch(() => []),
          base44.entities.Appointment.filter({ job_id: jobId }).catch(() => []),
        ]);
        if (cancelled) return;

        setActivityLogs(logs);
        appts.sort((a, b) => (a.day_number || 0) - (b.day_number || 0));
        setAppointments(appts);
        const todayStr = new Date().toLocaleDateString('en-CA');
        const todayAppt = appts.find(a => a.status === 'started' || a.status === 'dispatched')
          || appts.find(a => (a.scheduled_start || '').slice(0, 10) === todayStr)
          || appts.find(a => a.status !== 'completed' && a.status !== 'cancelled')
          || null;
        setTodaysAppointment(todayAppt);
        // The completion checklist must show only open tasks that are actually tied
        // to this job/appointment. Assigned-to-me tasks from other jobs are not blockers.
        const terminalTaskStatuses = new Set(['completed', 'cancelled', 'canceled', 'approved']);
        setTasks(tasksList.filter(t => {
          const isLinkedToThisJob = t.job_id === jobId || t.related_job_id === jobId ||
            (todayAppt?.id && t.appointment_id === todayAppt.id);
          return isLinkedToThisJob && !terminalTaskStatuses.has(String(t.status || '').toLowerCase());
        }));
        setNotifications(notifList.filter(n => n.recipient_email === effectiveEmail));

        // ── Customer Resolution ──
        // Job.customer_id may store a ServiceTitan customer ID (e.g. "46450823")
        // instead of a Base44 Customer entity ID. We resolve in this order:
        //   1. Customer.get(customer_id) — works if it's already a Base44 ID
        //   2. Customer.filter({ customer_number: customer_id || customer_number })
        //   3. Auto-create a Customer record from Job denormalized fields
        if (jobData.customer_id || jobData.customer_number) {
          const requestedId = jobData.customer_id || jobData.customer_number || '';
          let resolvedCustomer = null;
          let resolutionMethod = 'none';

          console.log('[CustomerResolution] Job ID:', jobId);
          console.log('[CustomerResolution] Customer Entity ID (job.customer_id):', jobData.customer_id);
          console.log('[CustomerResolution] ServiceTitan Customer ID (job.customer_number):', jobData.customer_number);
          console.log('[CustomerResolution] Customer ID requested for lookup:', requestedId);

          // Attempt 1: direct get — ONLY if customer_id looks like a Base44 entity ID
          // (24-char hex ObjectId or UUID). Numeric values like "46450823" are
          // ServiceTitan customer IDs and will always 404 on Customer.get().
          const isBase44Id = /^[0-9a-fA-F]{24}$/.test(requestedId) ||
            /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(requestedId);
          if (isBase44Id) {
            try {
              resolvedCustomer = await base44.entities.Customer.get(requestedId);
              if (resolvedCustomer && resolvedCustomer.id) {
                resolutionMethod = 'direct_get';
              }
            } catch (e) {
              console.log('[CustomerResolution] Direct get failed:', e.message);
              resolvedCustomer = null;
            }
          } else {
            console.log('[CustomerResolution] Skipping direct get — ID is not a Base44 entity ID (likely ServiceTitan):', requestedId);
          }

          // Attempt 2: filter by customer_number (ServiceTitan ID stored in customer_id)
          if (!resolvedCustomer) {
            try {
              const matches = await base44.entities.Customer.filter({
                customer_number: jobData.customer_number || jobData.customer_id || '',
              });
              if (matches && matches.length > 0) {
                resolvedCustomer = matches[0];
                resolutionMethod = 'customer_number_lookup';
              }
            } catch (e) {
              console.log('[CustomerResolution] customer_number lookup failed:', e.message);
            }
          }

          // Attempt 3: auto-create a Customer record from Job denormalized fields
          if (!resolvedCustomer) {
            try {
              resolvedCustomer = await base44.entities.Customer.create({
                customer_number: jobData.customer_number || jobData.customer_id || '',
                name: jobData.customer_name || 'Unknown Customer',
                address: jobData.address || '',
                city: jobData.city || '',
                state: jobData.state || '',
                zip: jobData.zip || '',
                status: 'active',
              });
              resolutionMethod = 'auto_created';
              console.log('[CustomerResolution] Auto-created Customer record:', resolvedCustomer.id);
            } catch (e) {
              console.log('[CustomerResolution] Auto-create failed:', e.message);
            }
          }

          console.log('[CustomerResolution] Customer lookup result:', resolvedCustomer ? { id: resolvedCustomer.id, name: resolvedCustomer.name, method: resolutionMethod } : 'NOT FOUND');
          console.log('[CustomerResolution] Navigation target: JobHub workflow continues (next stage after customer_decision)');

          if (!cancelled && resolvedCustomer) {
            setCustomer(resolvedCustomer);
          }
        }

        const today = new Date().toLocaleDateString('en-CA');
        const upcoming = allJobs
          .filter(j => j.id !== jobId && (j.service_date || '') >= today && (j.technician_emails || []).includes(effectiveEmail))
          .sort((a, b) => (a.service_date || '').localeCompare(b.service_date || ''));
        if (upcoming.length > 0) setNextJob(upcoming[0]);

        const statusLogs = logs
          .filter(l => l.event_type === 'status_change')
          .sort((a, b) => new Date(b.timestamp || b.created_date) - new Date(a.timestamp || a.created_date));
        if (statusLogs.length > 0 && statusLogs[0].hub_status) setHubStatus(statusLogs[0].hub_status);
      } catch (e) {
        console.error('JobHub load error:', e);
        if (!cancelled) setError(e.message || 'Failed to load job');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [jobId, effectiveEmail, employee?.employee_id]);

  // Safety timeout — if job data loading takes more than 12 seconds, force-render
  // with whatever data is available so the page is never stuck on a blank spinner.
  useEffect(() => {
    if (!jobId) return;
    const timer = setTimeout(() => {
      setLoading(prev => {
        if (prev) console.warn('[JobHub] Safety timeout — force-rendering with available data after 12s');
        return false;
      });
    }, 12000);
    return () => clearTimeout(timer);
  }, [jobId]);

  // Load all inspection questions for photo validation
  useEffect(() => {
    base44.entities.InspectionQuestion.filter({ is_active: true })
      .then(qs => setAllQuestions(qs))
      .catch(() => setAllQuestions([]));
  }, []);

  // Timer
  useEffect(() => {
    const startLogs = activityLogs
      .filter(l => ['en_route', 'on_site', 'working', 'awaiting_signature'].includes(l.hub_status))
      .sort((a, b) => new Date(a.timestamp || a.created_date) - new Date(b.timestamp || b.created_date));
    if (startLogs.length === 0 || hubStatus === 'completed' || hubStatus === 'scheduled') return;
    const startTime = new Date(startLogs[0].timestamp || startLogs[0].created_date).getTime();
    const interval = setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [activityLogs, hubStatus]);

  const logActivity = useCallback(async (eventType, label, details) => {
    if (!job) return;
    try {
      const log = await base44.entities.JobActivityLog.create({
        job_id: job.id,
        job_number: job.crm_job_number || '',
        customer_name: job.customer_name || '',
        technician_email: effectiveEmail,
        event_type: eventType,
        event_label: label,
        event_details: details ? JSON.stringify(details) : '',
        performed_by: effectiveName,
        timestamp: new Date().toISOString(),
        hub_status: hubStatus,
      });
      setActivityLogs(prev => [...prev, log]);
      return log;
    } catch (e) { console.error('Failed to log activity:', e); }
  }, [job, effectiveEmail, effectiveName, hubStatus]);

  // Keep activityLogsRef in sync so callbacks always access the latest logs
  useEffect(() => {
    activityLogsRef.current = activityLogs;
  }, [activityLogs]);

  // ── Signature default purpose ──
  // When SignatureBlockDialog triggers capture, we derive the correct purpose
  // from the MISSING signature type so the modal opens with the right default.
  // This prevents the type mismatch where customer_authorization was saved as
  // completion_acceptance.
  const [signatureDefaultPurpose, setSignatureDefaultPurpose] = useState('completion_acceptance');
  const [signatureWorkflowStage, setSignatureWorkflowStage] = useState(null);

  const handleStatusChange = async (status, label) => {
    const log = await base44.entities.JobActivityLog.create({
      job_id: job.id, job_number: job.crm_job_number || '', customer_name: job.customer_name || '',
      technician_email: effectiveEmail, event_type: 'status_change', event_label: `Status: ${label}`,
      performed_by: effectiveName, timestamp: new Date().toISOString(), hub_status: status,
    });
    setActivityLogs(prev => [...prev, log]);
    setHubStatus(status);
  };

  // ── Workflow metadata (declared early so all callbacks can depend on it) ──
  // All values come from computeEffectiveStages via stages.__meta.
  // No duplicate calculations anywhere in JobHub.
  const wfMeta = getWorkflowMeta(stages);
  const noRecommendations = wfMeta.noRecommendations;

  // Workflow action handler
  const handleWorkflowAction = useCallback(async (stage, state) => {
    if (!stage) return;

    // ── Structured trace ──
    const trace = startWorkflowTrace(job?.id, stage.key, state?.action || 'unknown');
    traceStep(trace, 'trace_initialized', {
      stage_status_before: state?.status,
      stage_label: stage.label,
      is_module: stage.isModule,
      has_path: !!stage.path,
    });
    // Impersonation comparison logging
    traceStep(trace, 'actor_identity', {
      authenticated_admin: employee?.impersonationState?.originalUserEmail || 'N/A',
      active_technician: effectiveEmail,
      is_impersonating: !!employee?.impersonationState,
    });

    // If module is awaiting lead review, open review dialog instead of navigating
    if (stage.isModule && state?.status === 'needs_lead_review') {
      traceStep(trace, 'opening_review_dialog', { moduleKey: stage.moduleKey });
      endWorkflowTrace(trace, 'opened ModuleReviewDialog (needs_lead_review)');
      setReviewModule({ moduleKey: stage.moduleKey, moduleName: stage.label });
      return;
    }

    // If module stage: acquire lock, then check for existing submitted inspection
    if (stage.isModule) {
      traceStep(trace, 'acquiring_lock', { moduleKey: stage.moduleKey });
      const lockResult = await acquireLock(stage.moduleKey);
      if (lockResult?.conflict) {
        traceStep(trace, 'lock_conflict', { lockedBy: lockResult.lockedBy });
        endWorkflowTrace(trace, 'blocked by conflict lock');
        setConflictInfo({
          moduleKey: stage.moduleKey,
          moduleName: stage.label,
          lockInfo: lockResult.lockedBy,
        });
        return;
      }
      traceStep(trace, 'lock_acquired');

      // ── Resolve authoritative submission BEFORE setting in_progress ──
      const { authoritative, duplicates } = await resolveAuthoritativeInspectionSubmission({
        job_id: job.id,
        inspection_type: stage.moduleKey,
      });
      traceStep(trace, 'authoritative_submission_resolved', {
        found: !!authoritative,
        submission_id: authoritative?.id,
        status: authoritative?.status,
        duplicate_count: duplicates.length,
      });

      // If a submitted inspection already exists, sync stage to complete and advance
      if (state?.status !== 'reopened' && authoritative && ['submitted', 'reviewed', 'approved', 'complete'].includes(authoritative.status)) {
        traceStep(trace, 'syncing_stage_to_complete', { submission_id: authoritative.id });
        await updateStageState(stage.key, {
          status: 'completed',
          completed_at: authoritative.date_submitted || new Date().toISOString(),
          inspection_submission_id: authoritative.id,
        });
        traceStep(trace, 'stage_synced_to_complete');
        await refresh();
        traceStep(trace, 'workflow_refreshed');
        endWorkflowTrace(trace, `stage "${stage.key}" marked complete — submission already exists (id: ${authoritative.id})`);
        toast.info(`${stage.label} already submitted — advancing to next step.`);
        return;
      }

      // Log the start (only when actually opening the form)
      await logActivity('activity_started', `${stage.label} started by ${effectiveName}`, {
        module: stage.moduleKey,
        device: navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop',
      });
    }

    // Navigate to the stage's page if it has a path (only if no submitted inspection exists)
    if (stage.path) {
      traceStep(trace, 'updateStageState_started', { stage_key: stage.key, new_status: 'in_progress' });
      await updateStageState(stage.key, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });
      traceStep(trace, 'updateStageState_completed', { stage_key: stage.key });

      const navTarget = `${stage.path}${job.id}${state?.status === 'reopened' ? '&reopen=1' : ''}`;
      traceStep(trace, 'navigating', { target: navTarget });
      navigate(navTarget, { state: { launchedFrom: 'job_hub' } });
      endWorkflowTrace(trace, `navigated to ${navTarget}`);
      return;
    }

    // Inspection Summary: open summary dialog
    if (stage.key === 'inspection_summary') {
      await updateStageState(stage.key, { status: 'in_progress', started_at: new Date().toISOString() });
      setSummaryOpen(true);
      return;
    }

    // AI Report Summary: open AI summary dialog
    if (stage.key === 'ai_report_summary') {
      await updateStageState(stage.key, { status: 'in_progress', started_at: new Date().toISOString() });
      setAiSummaryOpen(true);
      return;
    }

    // Complete Appointment: route based on workflow path
    if (stage.key === 'complete_appointment') {
      // Read from the single authoritative stages object — no duplicate calculations
      const recReviewIncomplete = wfMeta.hasDeficiencies && !['completed', 'skipped'].includes(stages?.recommendation_review?.status);

      if (recReviewIncomplete) {
        setRecReviewBlockOpen(true);
        return;
      }

      if (noRecommendations) {
        setCleanInspectionOpen(true);
      } else {
        setCompletionOpen(true);
      }
      return;
    }

    // Recommendation Review: open the review workspace
    if (stage.key === 'recommendation_review') {
      await updateStageState(stage.key, { status: 'in_progress', started_at: new Date().toISOString() });
      setRecReviewOpen(true);
      return;
    }

    // Repair System Review: generate recommendations if needed, then open review dialog
    if (stage.key === 'repair_system_review') {
      await updateStageState(stage.key, { status: 'in_progress', started_at: new Date().toISOString() });
      setRepairError(null);

      // If no recommendations exist yet, generate them before opening
      if (!derived.repairRecs || derived.repairRecs.length === 0) {
        setRepairGenerating(true);
        try {
          const response = await base44.functions.invoke('generateRepairSystemRecommendations', { job_id: job.id });
          if (response.data?.error) {
            setRepairError(response.data.error);
            setRepairReviewOpen(true);
            setRepairGenerating(false);
            return;
          }
          // Refresh workflow data to pick up new recommendations
          await refresh();
        } catch (e) {
          setRepairError(e.message || 'Failed to generate repair system recommendations');
          setRepairReviewOpen(true);
          setRepairGenerating(false);
          return;
        }
        setRepairGenerating(false);
      }

      setRepairReviewOpen(true);
      return;
    }

    // Estimate Package Builder: open the package builder dialog (v2 workflow)
    if (stage.key === 'estimate_package_builder') {
      const useV2 = wfMeta.useV2Workflow;
      console.log('[WorkflowOrder] estimate_package_builder — v2:', useV2, 'packages:', (derived.estimatePackages || []).length);
      await updateStageState(stage.key, { status: 'in_progress', started_at: new Date().toISOString() });
      setPackageBuilderOpen(true);
      return;
    }

    // Scope of Work: open the scope of work builder dialog
    if (stage.key === 'scope_of_work') {
      await updateStageState(stage.key, { status: 'in_progress', started_at: new Date().toISOString() });
      setScopeBuilderOpen(true);
      return;
    }

    // Dynamic Pricing: verify scope exists, then open pricing workspace
    if (stage.key === 'dynamic_pricing') {
      if (!derived.scopeOfWork) {
        toast.error('Pricing cannot be calculated until Scope of Work is complete.');
        return;
      }
      await updateStageState(stage.key, { status: 'in_progress', started_at: new Date().toISOString() });
      setDynamicPricingOpen(true);
      return;
    }

    // Final Estimate Review: verify pricing approved, then open estimate review
    if (stage.key === 'final_estimate_review') {
      const approvedSnapshots = await base44.entities.PricingCalculationSnapshot.filter(
        { job_id: job.id, calculation_status: { $in: ['approved', 'overridden'] } },
        '-calculated_at', 1
      ).catch(() => []);
      if (approvedSnapshots.length === 0) {
        toast.error('Pricing must be approved before the customer estimate can be created.');
        return;
      }
      await updateStageState(stage.key, { status: 'in_progress', started_at: new Date().toISOString() });
      setEstimateReviewOpen(true);
      return;
    }

    // Proposal Builder: open the proposal builder workspace
    if (stage.key === 'proposal_builder') {
      await updateStageState(stage.key, { status: 'in_progress', started_at: new Date().toISOString() });
      setProposalBuilderOpen(true);
      return;
    }

    // Customer Presentation: open presentation workspace
    if (stage.key === 'customer_presentation') {
      await updateStageState(stage.key, { status: 'in_progress', started_at: new Date().toISOString() });
      setPresentationOpen(true);
      return;
    }

    // Execution Plan: open the execution plan dialog
    if (stage.key === 'execution_plan') {
      console.log('[ExecutionPlan] ─────────────────────────────');
      console.log('[ExecutionPlan] Handler fired for stage: execution_plan');
      console.log('[ExecutionPlan] Job ID:                  ', job?.id);
      console.log('[ExecutionPlan] Appointment ID:          ', todaysAppointment?.id || 'none');
      console.log('[ExecutionPlan] Scope of Work ID:        ', derived.scopeOfWork?.id || 'none');
      console.log('[ExecutionPlan] Approved estimate items: ', (derived.draftEstimateItems || []).filter(i => ['approved', 'ready'].includes(i.status)).length);
      console.log('[ExecutionPlan] Existing plan found:     ', derived.scopeOfWork ? 'yes' : 'no');
      console.log('[ExecutionPlan] Action: opening execution plan dialog');
      console.log('[ExecutionPlan] Next stage after completion: complete_appointment');
      console.log('[ExecutionPlan] ─────────────────────────────');

      await updateStageState(stage.key, { status: 'in_progress', started_at: new Date().toISOString() });
      setExecutionPlanOpen(true);
      return;
    }

    // For non-navigation stages without a specific handler, log a warning (no silent dead-ends)
    console.warn(`[JobHub] No specific handler for stage "${stage.key}". Marking in_progress.`);

    if (state?.status === 'available') {
      await updateStageState(stage.key, { status: 'in_progress', started_at: new Date().toISOString() });
    }
  }, [acquireLock, logActivity, effectiveName, navigate, job?.id, updateStageState, completeStage, refresh, derived.repairRecs, derived.inspectionReport, derived.findings, derived.legacyFindings, derived.recommendationReview, derived.scopeOfWork, derived.draftEstimateItems, derived.estimate, stages, workflow, activityLogs, wfMeta, noRecommendations]);

  // Smart Next Action handler
  const handleNextAction = useCallback(async (action) => {
    if (action.action === 'review') {
      setReviewModule({ moduleKey: action.stage.moduleKey, moduleName: action.stage.label });
      return;
    }
    if (action.action === 'done') {
      // Read from the single authoritative stages object — no duplicate calculations
      const recReviewIncomplete = wfMeta.hasDeficiencies && !['completed', 'skipped'].includes(stages?.recommendation_review?.status);

      if (recReviewIncomplete) {
        setRecReviewBlockOpen(true);
        return;
      }

      if (noRecommendations) {
        setCleanInspectionOpen(true);
      } else {
        setCompletionOpen(true);
      }
      return;
    }
    await handleWorkflowAction(action.stage, action.state);
  }, [handleWorkflowAction, stages, derived, wfMeta, noRecommendations]);

  // Conflict dialog handlers
  const handleConflictViewOnly = useCallback(() => {
    if (!conflictInfo) return;
    const path = conflictInfo.moduleKey === 'interior'
      ? '/tech/inspection?job_id='
      : '/tech/exterior-inspection?job_id=';
    setConflictInfo(null);
    navigate(`${path}${job.id}`, { state: { launchedFrom: 'job_hub' } });
  }, [conflictInfo, job?.id, navigate]);

  const handleConflictRequestControl = useCallback(() => {
    // Just close — in a full implementation, this would send a notification
    setConflictInfo(null);
  }, []);

  const handleConflictTakeOver = useCallback(async (reason) => {
    if (!conflictInfo) return;
    await takeoverLock(conflictInfo.moduleKey, reason);
    await logActivity('material_transfer', `Takeover: ${conflictInfo.moduleName} taken over by ${effectiveName}`, {
      reason, module: conflictInfo.moduleKey, takeover: true,
    });
    const path = conflictInfo.moduleKey === 'interior'
      ? '/tech/inspection?job_id='
      : '/tech/exterior-inspection?job_id=';
    setConflictInfo(null);
    navigate(`${path}${job.id}`, { state: { launchedFrom: 'job_hub' } });
  }, [conflictInfo, takeoverLock, logActivity, effectiveName, job?.id, navigate]);

  const handleNoteSave = async () => {
    if (!noteText.trim()) return;
    await logActivity('note_added', noteText.trim());
    setNoteText('');
    setActiveModal(null);
  };

  const handlePhotoUpload = async () => {
    if (!photoFile) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: photoFile });
      await logActivity('photo_uploaded', 'Photo uploaded', { url: file_url });
      setPhotoFile(null);
      setActiveModal(null);
    } catch (e) { console.error('Upload failed:', e); }
    finally { setUploading(false); }
  };

  const handleSignatureSign = async (auditData) => {
    // Resolve appointment ID for audit trail — use todaysAppointment from state first,
    // then fall back to any non-cancelled appointment for this job.
    // If no appointment ID can be resolved, BLOCK the signature save.
    let appointmentId = todaysAppointment?.id || null;
    if (!appointmentId) {
      try {
        const appts = await base44.entities.Appointment.filter({ job_id: job.id });
        const anyActive = appts.find(a => a.status !== 'cancelled') || appts[0];
        appointmentId = anyActive?.id || null;
      } catch (e) { /* will be caught by the block below */ }
    }

    if (!appointmentId) {
      console.error('[Signature] BLOCKED — no appointment ID could be resolved for job:', job?.id);
      throw new Error('Cannot save signature: no appointment is linked to this job. Please ensure an appointment exists before capturing a signature.');
    }

    // Resolve the CustomerPresentation record ID for linking
    let customerPresentationId = null;
    try {
      const presList = await base44.entities.CustomerPresentation.filter({ job_id: job.id });
      customerPresentationId = presList[0]?.id || null;
    } catch (e) { /* non-blocking */ }

    // Derive signature_type from purpose using SIGNATURE_TYPES reverse lookup
    const sigTypeEntry = Object.values(SIGNATURE_TYPES).find(st => st.purpose === auditData.purpose);
    const signatureType = sigTypeEntry?.key || auditData.purpose;
    const workflowStage = signatureWorkflowStage || 'unknown';

    console.log('[Signature] ════════════════════════════════════════');
    console.log('[Signature] Saved signature details:');
    console.log('[Signature]   purpose:         ', auditData.purpose);
    console.log('[Signature]   signature_type:  ', signatureType);
    console.log('[Signature]   workflow_stage:  ', workflowStage);
    console.log('[Signature]   signature_url:   ', auditData.signatureUrl);
    console.log('[Signature]   signer_name:     ', auditData.signerName);
    console.log('[Signature]   linked_job_id:   ', job?.id);
    console.log('[Signature]   linked_appt_id:  ', appointmentId);
    console.log('[Signature]   appt_id source:  ', todaysAppointment?.id ? 'todaysAppointment state' : 'appointment filter fallback');
    console.log('[Signature]   linked_cust_id:  ', job?.customer_id || null);
    console.log('[Signature]   linked_pres_id:  ', customerPresentationId);
    console.log('[Signature] ════════════════════════════════════════');

    await logActivity('signature_captured', `Customer signature captured — ${auditData.purposeLabel}`, {
      ...auditData,
      signature_type: signatureType,
      workflow_stage: workflowStage,
      signed_by_user: effectiveName,
      appointment_id: appointmentId,
      job_id: job?.id,
      customer_id: job?.customer_id || null,
      customer_presentation_id: customerPresentationId,
    });
    setActiveModal(null);
    setSignatureBlock(null);
    setSignatureWorkflowStage(null);

    // ── Auto-retry pending presentation completion after signature capture ──
    if (pendingPresentationAction.current && job?.id) {
      const pending = pendingPresentationAction.current;
      pendingPresentationAction.current = null;

      setDebugInfo(prev => ({ ...prev, lastAsyncOp: 'Auto-retry after signature capture', lastError: null }));

      // Fetch FRESH activity logs from the server
      const freshLogs = await base44.entities.JobActivityLog.filter({ job_id: job.id }).catch(() => activityLogsRef.current);
      setActivityLogs(freshLogs);
      activityLogsRef.current = freshLogs;

      console.log('[Signature] Auto-retry — fresh logs count:', freshLogs.length);
      const freshCaptured = getCapturedSignaturePurposes(freshLogs);
      console.log('[Signature] Fresh captured purposes:', freshCaptured);

      if (pending.type === 'presentation_complete') {
        const success = await runPresentationCompletion(freshLogs, pending.customerDecision, 'signature_retry');
        console.log('[Signature] runPresentationCompletion result:', success);
        if (success) {
          setPresentationRefreshTrigger(t => t + 1);
          toast.success('Signature captured. Presentation completed.');
        }
      } else if (pending.type === 'decision') {
        const success = await runDecisionCompletion(freshLogs, pending.workflowDecision, pending.detailedDecision, 'signature_retry');
        console.log('[Signature] runDecisionCompletion result:', success);
        if (success) {
          toast.success('Signature captured. Customer decision recorded.');
          // runDecisionCompletion already closed the presentation dialog and refreshed workflow state
        }
      }

      setDebugInfo(prev => ({ ...prev, lastAsyncOp: null }));
    }
  };

  const handleCompleteAppointment = async () => {
    const todayStr = new Date().toLocaleDateString('en-CA');
    let isFinalAppointment = true;
    try {
      const appts = await base44.entities.Appointment.filter({ job_id: job.id });
      const todayAppt = appts.find(a => (a.scheduled_start || '').slice(0, 10) === todayStr);
      if (todayAppt && todayAppt.id) {
        await base44.entities.Appointment.update(todayAppt.id, { status: 'completed' });
      }
      const remaining = appts.filter(a => a.id !== todayAppt?.id && ['scheduled', 'confirmed', 'dispatched', 'started'].includes(a.status));
      isFinalAppointment = remaining.length === 0;
    } catch (e) { console.error('Appointment resolution failed:', e); }

    await logActivity('job_completed', isFinalAppointment ? 'Final appointment completed — job complete' : 'Today\'s appointment completed (multi-day job continues)');
    await completeStage('complete_appointment', { device: navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop' });

    if (isFinalAppointment) {
      await base44.entities.Job.update(job.id, { status: 'completed' });
    }
    setHubStatus('completed');
    setCompletionOpen(false);
    navigate('/tech/dashboard');
  };

  // ── Manager override: waive specific missing-photo requirements (idempotent) ──
  const handleApplyOverride = useCallback(async ({ requirement_ids, override_reason }) => {
    if (!job?.id) return;
    try {
      await base44.functions.invoke('validateInspectionCompletion', { job_id: job.id, action: 'apply_override', requirement_ids, override_reason });
      await refreshCompletionValidation();
      await refresh();
      toast.success('Manager override applied — selected missing-photo requirements waived.');
    } catch (e) {
      toast.error('Override failed: ' + (e.message || 'unknown error'));
      throw e;
    }
  }, [job?.id, refreshCompletionValidation, refresh]);

  // ── Reopen a completed inspection to add missing documentation ──
  const handleReopenInspection = useCallback(async (reason) => {
    if (!job?.id) return;
    try {
      const requirements = (completionValidation?.blocking_requirements || [])
        .filter(r => r.requirement_type === 'photo');
      await base44.functions.invoke('validateInspectionCompletion', {
        job_id: job.id,
        action: 'reopen',
        reopened_reason: reason,
        requirement_ids: requirements.map(r => r.requirement_id),
      });
      await refreshCompletionValidation();
      await refresh();
      toast.success('Interior inspection reopened. Add the required photos, then resubmit.');
      navigate(`/tech/inspection?job_id=${job.id}&reopen=1`, { state: { launchedFrom: 'job_hub' } });
    } catch (e) {
      toast.error('Reopen failed: ' + (e.message || 'unknown error'));
      throw e;
    }
  }, [job?.id, completionValidation?.blocking_requirements, refreshCompletionValidation, refresh, navigate]);

  const progressStep = useMemo(() => computeProgressStep(stages), [stages]);

  // ── Extracted presentation completion logic ──
  // These functions are reusable: called from dialog callbacks AND from
  // handleSignatureSign's auto-retry path (with fresh activity logs).
  const runPresentationCompletion = useCallback(async (logs, customerDecisionParam, triggerSource = 'presentation_dialog') => {
    setDebugInfo(prev => ({ ...prev, lastAsyncOp: 'runPresentationCompletion', lastFunctionExecuted: 'validateRequiredSignatures', lastError: null }));
    console.log('[Workflow] runPresentationCompletion — validating customer_presentation signatures');

    // Use the LIVE customer decision passed from the dialog, falling back to workflow state
    const effectiveDecision = customerDecisionParam || workflow?.customer_decision || 'pending';

    const sigResult = validateRequiredSignatures(logs, 'customer_presentation', {
      noRecommendations,
      customerDecision: effectiveDecision,
      hasDeficiencies: wfMeta.hasDeficiencies,
    }, triggerSource);

    // ── Debug: required vs captured ──
    const capturedPurposes = getCapturedSignaturePurposes(logs);
    const savedSigLogs = logs.filter(l => l.event_type === 'signature_captured');
    console.log('[Workflow] ═══ Signature Validation Debug ═══');
    console.log('[Workflow] Stage: customer_presentation');
    console.log('[Workflow] Required signature types:', sigResult.requiredSignatures.map(s => `${s.key} (purpose: ${s.purpose})`));
    console.log('[Workflow] Captured purposes:        ', capturedPurposes);
    console.log('[Workflow] Saved signature logs:     ', savedSigLogs.length);
    savedSigLogs.forEach((sl, i) => {
      let d = sl.event_details;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
      console.log(`[Workflow]   [${i}] signature_type=${d.signature_type} purpose=${d.purpose} stage=${d.workflow_stage} pres_id=${d.customer_presentation_id} appt_id=${d.appointment_id}`);
    });
    console.log('[Workflow] Missing signatures:      ', sigResult.missingSignatures.map(s => s.key));
    console.log('[Workflow] Validation result:       ', sigResult.allCaptured ? 'PASS' : 'BLOCKED');
    console.log('[Workflow] ═══════════════════════════════════');

    if (!sigResult.allCaptured) {
      console.log('[Workflow] Signature blocked:', sigResult.missingSignatures.map(s => s.key));
      setDebugInfo(prev => ({ ...prev, lastError: `Signature blocked: ${sigResult.missingSignatures.map(s => s.key).join(', ')}`, lastAsyncOp: null }));
      setSignatureBlock(sigResult);
      pendingPresentationAction.current = { type: 'presentation_complete', customerDecision: effectiveDecision };
      return false;
    }

    console.log('[Workflow] Signature passed — completing customer_presentation stage');
    setDebugInfo(prev => ({ ...prev, lastFunctionExecuted: 'completeStage:customer_presentation', lastWorkflowTransition: 'customer_presentation → customer_decision' }));
    await completeStage('customer_presentation', { presented_at: new Date().toISOString() });

    // Update the CustomerPresentation record to 'complete'
    try {
      const presList = await base44.entities.CustomerPresentation.filter({ job_id: job.id });
      if (presList[0]) {
        await base44.entities.CustomerPresentation.update(presList[0].id, {
          presentation_status: 'complete',
          completed_at: new Date().toISOString(),
        });
      }
    } catch (e) { console.error('[Workflow] Failed to update presentation status:', e); }

    await updateStageState('customer_decision', { status: 'available', started_at: new Date().toISOString() });
    await refresh();
    setDebugInfo(prev => ({ ...prev, lastAsyncOp: null, lastError: null }));
    console.log('[Workflow] customer_presentation completed → customer_decision available');
    return true;
  }, [noRecommendations, workflow, deficiencyCount, completeStage, updateStageState, refresh, job?.id]);

  const runDecisionCompletion = useCallback(async (logs, workflowDecision, detailedDecision, triggerSource = 'decision_dialog') => {
    setDebugInfo(prev => ({ ...prev, lastAsyncOp: 'runDecisionCompletion', lastFunctionExecuted: 'validateRequiredSignatures', lastError: null }));
    console.log('[Workflow] runDecisionCompletion — validating customer_decision signatures');

    const sigResult = validateRequiredSignatures(logs, 'customer_decision', {
      noRecommendations,
      customerDecision: detailedDecision || workflow?.customer_decision || 'pending',
      hasDeficiencies: wfMeta.hasDeficiencies,
    }, triggerSource);

    if (!sigResult.allCaptured) {
      console.log('[Workflow] Signature blocked:', sigResult.missingSignatures.map(s => s.key));
      setDebugInfo(prev => ({ ...prev, lastError: `Signature blocked: ${sigResult.missingSignatures.map(s => s.key).join(', ')}`, lastAsyncOp: null }));
      setSignatureBlock(sigResult);
      pendingPresentationAction.current = { type: 'decision', workflowDecision, detailedDecision };
      return false;
    }

    console.log('[Workflow] Signature passed — completing customer_decision stage');
    setDebugInfo(prev => ({ ...prev, lastFunctionExecuted: 'completeStage:customer_decision', lastWorkflowTransition: `customer_decision → ${detailedDecision}` }));

    // The customer decision (accept/decline/defer) was already persisted
    // server-authoritatively by the CustomerPresentationDialog via
    // acceptProposalOptionServer / declineAllOptionsServer / requestRevisionsServer.
    // That call incremented workflow_revision_version. We must refresh to pick
    // up the new version before completing the customer_decision stage, otherwise
    // the stage completion would fail the optimistic-concurrency guard.
    await refresh();

    // Complete the customer_decision workflow stage (marks stage_states completed).
    // The decision identity (selected_option_id, customer_decision) is already
    // persisted by the server function — this only records the stage transition.
    const stageResult = await completeStage('customer_decision', {
      customer_decision_detail: detailedDecision,
      decided_at: new Date().toISOString(),
    });
    // If the stage completion failed (ok:false), do NOT advance, do NOT close,
    // do NOT show success. The wrapper already showed a retryable error toast.
    if (!stageResult || stageResult.ok === false) {
      setDebugInfo(prev => ({ ...prev, lastError: `completeStage failed: ${stageResult?.message || stageResult?.error || 'unknown'}`, lastAsyncOp: null }));
      return false;
    }
    // NOTE: setCustomerDecision is NOT called here — the dialog already persisted
    // the decision server-authoritatively. Calling it again would double-increment
    // the version and cause a 409 conflict.
    await logActivity('activity_completed', `Customer Decision recorded — ${detailedDecision.replace(/_/g, ' ')}`, {
      stage: 'customer_decision',
      decision: detailedDecision,
    });

    // AR-001: Stage availability is derived by the workflow engine after refresh().
    // The engine's computeEffectiveStages will automatically make execution_plan
    // available when customerDecision === 'accepted', or complete_appointment
    // available otherwise. No UI-stage-routing here.
    if (detailedDecision === 'perform_work_today') {
      toast.success('Customer accepted! Routing to Execution Plan.');
    } else if (detailedDecision === 'schedule_for_later') {
      toast.info('Scope of Work saved. Routing to Complete Appointment for office scheduling.');
    } else if (detailedDecision === 'think_about_it') {
      toast.info('Customer needs time. Routing to Complete Appointment for follow-up.');
    } else if (detailedDecision === 'declined') {
      toast.info('Customer declined. Routing to Complete Appointment.');
    }

    // Refresh workflow state AFTER all stage updates so nextAction recomputes correctly
    await refresh();

    // Close the presentation dialog — all workflow state is now persisted
    setPresentationOpen(false);
    setPresentationRefreshTrigger(t => t + 1);

    // Stop all loading states
    setDebugInfo(prev => ({ ...prev, lastAsyncOp: null, lastError: null }));

    console.log(`[Workflow] customer_decision completed → selected decision = ${detailedDecision}`);
    return true;
  }, [noRecommendations, workflow, deficiencyCount, completeStage, logActivity, refresh, updateStageState, job?.id]);

  // Re-fetch the server-authoritative completion result whenever submissions change.
  useEffect(() => {
    refreshCompletionValidation();
  }, [derived.submissions, refreshCompletionValidation]);

  const blockingPhotoReqs = (completionValidation?.blocking_requirements || []).filter(r => r.requirement_type === 'photo');
  const overriddenPhotoReqs = (completionValidation?.overridden_requirements || []).filter(r => r.requirement_type === 'photo');
  const blockingPhotoCount = blockingPhotoReqs.length;

  const checklist = useMemo(() => {
    const setupDone = stages?.inspection_setup?.status === 'completed';
    const interiorDone = stages?.interior_inspection && ['completed', 'skipped'].includes(stages.interior_inspection.status);
    const exteriorDone = stages?.exterior_inspection && ['completed', 'skipped'].includes(stages.exterior_inspection.status);
    const hasSig = activityLogs.some(l => l.event_type === 'signature_captured');

    // Signature requirement is workflow-aware:
    // - If repair recs exist: signature required (presentation path)
    // - If no repair recs (clean inspection): check admin setting
    const signatureRequired = noRecommendations
      ? requireSignatureClean
      : (derived.repairRecs.length > 0 ? requireSignatureWithRecs : false);

    return [
      { label: 'Inspection Setup Completed', critical: true, pass: setupDone },
      { label: 'Interior Inspection Completed', critical: false, pass: interiorDone },
      { label: 'Exterior Inspection Completed', critical: false, pass: exteriorDone },
      {
        label: 'Recommendation Review Completed',
        critical: deficiencyCount > 0 && derived.recommendationReview?.status !== 'complete',
        pass: deficiencyCount === 0 || derived.recommendationReview?.status === 'complete',
        detail: deficiencyCount > 0 && derived.recommendationReview?.status !== 'complete'
          ? `${deficiencyCount} deficiencies need review` : undefined,
      },
      {
        label: overriddenPhotoReqs.length > 0 ? `Required Photos (${overriddenPhotoReqs.length} waived)` : 'Required Photos Uploaded',
        critical: blockingPhotoCount > 0,
        pass: blockingPhotoCount === 0,
        action: blockingPhotoCount > 0 ? 'add_missing_photos' : undefined,
        detail: blockingPhotoCount > 0
          ? `Missing for: ${blockingPhotoReqs.map(r => r.question_text).join(' � ')}${overriddenPhotoReqs.length > 0 ? ` � ${overriddenPhotoReqs.length} waived by override` : ''}`
          : (overriddenPhotoReqs.length > 0 ? `${overriddenPhotoReqs.length} requirement(s) waived by manager override` : undefined),
      },
      {
        label: 'Customer Signature Captured',
        critical: signatureRequired,
        pass: signatureRequired ? hasSig : true,
        detail: (() => {
          if (!signatureRequired) return undefined;
          if (hasSig) return undefined;
          const missingLabels = getMissingSignatureLabels(activityLogs, {
            noRecommendations,
            customerDecision: workflow?.customer_decision || 'pending',
          });
          return missingLabels.length > 0
            ? `Missing: ${missingLabels.join(', ')}`
            : undefined;
        })(),
      },
      { label: 'Material Transfers Closed', critical: false, pass: true },
      { label: 'Inventory Reconciled', critical: false, pass: true },
      { label: 'Outstanding Tasks', critical: false, pass: tasks.length === 0, detail: tasks.length > 0 ? `${tasks.length} open tasks` : undefined },
    ];
  }, [stages, activityLogs, tasks, blockingPhotoCount, overriddenPhotoReqs.length, noRecommendations, requireSignatureClean, requireSignatureWithRecs, derived.repairRecs.length, deficiencyCount, derived.recommendationReview?.status, workflow]);

  const outstandingActions = checklist.filter(c => !c.pass).map(c => c.label);
  const quickNotes = activityLogs
    .filter(l => l.event_type === 'note_added')
    .sort((a, b) => new Date(b.timestamp || b.created_date) - new Date(a.timestamp || a.created_date))
    .map(l => ({ label: l.event_label, time: formatTimeET(l.timestamp || l.created_date) }));

  const inspectionLevel = derived?.inspectionSetup?.inspection_level || null;

  const customerConcerns = derived?.inspectionSetup?.customer_concerns || job?.customer_concerns || '';

  const propertyDocsStatus = useMemo(() => {
    const hasPhotos = activityLogs.some(l => l.event_type === 'photo_uploaded');
    return hasPhotos ? 'complete' : 'pending';
  }, [activityLogs]);

  // Daily mode: still resolving today's jobs from technician assignments
  if (isDailyMode && dailyJobsLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
        <p className="text-sm text-muted-foreground">Finding today's assigned jobs...</p>
      </div>
    );
  }

  // Daily mode: no jobs found today — show empty state with available actions
  if (isDailyMode && !jobId) {
    return <JobHubEmptyState mode="no_jobs" />;
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <JobHubEmptyState
        mode="error"
        diagnostics={{
          routeJobId,
          resolvedJobId: jobId,
          error,
        }}
      />
    );
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Partial-load warning — shown when workflow data is still loading or failed */}
      {(wfLoading || !workflow) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            {wfLoading ? 'Loading workflow data…' : 'Some information couldn\'t be loaded.'} Showing available job data.
          </p>
        </div>
      )}
      <JobHubHeader
        job={job} customer={customer} hubStatus={hubStatus} elapsedSeconds={elapsedSeconds}
        onStatusChange={handleStatusChange} progressStep={progressStep}
        technicianName={effectiveName} truckNumber={effectiveTruck}
      />

      {/* Multi-day Project Progress */}
      {appointments.length > 1 && <ProjectProgressPanel job={job} />}

      {/* Smart Next Action */}
      <SmartNextAction nextAction={nextAction} onStart={handleNextAction} isLead={isLead} />

      {/* Workflow Progress Bar */}
      <WorkflowProgressBar stages={stages} overallProgress={overallProgress} />

      {/* Workflow Timeline — persistent navigation with revision/staleness awareness */}
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <WorkflowTimeline
            stages={stages}
            workflow={workflow}
            overallProgress={overallProgress}
            onStageSelect={(key) => {
              setActiveTimelineStage(key);
              const selectedStage = WORKFLOW_STAGES.find(stage => stage.key === key);
              if (selectedStage) handleWorkflowAction(selectedStage, stages[key]);
            }}
            onReopenStage={(key) => {
              setReopenStageKey(key);
              setReopenStageState(stages[key] || null);
            }}
            userRole={effectiveRole || employee?.role || 'user'}
            isLead={isLead}
            isAssignedTech={!!employee?.employee_id}
            activeStageKey={activeTimelineStage}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-4 flex-shrink-0 gap-1 text-xs"
          onClick={() => { refreshRevisions(); setRevisionHistoryOpen(true); }}
        >
          <History className="w-3.5 h-3.5" />
          History
        </Button>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-4">
        <div className="space-y-4">
          {/* Customer Summary */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 grid sm:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Customer Summary</p>
                <p className="font-medium">{job.customer_name}</p>
                <p className="text-xs text-muted-foreground">{job.address}</p>
                {customer?.phone && <p className="text-xs text-muted-foreground">{customer.phone}</p>}
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Job Details</p>
                <p className="text-xs">Type: <span className="font-medium capitalize">{job.job_type || '—'}</span></p>
                <p className="text-xs">Priority: <span className="font-medium capitalize">{job.priority || '—'}</span></p>
                <p className="text-xs">Status: <span className="font-medium capitalize">{job.status?.replace(/_/g, ' ')}</span></p>
              </div>
            </CardContent>
          </Card>

          {/* Lead Review Panel (shows when modules need review) */}
          <LeadReviewPanel
            stages={stages}
            workflow={workflow}
            onApprove={approveModule}
            onReject={rejectModule}
            isLead={isLead}
          />

          {/* Module Assignment & Live Status */}
          <ModuleAssignmentPanel
            stages={stages}
            workflow={workflow}
            crewMembers={crewMembers}
            onAssign={assignModule}
            isLead={isLead}
          />

          {/* Workflow Progress Engine (primary) */}
          <WorkflowEngine
            stages={stages}
            workflow={workflow}
            onAction={handleWorkflowAction}
            isLead={isLead}
            conflictLocks={conflictLocks}
          />

          <InspectionEstimatePrompt job={job} />

          {/* Stucco Measurement Tool — always visible for testing */}
          <Card className="border-l-4 border-l-blue-500 shadow-sm">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <Ruler className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Field Measurement</p>
                <p className="font-bold">Stucco Measurement Tool</p>
                <p className="text-xs text-muted-foreground">Measure chimney sections and calculate square footage</p>
              </div>
              <Button onClick={() => navigate(`/stucco-measurement/${job.id}`)} className="gap-2 shrink-0">
                <Ruler className="w-4 h-4" /> Open Tool
              </Button>
            </CardContent>
          </Card>

          {/* Recommendation Review Diagnostics (admin/manager only) */}
          {isManager && (
            <RecommendationReviewDiagnostics
              appointmentId={todaysAppointment?.id}
              inspectionId={derived.inspectionSetup?.id}
              deficiencyCount={deficiencyCount}
              reviewStatus={derived.recommendationReview?.status}
              reviewedCount={derived.recommendationReview?.reviewed_deficiencies || 0}
              estimateRequiredCount={derived.recommendationReview?.estimate_required_count || 0}
              repairRecCount={derived.repairRecs?.length || 0}
              estimateLineItemCount={(() => {
                try { return JSON.parse(derived.estimate?.line_items || '[]').length; } catch { return 0; }
              })()}
              nextAction={nextAction?.label}
            />
          )}

          {/* Workflow Debug Panel (Admin/Developer only) */}
          {isDevToolsVisible && (
            <WorkflowDebugPanel
              job={job}
              workflow={workflow}
              stages={stages}
              nextAction={nextAction}
              todaysAppointment={todaysAppointment}
              customerPresentation={derived.customerPresentation}
              activityLogs={activityLogs}
              checklist={checklist}
              signatureRequired={noRecommendations ? requireSignatureClean : (derived.repairRecs.length > 0 ? requireSignatureWithRecs : false)}
              signatureCaptured={activityLogs.some(l => l.event_type === 'signature_captured')}
              signatureInfo={(() => {
                const sigLog = [...activityLogs].reverse().find(l => l.event_type === 'signature_captured');
                if (!sigLog) return null;
                try { return JSON.parse(sigLog.event_details); } catch { return null; }
              })()}
              debugInfo={debugInfo}
            />
          )}

          {/* Inspection Pipeline Diagnostic — traces submissions → findings → recs → groups → packages */}
          {isDevToolsVisible && (
            <InspectionPipelineDiagnostic jobId={jobId} autoRun={true} />
          )}

          {/* Previous Day Summary (shows when multi-day job, not day 1) */}
          {todaysAppointment && <PreviousDaySummary job={job} currentAppointment={todaysAppointment} />}

          <DailyWorkPlanPanel job={job} todaysAppointment={todaysAppointment} />

          {/* Quick Actions (secondary) */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setActiveModal('photos')}>
                📷 Photos
              </Button>
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setActiveModal('notes')}>
                📝 Notes
              </Button>
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setActiveModal('signature')}>
                ✍️ Signature
              </Button>
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setCompletionOpen(true)}>
                🏁 Complete
              </Button>
              {isManager && blockingPhotoCount > 0 && (
                <Button size="sm" variant="outline" className="gap-1 text-xs border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => setOverrideOpen(true)}>
                  <ShieldCheck className="w-3 h-3" /> Override Photos
                </Button>
              )}
              {isManager && (derived.submissions || []).some(s => ['submitted', 'reviewed', 'approved', 'reopened'].includes(s.status)) && (
                <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setReopenOpen(true)}>
                  <Unlock className="w-3 h-3" /> Reopen
                </Button>
              )}
            </CardContent>
          </Card>

          <JobTimeline logs={activityLogs} />
        </div>

        {/* Right Sidebar */}
        <div>
          <JobHubSidebar
            customer={customer}
            elapsedSeconds={elapsedSeconds}
            recentTimeline={activityLogs.slice(0, 5)}
            outstandingActions={outstandingActions}
            tasks={tasks}
            notifications={notifications}
            quickNotes={quickNotes}
            onAddNote={(text) => logActivity('note_added', text)}
            nextJob={nextJob}
            job={job}
            workflow={workflow}
            crewMembers={crewMembers}
            onSetCrew={setCrewMembers}
            currentUserEmail={effectiveEmail}
            isLead={isLead}
            truckNumber={effectiveTruck}
            inspectionLevel={inspectionLevel}
            customerConcerns={customerConcerns}
            propertyDocsStatus={propertyDocsStatus}
          />
        </div>
      </div>

      {/* Notes Modal */}
      <Dialog open={activeModal === 'notes'} onOpenChange={(o) => { if (!o) setActiveModal(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Note</DialogTitle></DialogHeader>
          <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Type your note..." rows={4} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveModal(null)}>Cancel</Button>
            <Button onClick={handleNoteSave}>Save Note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Photos Modal */}
      <Dialog open={activeModal === 'photos'} onOpenChange={(o) => { if (!o) setActiveModal(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload Photo</DialogTitle></DialogHeader>
          <input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files?.[0])} className="w-full text-sm" />
          {photoFile && <p className="text-xs text-muted-foreground">Selected: {photoFile.name}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveModal(null)}>Cancel</Button>
            <Button onClick={handlePhotoUpload} disabled={!photoFile || uploading}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signature Modal — real canvas pad, only marks captured on successful sign */}
      <CustomerSignatureModal
        open={activeModal === 'signature'}
        onClose={() => { setActiveModal(null); setSignatureWorkflowStage(null); }}
        onSign={handleSignatureSign}
        defaultSignerName={customer?.full_name || job?.customer_name || ''}
        defaultPurpose={signatureDefaultPurpose}
      />

      {/* Conflict Lock Dialog */}
      <ConflictLockDialog
        open={!!conflictInfo}
        lockInfo={conflictInfo?.lockInfo}
        moduleName={conflictInfo?.moduleName}
        onViewOnly={handleConflictViewOnly}
        onRequestControl={handleConflictRequestControl}
        onTakeOver={handleConflictTakeOver}
        onClose={() => setConflictInfo(null)}
      />

      <CompletionEngine
        open={completionOpen}
        onClose={() => setCompletionOpen(false)}
        checklist={checklist}
        onComplete={handleCompleteAppointment}
        hubStatus={hubStatus}
        onAddMissingPhotos={blockingPhotoCount > 0 ? () => {
          setCompletionOpen(false);
          setReopenOpen(true);
        } : undefined}
      />

      <InspectionOverrideDialog
        open={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        blockingRequirements={blockingPhotoReqs}
        onApplied={handleApplyOverride}
      />
      <ReopenInspectionDialog
        open={reopenOpen}
        onClose={() => setReopenOpen(false)}
        onReopen={handleReopenInspection}
      />

      <ModuleReviewDialog
        open={!!reviewModule}
        moduleKey={reviewModule?.moduleKey}
        moduleName={reviewModule?.moduleName}
        submission={reviewModule ? derived.submissions.find(s => s.inspection_type === reviewModule.moduleKey) : null}
        findings={derived.findings}
        assignment={reviewModule ? (safeParse(workflow?.module_assignments, {})[reviewModule.moduleKey] || null) : null}
        onApprove={approveModule}
        onReject={rejectModule}
        onClose={() => setReviewModule(null)}
      />

      <InspectionSummaryDialog
        open={summaryOpen}
        loading={wfLoading}
        inspectionSetup={derived.inspectionSetup}
        submissions={derived.submissions}
        findings={derived.findings}
        legacyFindings={derived.legacyFindings}
        repairRecs={derived.repairRecs}
        estimate={derived.estimate}
        selectedModules={safeParse(workflow?.selected_modules, ['interior', 'exterior'])}
        stages={stages}
        allQuestions={allQuestions}
        onClose={() => setSummaryOpen(false)}
        onContinue={async () => {
          await completeStage('inspection_summary', { summary_viewed_at: new Date().toISOString() });
          setSummaryOpen(false);
        }}
      />

      <AiReportSummaryDialog
        open={aiSummaryOpen}
        loading={wfLoading}
        jobId={job?.id}
        effectiveName={effectiveName}
        findings={derived.findings}
        legacyFindings={derived.legacyFindings}
        submissions={derived.submissions}
        repairRecs={derived.repairRecs}
        onClose={() => setAiSummaryOpen(false)}
        onComplete={async () => {
          await logActivity('activity_completed', 'AI Report Summary approved', { stage: 'ai_report_summary' });
        }}
        onContinue={async () => {
          await completeStage('ai_report_summary', { summary_approved_at: new Date().toISOString() });
          setAiSummaryOpen(false);
        }}
      />

      <RepairSystemReviewDialog
        open={repairReviewOpen}
        loading={repairGenerating || wfLoading}
        repairRecs={derived.repairRecs}
        findings={derived.findings}
        legacyFindings={derived.legacyFindings}
        jobId={job?.id}
        onRefresh={refresh}
        onClose={() => setRepairReviewOpen(false)}
        onContinue={async () => {
          await completeStage('repair_system_review', { review_completed_at: new Date().toISOString() });
          await refresh();
          // AR-001: Next-stage availability is derived by the workflow engine.
          // estimate_package_builder (v2) or scope_of_work (legacy) will be
          // computed as 'available' by computeEffectiveStages after refresh.
          console.log('[WorkflowOrder] repair_system_review completed → engine derives next stage (v2:', wfMeta.useV2Workflow, ')');
          setRepairReviewOpen(false);
        }}
        onCompleteNoRecs={async () => {
          await completeStage('repair_system_review', {
            review_completed_at: new Date().toISOString(),
            result: 'no_recommendations',
          });
          await logActivity('activity_completed', `Repair System Review completed — no recommendations generated`, {
            stage: 'repair_system_review',
            result: 'no_recommendations',
          });
          setRepairReviewOpen(false);
        }}
        onReturnToInspection={() => {
          setRepairReviewOpen(false);
          setSummaryOpen(true);
        }}
      />

      <EstimateReviewDialog
        open={estimateReviewOpen}
        jobId={job?.id}
        estimate={derived.estimate}
        repairRecs={derived.repairRecs}
        scopeOfWork={derived.scopeOfWork}
        onRefresh={refresh}
        onClose={() => setEstimateReviewOpen(false)}
        onEditScope={async (estimatePackageId) => {
          setEstimateReviewOpen(false);
          setScopeBuilderPackageId(estimatePackageId || null);
          setScopeEditReturnTo('final_estimate_review');
          setScopeBuilderOpen(true);
        }}
        onContinue={async () => {
          await completeStage('final_estimate_review', { review_completed_at: new Date().toISOString() });
          await refresh();
          await updateStageState('proposal_builder', { status: 'in_progress', started_at: new Date().toISOString() });
          console.log('[WorkflowOrder] final_estimate_review completed → next: proposal_builder');
          setEstimateReviewOpen(false);
        }}
      />

      {/* Dynamic Pricing — powered by PricingStage */}
      <Dialog open={dynamicPricingOpen} onOpenChange={setDynamicPricingOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dynamic Pricing</DialogTitle>
          </DialogHeader>
          <PricingStage
            jobId={job?.id}
            scopeOfWorkId={derived.scopeOfWork?.id}
            estimatePackageId={derived.estimatePackages?.find(p => p.is_selected)?.id || derived.estimatePackages?.[0]?.id}
            onReturnToScope={() => {
              setDynamicPricingOpen(false);
              setScopeEditReturnTo('dynamic_pricing');
              setScopeBuilderOpen(true);
            }}
            onReturnToPackages={() => {
              setDynamicPricingOpen(false);
              setPackageBuilderOpen(true);
            }}
            onApprove={async () => {
              try {
                const latestSnap = await base44.entities.PricingCalculationSnapshot.filter(
                  { job_id: job.id, calculation_status: { $in: ['approved', 'overridden'] } },
                  '-calculated_at', 1
                );
                if (latestSnap.length > 0) {
                  await base44.functions.invoke('generateCustomerEstimate', {
                    job_id: job.id,
                    pricing_snapshot_id: latestSnap[0].id,
                  });
                  toast.success('Customer estimate generated from approved pricing');
                }
              } catch (e) {
                console.error('Failed to generate customer estimate:', e);
                toast.error('Estimate generation failed — pricing is still approved');
              }
              await completeStage('dynamic_pricing', { pricing_completed_at: new Date().toISOString() });
              await refresh();
              await updateStageState('final_estimate_review', { status: 'available', started_at: new Date().toISOString() });
              console.log('[WorkflowOrder] dynamic_pricing approved → next: final_estimate_review');
              setDynamicPricingOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <RecommendationReviewDialog
        open={recReviewOpen}
        jobId={job?.id}
        findings={derived.findings}
        legacyFindings={derived.legacyFindings}
        inspectionSetup={derived.inspectionSetup}
        appointments={appointments}
        effectiveEmail={effectiveEmail}
        effectiveName={effectiveName}
        isManager={isManager}
        onRefresh={refresh}
        onClose={() => setRecReviewOpen(false)}
        onComplete={async (hasEstimateItems) => {
          await completeStage('recommendation_review', {
            review_completed_at: new Date().toISOString(),
            result: hasEstimateItems ? 'estimate_required' : 'no_estimate_required',
          });
          await logActivity('activity_completed', `Recommendation Review completed${hasEstimateItems ? ' — estimate items generated' : ' — no estimate required'}`, {
            stage: 'recommendation_review',
            result: hasEstimateItems ? 'estimate_required' : 'no_estimate_required',
          });
          await refresh();
          setRecReviewOpen(false);
        }}
      />

      <ProposalBuilderDialog
        open={proposalBuilderOpen}
        jobId={job?.id}
        estimate={derived.estimate}
        draftEstimateItems={derived.draftEstimateItems}
        onRefresh={refresh}
        onClose={() => setProposalBuilderOpen(false)}
        onContinue={async () => {
          await completeStage('proposal_builder', { review_completed_at: new Date().toISOString() });
          await refresh();
          await updateStageState('customer_presentation', { status: 'in_progress', started_at: new Date().toISOString() });
          setProposalBuilderOpen(false);
        }}
      />

      {/* Estimate Package Builder (v2 workflow — creates packages before scope of work) */}
      <ProposalBuilderDialog
        open={packageBuilderOpen}
        jobId={job?.id}
        estimate={derived.estimate}
        draftEstimateItems={derived.draftEstimateItems}
        onRefresh={refresh}
        onClose={() => setPackageBuilderOpen(false)}
        onContinue={async () => {
          await completeStage('estimate_package_builder', { builder_completed_at: new Date().toISOString() });
          await refresh();
          await updateStageState('scope_of_work', { status: 'available', started_at: new Date().toISOString() });
          console.log('[WorkflowOrder] estimate_package_builder completed → next: scope_of_work');
          setPackageBuilderOpen(false);
        }}
      />

      <ExecutionPlanDialog
        open={executionPlanOpen}
        jobId={job?.id}
        scopeOfWork={derived.scopeOfWork}
        draftEstimateItems={derived.draftEstimateItems}
        estimate={derived.estimate}
        effectiveName={effectiveName}
        onClose={() => setExecutionPlanOpen(false)}
        onComplete={async (completionData) => {
          console.log('[ExecutionPlan] Completion triggered:', completionData);
          await completeStage('execution_plan', {
            completed_at: new Date().toISOString(),
            completed_by: effectiveName,
            appointments_generated: completionData?.appointmentsGenerated || 0,
          });
          await logActivity('activity_completed', 'Execution Plan completed', {
            stage: 'execution_plan',
            appointments_generated: completionData?.appointmentsGenerated || 0,
          });
          await refresh();
          // Advance to complete_appointment
          await updateStageState('complete_appointment', { status: 'available', started_at: new Date().toISOString() });
          console.log('[ExecutionPlan] Stage completed → advanced to complete_appointment');
          setExecutionPlanOpen(false);
          toast.success('Execution Plan completed. Ready to perform work.');
        }}
      />

      <ScopeOfWorkBuilderDialog
        open={scopeBuilderOpen}
        jobId={job?.id}
        repairRecs={derived.repairRecs}
        estimate={derived.estimate}
        estimatePackageId={scopeBuilderPackageId}
        onRefresh={refresh}
        onClose={() => { setScopeBuilderOpen(false); setScopeBuilderPackageId(null); }}
        onContinue={async () => {
          console.log('[ScopeTransition] ─── Step 1: Scope Save Clicked — onContinue invoked ───');

          // Step 2: Reload ScopeOfWork from backend (not from React state)
          console.log('[ScopeTransition] Step 2: Reloading ScopeOfWork from backend...');
          const scopes = await base44.entities.ScopeOfWork.filter({ job_id: job?.id }, '-created_date').catch(() => []);
          const savedScope = scopes.find(s => s.status === 'approved') || scopes[0] || null;
          console.log('[ScopeTransition] Step 2: Scope record reloaded — id:', savedScope?.id, 'status:', savedScope?.status, 'total_hours:', savedScope?.total_estimated_hours);

          // Step 4 (early): Validate scope completion from backend record
          if (!savedScope) {
            toast.error('Dynamic Pricing could not open: Scope record could not be reloaded');
            console.log('[ScopeTransition] BLOCKED: Scope record not found');
            return;
          }
          if (savedScope.status !== 'approved') {
            toast.error(`Dynamic Pricing could not open: Scope status is "${savedScope.status}", expected "approved"`);
            console.log('[ScopeTransition] BLOCKED: Scope status is', savedScope.status);
            return;
          }

          // Step 3: Update workflow stage state to completed
          await completeStage('scope_of_work', { builder_completed_at: new Date().toISOString() });
          console.log('[ScopeTransition] Step 3: Scope Status Updated — stage_states.scope_of_work = completed');

          // Step 4: Scope Completion Validation (from backend record)
          const completionValid = savedScope.job_id === job?.id && savedScope.status === 'approved' && (savedScope.total_estimated_hours || 0) > 0;
          console.log('[ScopeTransition] Step 4: Scope Completion Validation — valid:', completionValid);

          // Step 5: Refresh workflow state
          await refresh();
          console.log('[ScopeTransition] Step 5: Workflow State Refreshed');

          // Step 6: Effective stages recalculated (via useMemo on next render)
          console.log('[ScopeTransition] Step 6: Effective Stage Recalculated (via useMemo — will reflect on next render)');

          // Step 7: Evaluate pricing readiness (read from wfMeta — stable, not stale)
          const pricingReady = wfMeta.useV2Workflow && completionValid;
          console.log('[ScopeTransition] Step 7: Pricing Readiness Evaluated — v2:', wfMeta.useV2Workflow, 'scope_valid:', completionValid, 'ready:', pricingReady);

          // Step 8: Close scope dialog
          setScopeBuilderOpen(false);
          console.log('[ScopeTransition] Step 8: Scope Dialog Closed');

          // Handle return-to cases
          if (scopeEditReturnTo === 'final_estimate_review') {
            setScopeEditReturnTo(null);
            setEstimateReviewOpen(true);
            console.log('[ScopeTransition] Step 9: Reopening Estimate Review (return-to)');
            return;
          } else if (scopeEditReturnTo === 'dynamic_pricing') {
            setScopeEditReturnTo(null);
            await updateStageState('dynamic_pricing', { status: 'in_progress', started_at: new Date().toISOString() });
            setDynamicPricingOpen(true);
            console.log('[ScopeTransition] Step 9: PricingStage Opened (return-to dynamic_pricing)');
            return;
          }

          // Step 9: Open PricingStage explicitly
          if (pricingReady) {
            await updateStageState('dynamic_pricing', { status: 'in_progress', started_at: new Date().toISOString() });
            setDynamicPricingOpen(true);
            toast.success('Scope of Work saved. Proceeding to Dynamic Pricing.');
            console.log('[ScopeTransition] Step 9: PricingStage Opened ✓');
          } else if (!wfMeta.useV2Workflow) {
            toast.info('Scope of Work saved. Estimate generated with dynamic pricing.');
            console.log('[ScopeTransition] Legacy workflow — pricing stage skipped');
          } else {
            let reason = 'Unknown';
            if (!completionValid) reason = 'Scope completion validation failed — missing hours or job mismatch';
            toast.error(`Dynamic Pricing could not open: ${reason}`);
            console.log('[ScopeTransition] BLOCKED:', reason);
          }
        }}
      />

      <SignatureBlockDialog
        open={!!signatureBlock}
        validation={signatureBlock}
        appointmentId={todaysAppointment?.id}
        onCaptureSignature={() => {
          // Derive the correct purpose from the FIRST missing signature type
          // so the modal opens with the right default — prevents type mismatch.
          const firstMissing = signatureBlock?.missingSignatures?.[0];
          const purpose = firstMissing?.purpose || 'completion_acceptance';
          const stage = signatureBlock?.blockingStage || null;
          console.log('[Signature] Opening modal — required purpose:', purpose, 'stage:', stage);
          setSignatureDefaultPurpose(purpose);
          setSignatureWorkflowStage(stage);
          setSignatureBlock(null);
          setActiveModal('signature');
        }}
        onClose={() => setSignatureBlock(null)}
      />

      <CustomerPresentationDialog
        open={presentationOpen}
        jobId={job?.id}
        workflow={workflow}
        derived={derived}
        effectiveName={effectiveName}
        todaysAppointment={todaysAppointment}
        refreshTrigger={presentationRefreshTrigger}
        signatureCaptured={activityLogs.some(l => l.event_type === 'signature_captured')}
        signatureInfo={(() => {
          const sigLog = [...activityLogs].reverse().find(l => l.event_type === 'signature_captured');
          if (!sigLog) return null;
          try { return JSON.parse(sigLog.event_details); } catch { return null; }
        })()}
        onClose={() => setPresentationOpen(false)}
        onPresentationComplete={async (dialogCustomerDecision) => {
          return await runPresentationCompletion(activityLogsRef.current, dialogCustomerDecision, 'presentation_dialog');
        }}
        onComplete={async (workflowDecision, detailedDecision) => {
          return await runDecisionCompletion(activityLogsRef.current, workflowDecision, detailedDecision, 'decision_dialog');
        }}
      />

      <RecommendationReviewBlockDialog
        open={recReviewBlockOpen}
        deficiencyCount={deficiencyCount}
        reviewedCount={derived.recommendationReview?.reviewed_deficiencies || 0}
        onStartReview={() => {
          setRecReviewBlockOpen(false);
          setRecReviewOpen(true);
        }}
        onClose={() => setRecReviewBlockOpen(false)}
        onReturnToHub={() => setRecReviewBlockOpen(false)}
      />

      <CleanInspectionDialog
        open={cleanInspectionOpen}
        job={job}
        inspectionReport={derived.inspectionReport}
        requireSignature={requireSignatureClean}
        effectiveName={effectiveName}
        onClose={() => setCleanInspectionOpen(false)}
        onComplete={async (completionData) => {
          if (completionData.signatureCaptured && completionData.signatureAudit) {
            let appointmentId = null;
            try {
              const todayStr = new Date().toLocaleDateString('en-CA');
              const appts = await base44.entities.Appointment.filter({ job_id: job.id });
              const todayAppt = appts.find(a => (a.scheduled_start || '').slice(0, 10) === todayStr);
              appointmentId = todayAppt?.id || null;
            } catch (e) { /* non-blocking */ }
            await logActivity('signature_captured', `Inspection acknowledgment signature captured — ${completionData.signatureAudit.purposeLabel}`, {
              ...completionData.signatureAudit,
              signed_by_user: effectiveName,
              appointment_id: appointmentId,
            });
          }
          if (completionData.finalNotes) {
            await logActivity('note_added', `Final notes: ${completionData.finalNotes}`);
          }
          await logActivity('job_completed', 'Clean inspection completed — no repair recommendations');
          await completeStage('complete_appointment', {
            device: navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop',
            clean_inspection: true,
            report_reviewed: completionData.reportReviewed,
            signature_captured: completionData.signatureCaptured,
          });

          const todayStr = new Date().toLocaleDateString('en-CA');
          try {
            const appts = await base44.entities.Appointment.filter({ job_id: job.id });
            const todayAppt = appts.find(a => (a.scheduled_start || '').slice(0, 10) === todayStr);
            if (todayAppt?.id) {
              await base44.entities.Appointment.update(todayAppt.id, { status: 'completed' });
            }
            const remaining = appts.filter(a => a.id !== todayAppt?.id && ['scheduled', 'confirmed', 'dispatched', 'started'].includes(a.status));
            if (remaining.length === 0) {
              await base44.entities.Job.update(job.id, { status: 'completed' });
            }
          } catch (e) { console.error('Appointment resolution failed:', e); }

          setHubStatus('completed');
          setCleanInspectionOpen(false);
          navigate('/tech/dashboard');
        }}
      />

      {/* ── Reopen Stage Dialog ── */}
      <ReopenStageDialog
        open={!!reopenStageKey}
        stageKey={reopenStageKey}
        stageState={reopenStageState}
        workflow={workflow}
        userRole={effectiveRole || employee?.role || 'user'}
        isLead={isLead}
        isAssignedTech={!!employee?.employee_id}
        onClose={() => { setReopenStageKey(null); setReopenStageState(null); }}
        onConfirm={async (reason) => {
          const result = await reopenStage(reopenStageKey, reason);
          if (result?.success) {
            await refresh();
            await refreshRevisions();
          }
          setReopenStageKey(null);
          setReopenStageState(null);
        }}
      />

      {/* ── Workflow Revision History ── */}
      <WorkflowRevisionHistory
        open={revisionHistoryOpen}
        jobId={jobId}
        onClose={() => setRevisionHistoryOpen(false)}
      />
    </div>
  );
}