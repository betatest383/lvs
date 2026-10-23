import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const dateOnly = (d) => d ? String(d).split('T')[0] : '';

/**
 * Determines whether a job belongs to the given employee.
 * Checks all known linking fields (some may not exist on every Job record).
 * Returns a human-readable reason string on match, or null.
 */
export function jobMatchReason(job, emp) {
  if (!emp || !job) return null;
  const email = (emp.email || emp.login_email || '').toLowerCase();
  const empName = `${emp.preferred_name || emp.first_name || ''} ${emp.last_name || ''}`.trim();
  const empId = emp.employee_id || '';
  const registryId = emp.id || '';
  const stTechId = emp.servicetitan_employee_id || '';
  const truck = emp.assigned_truck || '';

  if (email && job.technician_email && String(job.technician_email).toLowerCase() === email)
    return 'technician_email match';
  if (email && Array.isArray(job.technician_emails) && job.technician_emails.some(e => String(e).toLowerCase() === email))
    return 'technician_emails contains email';
  if (registryId && job.assigned_employee_registry_id === registryId)
    return 'assigned_employee_registry_id match';
  if (empId && job.assigned_employee_id === empId)
    return 'assigned_employee_id match';
  if (stTechId && job.servicetitan_technician_id === stTechId)
    return 'servicetitan_technician_id match';
  if (empName && job.technician_name && String(job.technician_name).toLowerCase() === empName.toLowerCase())
    return 'technician_name match';
  if (truck && job.assigned_truck && job.assigned_truck === truck)
    return 'assigned_truck match';
  return null;
}

/**
 * Pure function that takes an array of jobs and an employee object,
 * returns categorized job lists + debug info.
 * Shared between useMyJobs hook and useTechDashboardData.
 */
export function resolveMyJobs(jobs, employee, appointments = []) {
  const today = new Date().toLocaleDateString('en-CA');
  const inclusionReasons = {};
  const matchingJobs = [];
  const email = (employee?.email || employee?.login_email || '').toLowerCase();

  // Build a set of job_ids from appointments where the employee is lead or apprentice
  const appointmentReasons = {};
  (appointments || []).forEach(apt => {
    if (!apt.job_id) return;
    let reason = null;
    if (email && apt.technician_email && String(apt.technician_email).toLowerCase() === email) {
      reason = 'appointment lead_technician match';
    } else if (email && apt.apprentice_email && String(apt.apprentice_email).toLowerCase() === email) {
      reason = 'appointment apprentice match';
    } else if (email && apt.crew_assignment) {
      try {
        const crew = JSON.parse(apt.crew_assignment);
        if (Array.isArray(crew) && crew.some(c => c.email && c.email.toLowerCase() === email)) {
          reason = 'appointment crew_assignment match';
        }
      } catch { /* invalid JSON, skip */ }
    }
    if (reason) {
      appointmentReasons[apt.job_id] = reason;
    }
  });

  (jobs || []).forEach(j => {
    const reason = jobMatchReason(j, employee) || appointmentReasons[j.id] || null;
    if (reason) {
      matchingJobs.push(j);
      inclusionReasons[j.crm_job_number || j.id] = reason;
    }
  });

  const activeJobs = matchingJobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled');
  const todayJobs = activeJobs.filter(j => dateOnly(j.service_date) === today);
  const upcomingJobs = activeJobs.filter(j => dateOnly(j.service_date) > today);
  const overdueJobs = activeJobs.filter(j => dateOnly(j.service_date) < today);
  const historyJobs = matchingJobs.filter(j =>
    j.status === 'completed' || j.status === 'cancelled' || dateOnly(j.service_date) < today
  );

  const empName = `${employee?.preferred_name || employee?.first_name || ''} ${employee?.last_name || ''}`.trim();

  const jobsResolutionInfo = {
    lookup_keys: {
      employee_id: employee?.employee_id || '(not set)',
      employee_email: email || '(empty)',
      employee_name: empName || '(empty)',
      servicetitan_technician_id: employee?.servicetitan_employee_id || '(not set)',
      employee_registry_id: employee?.id || '(not set)',
      assigned_truck: employee?.assigned_truck || '(not set)',
    },
    query_executed: `Job.list('-service_date', 200) + Appointment.list('-scheduled_start', 200) → match by: lead_technician_email OR apprentice_email OR technician_email OR technician_emails includes email OR appointment.technician_email OR appointment.apprentice_email OR appointment.crew_assignment includes email OR assigned_employee_registry_id===id OR assigned_employee_id===employee_id OR servicetitan_technician_id===st_id OR technician_name===name OR assigned_truck===truck`,
    matching_jobs_count: matchingJobs.length,
    matching_job_ids: matchingJobs.slice(0, 5).map(j => j.id),
    total_jobs_fetched: jobs?.length || 0,
    reason: matchingJobs.length === 0
      ? `No matching jobs found for ${empName} (${email}). Checked ${jobs?.length || 0} total jobs.`
      : null,
  };

  const jobsQueryCriteria = {
    filter: `lead_technician_email===email OR apprentice_email===email OR technician_email===email OR technician_emails includes email OR appointment.technician_email===email OR appointment.apprentice_email===email OR appointment.crew_assignment includes email OR assigned_employee_registry_id===id OR assigned_employee_id===emp_id OR servicetitan_technician_id===st_id OR technician_name===name OR assigned_truck===truck`,
    date_filter: `service_date === "${today}"`,
    status_filter: 'status !== "completed" && status !== "cancelled" (for today/upcoming)',
    total_jobs_fetched: jobs?.length || 0,
  };

  return {
    todayJobs,
    upcomingJobs,
    overdueJobs,
    historyJobs,
    matchingJobs,
    inclusionReasons,
    jobsResolutionInfo,
    jobsQueryCriteria,
    today,
  };
}

/**
 * Shared hook that fetches all jobs and resolves which belong to the given employee.
 * Used by: Today's Jobs page, Technician Dashboard, Developer Panel, Job Readiness widgets.
 *
 * @param {object} employee - EmployeeRegistry record (or constructed fallback)
 * @returns { todayJobs, upcomingJobs, overdueJobs, historyJobs, matchingJobs, inclusionReasons, jobsResolutionInfo, jobsQueryCriteria, today, loading, error }
 */
export function useMyJobs(employee) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!employee) {
      setLoading(false);
      setResult(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const [jobs, appointments] = await Promise.all([
          base44.entities.Job.list('-service_date', 200),
          base44.entities.Appointment.list('-scheduled_start', 200),
        ]);
        if (cancelled) return;
        setResult(resolveMyJobs(jobs, employee, appointments));
      } catch (e) {
        console.error('useMyJobs error:', e);
        if (!cancelled) setError(e.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [
    employee?.id,
    employee?.email,
    employee?.login_email,
    employee?.employee_id,
    employee?.servicetitan_employee_id,
    employee?.assigned_truck,
    employee?.first_name,
    employee?.last_name,
    employee?.preferred_name,
  ]);

  return {
    todayJobs: result?.todayJobs || [],
    upcomingJobs: result?.upcomingJobs || [],
    overdueJobs: result?.overdueJobs || [],
    historyJobs: result?.historyJobs || [],
    matchingJobs: result?.matchingJobs || [],
    inclusionReasons: result?.inclusionReasons || {},
    jobsResolutionInfo: result?.jobsResolutionInfo || null,
    jobsQueryCriteria: result?.jobsQueryCriteria || null,
    today: result?.today || new Date().toLocaleDateString('en-CA'),
    loading,
    error,
  };
}