import { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';

const todayStr = () => new Date().toLocaleDateString('en-CA');

function safeParse(str, fallback) {
  if (!str) return fallback;
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
}

/**
 * Hook that manages the technician's daily Job Hub session.
 *
 * - Finds or creates today's TechnicianDailySession
 * - Finds or creates today's MorningWorkflowRun
 * - Manages clock-in, step completion, dispatch, and manager override
 * - Provides a live timer for the morning workflow
 */
export function useJobHubDaily(employee, todayJobs = []) {
  const [session, setSession] = useState(null);
  const [morningRun, setMorningRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timer, setTimer] = useState('00:00:00');
  const timerRef = useRef(null);

  const email = employee?.login_email || employee?.email || '';
  const techName = employee
    ? `${employee.preferred_name || employee.first_name || ''} ${employee.last_name || ''}`.trim()
    : '';
  const empId = employee?.employee_id || '';

  // Load or create today's session and morning workflow run
  const load = useCallback(async () => {
    if (!email) { setLoading(false); return; }
    try {
      setLoading(true);
      setError(null);
      const today = todayStr();

      // Find today's session
      let sessions = await base44.entities.TechnicianDailySession.filter({
        technician_email: email, date: today,
      }).catch(() => []);
      let sess = sessions[0];

      // Find today's morning workflow run
      let runs = await base44.entities.MorningWorkflowRun.filter({
        technician_email: email, date: today,
      }).catch(() => []);
      let run = runs[0];

      // Determine if tech has a scheduled job today
      const firstJob = todayJobs[0] || null;
      const hasJob = !!firstJob;

      // Create session if missing
      if (!sess) {
        sess = await base44.entities.TechnicianDailySession.create({
          technician_email: email,
          technician_name: techName,
          employee_id: empId,
          date: today,
          status: 'not_started',
          has_scheduled_job: hasJob,
          first_job: firstJob ? JSON.stringify({
            job_id: firstJob.id,
            customer_name: firstJob.customer_name,
            address: firstJob.address,
            service_date: firstJob.service_date,
            job_type: firstJob.job_type || firstJob.appointment_type || '',
          }) : '',
        });
      } else if (sess.has_scheduled_job !== hasJob || (!sess.first_job && firstJob)) {
        sess = await base44.entities.TechnicianDailySession.update(sess.id, {
          has_scheduled_job: hasJob,
          first_job: firstJob ? JSON.stringify({
            job_id: firstJob.id,
            customer_name: firstJob.customer_name,
            address: firstJob.address,
            service_date: firstJob.service_date,
            job_type: firstJob.job_type || firstJob.appointment_type || '',
          }) : sess.first_job,
        });
      }

      // Create morning run if missing (only if clocked in or has job)
      if (!run && sess.clock_in_time) {
        run = await base44.entities.MorningWorkflowRun.create({
          technician_email: email,
          technician_name: techName,
          employee_id: empId,
          date: today,
          linked_job_id: firstJob?.id || '',
          status: 'in_progress',
          started_at: sess.clock_in_time,
          checklist_results: JSON.stringify({}),
        });
      }

      setSession(sess);
      setMorningRun(run);
    } catch (e) {
      setError(e.message || 'Failed to load daily session');
    } finally {
      setLoading(false);
    }
  }, [email, techName, empId, todayJobs]);

  useEffect(() => { load(); }, [load]);

  // Timer tick — updates every second while morning workflow is active
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!session?.clock_in_time || session?.first_dispatch_time) {
      if (session?.first_dispatch_time && session?.morning_workflow_started_at) {
        // Show final duration
        import('@/lib/jobHubDailyConfig').then(({ formatElapsedTime }) => {
          setTimer(formatElapsedTime(session.morning_workflow_started_at, session.first_dispatch_time));
        });
      }
      return;
    }
    timerRef.current = setInterval(() => {
      import('@/lib/jobHubDailyConfig').then(({ formatElapsedTime }) => {
        const start = session.morning_workflow_started_at || session.clock_in_time;
        setTimer(formatElapsedTime(start, null));
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [session?.clock_in_time, session?.first_dispatch_time, session?.morning_workflow_started_at]);

  // Clock in
  const clockIn = useCallback(async () => {
    if (!session) return;
    const now = new Date().toISOString();
    const updated = await base44.entities.TechnicianDailySession.update(session.id, {
      clock_in_time: now,
      morning_workflow_started_at: now,
      status: 'morning_workflow_active',
    });
    setSession(updated);

    // Create morning workflow run
    const today = todayStr();
    const firstJob = todayJobs[0] || null;
    const run = await base44.entities.MorningWorkflowRun.create({
      technician_email: email,
      technician_name: techName,
      employee_id: empId,
      date: today,
      linked_job_id: firstJob?.id || '',
      started_at: now,
      status: 'in_progress',
      checklist_results: JSON.stringify({}),
    });
    setMorningRun(run);

    // Create workflow timer
    await base44.entities.WorkflowTimer.create({
      technician_email: email,
      technician_name: techName,
      date: today,
      timer_type: 'morning_workflow',
      started_at: now,
      status: 'running',
    });
  }, [session, email, techName, empId, todayJobs]);

  // Complete a step
  const completeStep = useCallback(async (stepId) => {
    if (!morningRun) return;
    const checklist = safeParse(morningRun.checklist_results, {});
    const updatedChecklist = {
      ...checklist,
      [stepId]: { status: 'complete', completed_at: new Date().toISOString() },
    };
    const updated = await base44.entities.MorningWorkflowRun.update(morningRun.id, {
      checklist_results: JSON.stringify(updatedChecklist),
    });
    setMorningRun(updated);

    // Update session status based on progress
    const allBlocking = ['morning_workflow', 'truck_readiness'].every(id =>
      ['complete', 'not_required', 'manager_override'].includes(updatedChecklist[id]?.status || 'not_started')
    );
    if (allBlocking && session.status === 'morning_workflow_active') {
      const updatedSession = await base44.entities.TechnicianDailySession.update(session.id, {
        status: 'ready_for_dispatch',
      });
      setSession(updatedSession);
    }
  }, [morningRun, session]);

  // Skip a step (mark as not_required)
  const skipStep = useCallback(async (stepId) => {
    if (!morningRun) return;
    const checklist = safeParse(morningRun.checklist_results, {});
    const updatedChecklist = {
      ...checklist,
      [stepId]: { status: 'not_required', skipped_at: new Date().toISOString() },
    };
    const updated = await base44.entities.MorningWorkflowRun.update(morningRun.id, {
      checklist_results: JSON.stringify(updatedChecklist),
    });
    setMorningRun(updated);
  }, [morningRun]);

  // Start morning workflow (navigate to readiness page)
  const startMorningWorkflow = useCallback(async () => {
    if (!morningRun) return;
    if (morningRun.status === 'not_started' || !morningRun.started_at) {
      const now = new Date().toISOString();
      const updated = await base44.entities.MorningWorkflowRun.update(morningRun.id, {
        started_at: now,
        status: 'in_progress',
      });
      setMorningRun(updated);
    }
  }, [morningRun]);

  // Dispatch to first job
  const dispatch = useCallback(async () => {
    if (!session) return;
    const now = new Date().toISOString();
    const start = session.morning_workflow_started_at || session.clock_in_time;
    const durationMin = start ? Math.round((new Date(now).getTime() - new Date(start).getTime()) / 60000) : 0;

    const updated = await base44.entities.TechnicianDailySession.update(session.id, {
      first_dispatch_time: now,
      morning_workflow_ended_at: now,
      morning_workflow_duration_minutes: durationMin,
      status: 'dispatched',
    });
    setSession(updated);

    // Complete the morning workflow run
    if (morningRun) {
      const updatedRun = await base44.entities.MorningWorkflowRun.update(morningRun.id, {
        completed_at: now,
        status: 'complete',
      });
      setMorningRun(updatedRun);
    }

    // Stop the workflow timer
    const timers = await base44.entities.WorkflowTimer.filter({
      technician_email: email, date: todayStr(), timer_type: 'morning_workflow', status: 'running',
    }).catch(() => []);
    if (timers[0]) {
      await base44.entities.WorkflowTimer.update(timers[0].id, {
        ended_at: now,
        duration_minutes: durationMin,
        status: 'stopped',
      });
    }
  }, [session, morningRun, email]);

  // Manager override
  const managerOverride = useCallback(async (reason, signatureDataUrl, overrideBy) => {
    if (!morningRun) return;
    const checklist = safeParse(morningRun.checklist_results, {});
    const updatedChecklist = { ...checklist };
    // Mark blocking steps as manager_override
    ['morning_workflow', 'truck_readiness'].forEach(id => {
      if (!['complete', 'not_required'].includes(updatedChecklist[id]?.status || 'not_started')) {
        updatedChecklist[id] = { status: 'manager_override', override_at: new Date().toISOString() };
      }
    });
    const updatedRun = await base44.entities.MorningWorkflowRun.update(morningRun.id, {
      checklist_results: JSON.stringify(updatedChecklist),
      manager_override_used: true,
      override_reason: reason,
      override_signature: signatureDataUrl,
      override_by: overrideBy,
      status: 'manager_override',
    });
    setMorningRun(updatedRun);

    const updatedSession = await base44.entities.TechnicianDailySession.update(session.id, {
      manager_override_used: true,
      override_reason: reason,
      status: 'ready_for_dispatch',
    });
    setSession(updatedSession);
  }, [morningRun, session]);

  const refresh = useCallback(() => { load(); }, [load]);

  // Derived data
  const checklist = safeParse(morningRun?.checklist_results, {});
  const firstJobData = safeParse(session?.first_job, null);

  return {
    session,
    morningRun,
    checklist,
    firstJobData,
    timer,
    loading,
    error,
    clockIn,
    completeStep,
    skipStep,
    startMorningWorkflow,
    dispatch,
    managerOverride,
    refresh,
  };
}