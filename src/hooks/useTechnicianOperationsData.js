import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const FIELD_SERVICE_DEPARTMENTS = ['field service', 'field operations'];
const FIELD_SERVICE_ROLE_KEYWORDS = ['lead tech', 'apprentice', 'mason', 'technician'];

function isFieldServiceEmployee(e) {
  const dept = (e.department || '').toLowerCase();
  const role = (e.primary_role || '').toLowerCase();
  return FIELD_SERVICE_DEPARTMENTS.some(d => dept.includes(d)) ||
         FIELD_SERVICE_ROLE_KEYWORDS.some(r => role.includes(r));
}

const dateOnly = (d) => d ? String(d).split('T')[0] : '';

async function safe(promise, fallback = []) {
  try {
    return await promise;
  } catch (e) {
    console.error('TechnicianOps fetch error:', e);
    return fallback;
  }
}

function isCertExpiring(cert) {
  if (!cert.expiration_date) return false;
  const today = new Date();
  const exp = new Date(cert.expiration_date);
  const daysUntil = Math.round((exp - today) / (1000 * 60 * 60 * 24));
  return daysUntil <= 30;
}

/**
 * Fetches operational data for ALL active field service employees.
 * EmployeeRegistry is the single source of truth for technician data.
 */
export function useTechnicianOperationsData() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const today = new Date().toLocaleDateString('en-CA');

        const [
          empRecords,
          trucks,
          jobs,
          wh105Records,
          tasks,
          notifications,
          certifications,
        ] = await Promise.all([
          safe(base44.entities.EmployeeRegistry.list('-created_date', 500)),
          safe(base44.entities.TruckProfile.list('-updated_date', 100)),
          safe(base44.entities.Job.list('-service_date', 500)),
          safe(base44.entities.Wh105DepartureCheck.filter({ date: today })),
          safe(base44.entities.EnterpriseTask.list('-created_date', 500)),
          safe(base44.entities.EnterpriseNotification.list('-created_date', 500)),
          safe(base44.entities.EmployeeCertification.list('-created_date', 500)),
        ]);

        if (cancelled) return;

        const truckMap = {};
        trucks.forEach(t => {
          if (t.truck_id) truckMap[t.truck_id] = t;
          if (t.truck_number) truckMap[t.truck_number] = t;
        });

        const activeFieldEmployees = empRecords
          .filter(isFieldServiceEmployee)
          .filter(e => e.employment_status === 'Active' || !e.employment_status)
          .map(e => {
            const fullName = `${e.first_name || ''} ${e.last_name || ''}`.trim();
            const email = (e.email || '').toLowerCase();
            const truck = e.assigned_truck ? truckMap[e.assigned_truck] : null;
            const truckNumber = truck?.truck_number || e.assigned_truck || '';

            // Today's jobs
            const todayJobs = jobs.filter(j =>
              dateOnly(j.service_date) === today &&
              j.status !== 'cancelled' &&
              ((j.technician_emails || []).map(te => te.toLowerCase()).includes(email) ||
               (j.technician_email || '').toLowerCase() === email)
            );

            // WH-105 status
            const wh105 = wh105Records.find(w =>
              (w.technician_email || '').toLowerCase() === email
            );
            const wh105Status = wh105?.overall_status || null;

            // Morning readiness derived from WH-105
            let morningReadiness = 'Not Started';
            if (wh105Status) {
              const s = wh105Status.toLowerCase();
              if (s.includes('complete') || s.includes('pass') || s.includes('ready')) morningReadiness = 'Ready';
              else if (s.includes('progress') || s.includes('pending')) morningReadiness = 'In Progress';
              else if (s.includes('block') || s.includes('fail') || s.includes('issue')) morningReadiness = 'Blocked';
              else morningReadiness = wh105Status;
            }

            // Open tasks
            const openTasks = tasks.filter(t =>
              t.status !== 'Completed' && t.status !== 'Cancelled' &&
              ((t.assigned_to_email || '').toLowerCase() === email ||
               (t.assigned_to && t.assigned_to === fullName) ||
               (t.assigned_to && t.assigned_to === e.employee_id))
            );

            // Critical notifications
            const criticalNotifs = notifications.filter(n =>
              !n.is_archived &&
              n.priority === 'Critical' &&
              n.status !== 'Read' && n.status !== 'Acknowledged' &&
              ((n.recipient_email || '').toLowerCase() === email ||
               (e.primary_role && n.recipient_role === e.primary_role) ||
               (e.department && n.recipient_department === e.department))
            );

            // Certifications expiring
            const expiringCerts = certifications.filter(c =>
              ((c.employee_email || '').toLowerCase() === email ||
                (c.employee_name && c.employee_name === fullName)) &&
              isCertExpiring(c)
            );

            return {
              ...e,
              id: e.id,
              full_name: fullName,
              email,
              role: e.primary_role || '—',
              assigned_truck: truckNumber || '—',
              truck_id: truck?.truck_id || e.assigned_truck || '',
              today_jobs_count: todayJobs.length,
              today_jobs: todayJobs,
              wh105_status: wh105Status,
              wh105_record_id: wh105?.departure_id || wh105?.id || null,
              morning_readiness: morningReadiness,
              open_tasks_count: openTasks.length,
              open_tasks: openTasks,
              critical_notifications_count: criticalNotifs.length,
              critical_notifications: criticalNotifs,
              expiring_certs_count: expiringCerts.length,
              expiring_certs: expiringCerts,
            };
          });

        if (!cancelled) setEmployees(activeFieldEmployees);
      } catch (e) {
        console.error('TechnicianOps load error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  return { employees, loading };
}