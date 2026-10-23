import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Loader2, Save, Trash2, UserPlus, AlertTriangle, CheckCircle2, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import { formatDateET } from '@/lib/timezone';
import TruckAssignmentField from '@/components/jobs/TruckAssignmentField';
import ConflictOverrideDialog from '@/components/jobs/ConflictOverrideDialog';
import { useCurrentRole } from '@/hooks/useCurrentRole';
import { canOverrideConflict } from '@/lib/roleUtils';

const DISPATCH_COLORS = {
  unassigned: 'bg-muted text-muted-foreground',
  assigned: 'bg-blue-100 text-blue-700',
  dispatched: 'bg-amber-100 text-amber-700',
  started: 'bg-orange-100 text-orange-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

/**
 * Check if two time windows overlap.
 * Overlap exists only if: new_start < existing_end AND new_end > existing_start
 * Adjacent appointments (one ends when the other starts) do NOT conflict.
 */
function timeWindowsOverlap(newStart, newEnd, existingStart, existingEnd) {
  if (!newStart || !newEnd || !existingStart || !existingEnd) return false;
  return moment(newStart).isBefore(moment(existingEnd)) &&
         moment(newEnd).isAfter(moment(existingStart));
}

const APP_TIMEZONE = 'America/New_York';

/** Parse an instant (ISO) and return its wall-clock parts in APP_TIMEZONE. */
function toZonedParts(iso) {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const map = {};
  for (const p of fmt.formatToParts(d)) map[p.type] = p.value;
  const hour = map.hour === '24' ? '00' : map.hour;
  return { year: map.year, month: map.month, day: map.day, hour, minute: map.minute };
}

/** Format an ISO timestamp as YYYY-MM-DD in APP_TIMEZONE for <input type="date">. */
function toDateInput(v) {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const p = toZonedParts(v);
  return p ? `${p.year}-${p.month}-${p.day}` : '';
}

/** Format an ISO timestamp as HH:mm in APP_TIMEZONE for <input type="time">. */
function toTimeInput(v) {
  if (!v) return '';
  if (/^\d{2}:\d{2}$/.test(v)) return v; // already a wall-clock time — no conversion
  const p = toZonedParts(v);
  return p ? `${p.hour}:${p.minute}` : '';
}

/** Convert a wall-clock date+time in APP_TIMEZONE back to a UTC ISO string. */
function wallClockToUtcISO(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  const asIfUtc = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (isNaN(asIfUtc.getTime())) return null;
  const p = toZonedParts(asIfUtc);
  if (!p) return null;
  const zonedAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  const offsetMin = (zonedAsUtc - asIfUtc.getTime()) / 60000;
  return new Date(asIfUtc.getTime() - offsetMin * 60000).toISOString();
}

function formatTime(iso) {
  if (!iso) return '';
  const p = toZonedParts(iso);
  if (!p) return '';
  const h = parseInt(p.hour, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${p.minute} ${ampm}`;
}

export default function JobAssignmentPanel({ job, onUpdated }) {
  const { role } = useCurrentRole();
  const canOverride = canOverrideConflict(role);

  const [techs, setTechs] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [appointment, setAppointment] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [activeAppointmentId, setActiveAppointmentId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnostics, setDiagnostics] = useState(null);

  const [form, setForm] = useState({
    lead_technician_email: '',
    apprentice_email: '',
    assigned_truck_id: '',
    appointment_date: '',
    arrival_window_start: '',
    arrival_window_end: '',
  });

  const [truckData, setTruckData] = useState({
    assigned_truck_id: '',
    auto_assigned_truck: '',
    truck_assignment_source: 'none',
    truck_assignment_status: 'Not Required',
    truck_override_used: false,
    truck_override_reason: '',
    truck_override_by: '',
    truck_override_at: '',
  });

  const loadTechs = useCallback(async () => {
    try {
      const recs = await base44.entities.EmployeeRegistry.list('-created_date', 200);
      const filtered = recs
        .filter(e => e.employment_status !== 'Terminated' && e.employment_status !== 'Inactive')
        .map(e => ({
          id: e.id,
          name: `${e.preferred_name || e.first_name || ''} ${e.last_name || ''}`.trim(),
          email: e.email || e.login_email || '',
          status: e.employment_status || 'Active',
          truck_number: e.assigned_truck || '',
        }))
        .filter(e => e.email);
      setTechs(filtered);
    } catch { setTechs([]); }
  }, []);

  const loadTrucks = useCallback(async () => {
    try {
      const recs = await base44.entities.TruckProfile.list('-created_date', 100);
      setTrucks(recs.filter(t => t.status === 'Active' || t.status === 'Shared Pool'));
    } catch { setTrucks([]); }
  }, []);

  const loadAppointment = useCallback(async () => {
    if (!job?.id) return;
    try {
      // ServiceTitan-imported appointments may carry the ST job id in job_id
      // rather than the local Job entity id, so look up by both keys.
      let apts = [];
      if (job.servicetitan_job_id) {
        const bySt = await base44.entities.Appointment.filter({ servicetitan_job_id: job.servicetitan_job_id }, 'scheduled_start', 50);
        apts = bySt;
      }
      const byLocal = await base44.entities.Appointment.filter({ job_id: job.id }, 'scheduled_start', 50);
      const seenIds = new Set(apts.map(a => a.id));
      for (const a of byLocal) if (!seenIds.has(a.id)) { apts.push(a); seenIds.add(a.id); }
      // Deduplicate by servicetitan_appointment_id (keep most recently synced)
      const stSeen = new Set();
      const deduped = [];
      for (const a of [...apts].sort((x, y) => new Date(y.servicetitan_last_synced_at || 0) - new Date(x.servicetitan_last_synced_at || 0))) {
        const key = a.servicetitan_appointment_id || `id:${a.id}`;
        if (stSeen.has(key)) continue;
        stSeen.add(key);
        deduped.push(a);
      }
      setAppointments(deduped);
      const active = deduped.find(a => a.status !== 'cancelled' && a.status !== 'canceled') || deduped[0] || null;
      setAppointment(active);
      setActiveAppointmentId(active?.id || null);
      if (active) {
        // Fall back to the job's arrival window when the appointment has no scheduled times.
        const aptStart = active.scheduled_start || job.arrival_window_start || '';
        const aptEnd = active.scheduled_end || job.arrival_window_end || '';
        const aptDate = active.scheduled_start || job.appointment_date || job.service_date || '';
        setForm({
          lead_technician_email: active.technician_email || '',
          apprentice_email: active.apprentice_email || '',
          assigned_truck_id: '',
          appointment_date: toDateInput(aptDate),
          arrival_window_start: toTimeInput(aptStart),
          arrival_window_end: toTimeInput(aptEnd),
        });
        const truckStatus = active.truck_assignment_status || job.truck_assignment_status || 'Not Required';
        let truckId = '';
        if (active.assigned_vehicle) {
          const truck = trucks.find(t => t.truck_number === active.assigned_vehicle || t.truck_id === active.assigned_vehicle);
          truckId = truck?.id || '';
        }
        if (!truckId && job.assigned_truck_id) {
          truckId = job.assigned_truck_id;
        }
        setForm(prev => ({ ...prev, assigned_truck_id: truckId }));
        setTruckData({
          assigned_truck_id: truckId,
          auto_assigned_truck: active.auto_assigned_truck || job.auto_assigned_truck || '',
          truck_assignment_source: active.truck_assignment_source || job.truck_assignment_source || 'none',
          truck_assignment_status: truckStatus,
          truck_override_used: active.truck_override_used || job.truck_override_used || false,
          truck_override_reason: active.truck_override_reason || job.truck_override_reason || '',
          truck_override_by: active.truck_override_by || job.truck_override_by || '',
          truck_override_at: active.truck_override_at || job.truck_override_at || '',
        });
      } else {
        setForm({
          lead_technician_email: job.lead_technician_email || job.technician_email || '',
          apprentice_email: job.apprentice_email || '',
          assigned_truck_id: job.assigned_truck_id || '',
          appointment_date: toDateInput(job.appointment_date || job.service_date),
          arrival_window_start: toTimeInput(job.arrival_window_start),
          arrival_window_end: toTimeInput(job.arrival_window_end),
        });
        setTruckData({
          assigned_truck_id: job.assigned_truck_id || '',
          auto_assigned_truck: job.auto_assigned_truck || '',
          truck_assignment_source: job.truck_assignment_source || 'none',
          truck_assignment_status: job.truck_assignment_status || 'Not Required',
          truck_override_used: job.truck_override_used || false,
          truck_override_reason: job.truck_override_reason || '',
          truck_override_by: job.truck_override_by || '',
          truck_override_at: job.truck_override_at || '',
        });
      }
    } catch {
      setAppointment(null);
      setAppointments([]);
    }
  }, [job, trucks]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setLoading(true);
      await Promise.all([loadTechs(), loadTrucks()]);
      if (!cancelled) setLoading(false);
    };
    init();
    return () => { cancelled = true; };
  }, [loadTechs, loadTrucks]);

  useEffect(() => {
    if (techs.length > 0 && job) {
      loadAppointment();
    }
  }, [job, techs, loadAppointment]);

  const updateField = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const selectAppointment = (aptId) => {
    const apt = appointments.find(a => a.id === aptId);
    if (!apt) return;
    setAppointment(apt);
    setActiveAppointmentId(aptId);
    const aptStart = apt.scheduled_start || job.arrival_window_start || '';
    const aptEnd = apt.scheduled_end || job.arrival_window_end || '';
    const aptDate = apt.scheduled_start || job.appointment_date || job.service_date || '';
    setForm(prev => ({
      ...prev,
      lead_technician_email: apt.technician_email || '',
      apprentice_email: apt.apprentice_email || '',
      appointment_date: toDateInput(aptDate),
      arrival_window_start: toTimeInput(aptStart),
      arrival_window_end: toTimeInput(aptEnd),
    }));
  };

  /**
   * Validate assignment for time-window conflicts.
   * Returns { warnings, hasConflict, diagnostics }
   * A conflict exists ONLY when time windows overlap — same-day without overlap is fine.
   */
  const validate = async () => {
    setValidating(true);
    const warns = [];
    const diag = {
      new_start: '',
      new_end: '',
      existing_appts: [],
      tech_overlap: false,
      truck_overlap: false,
      conflict_status: 'no_conflict',
      override_permission: canOverride,
      override_submitted: false,
      save_attempted: false,
    };

    const { scheduled_start, scheduled_end } = buildScheduledTimes();
    diag.new_start = scheduled_start;
    diag.new_end = scheduled_end;

    if (!form.appointment_date) {
      warns.push('Appointment date is missing.');
      diag.conflict_status = 'missing_date';
    }

    const leadTech = techs.find(t => t.email === form.lead_technician_email);
    if (form.lead_technician_email && leadTech && leadTech.status !== 'Active') {
      warns.push(`Lead technician ${leadTech.name} is ${leadTech.status}.`);
    }

    // Check for time-window conflicts
    if (form.appointment_date && scheduled_start && scheduled_end && (form.lead_technician_email || form.apprentice_email)) {
      try {
        const apts = await base44.entities.Appointment.filter({}, 'scheduled_start', 200);
        // Filter to same-day, non-cancelled, excluding current appointment
        const sameDay = apts.filter(a => {
          if (a.status === 'cancelled') return false;
          if (appointment && a.id === appointment.id) return false;
          if (!a.scheduled_start || !a.scheduled_end) return false;
          const aptDate = toDateInput(a.scheduled_start);
          return aptDate === form.appointment_date;
        });

        // Check technician conflicts using TIME OVERLAP
        const checkEmails = [
          { email: form.lead_technician_email, role: 'Lead Technician' },
          { email: form.apprentice_email, role: 'Apprentice' },
        ].filter(e => e.email);

        for (const { email, role: techRole } of checkEmails) {
          const conflict = sameDay.find(a =>
            (a.technician_email === email ||
             a.apprentice_email === email ||
             (a.crew_assignment && a.crew_assignment.includes(email))) &&
            timeWindowsOverlap(scheduled_start, scheduled_end, a.scheduled_start, a.scheduled_end)
          );
          if (conflict) {
            const techName = techs.find(t => t.email === email)?.name || email;
            const exStart = formatTime(conflict.scheduled_start);
            const exEnd = formatTime(conflict.scheduled_end);
            warns.push(`${techRole} Conflict: ${techName} is already assigned to ${conflict.customer_name || 'another job'} from ${exStart} – ${exEnd}.`);
            if (techRole === 'Lead Technician') diag.tech_overlap = true;
          }
        }

        // Check truck conflict using TIME OVERLAP
        const selectedTruck = trucks.find(t => t.id === truckData.assigned_truck_id);
        if (selectedTruck) {
          const truckConflict = sameDay.find(a =>
            a.assigned_vehicle === selectedTruck.truck_number &&
            timeWindowsOverlap(scheduled_start, scheduled_end, a.scheduled_start, a.scheduled_end)
          );
          if (truckConflict) {
            const exStart = formatTime(truckConflict.scheduled_start);
            const exEnd = formatTime(truckConflict.scheduled_end);
            warns.push(`Truck Conflict: Truck ${selectedTruck.truck_number} is assigned to ${truckConflict.customer_name || 'another job'} from ${exStart} – ${exEnd}.`);
            diag.truck_overlap = true;
          }
        }

        // Build diagnostics for existing appointments
        diag.existing_appts = sameDay.map(a => ({
          id: a.id,
          customer: a.customer_name,
          start: a.scheduled_start,
          end: a.scheduled_end,
          tech: a.technician_email,
          truck: a.assigned_vehicle,
        }));

        if (warns.some(w => w.includes('Conflict'))) {
          diag.conflict_status = 'time_overlap';
        }
      } catch {
        // Non-blocking if validation query fails
      }
    }

    setWarnings(warns);
    setDiagnostics(diag);
    setValidating(false);
    return { warnings: warns, hasConflict: diag.tech_overlap || diag.truck_overlap, diagnostics: diag };
  };

  const buildScheduledTimes = () => {
    const date = form.appointment_date || toDateInput(job.service_date) || toDateInput(new Date().toISOString());
    const start = form.arrival_window_start || '08:00';
    const end = form.arrival_window_end || '12:00';
    return {
      scheduled_start: wallClockToUtcISO(date, start),
      scheduled_end: wallClockToUtcISO(date, end),
    };
  };

  const buildCrewAssignment = () => {
    const crew = [];
    if (form.lead_technician_email) {
      const t = techs.find(t => t.email === form.lead_technician_email);
      crew.push({ email: form.lead_technician_email, name: t?.name || '', role: 'lead' });
    }
    if (form.apprentice_email) {
      const t = techs.find(t => t.email === form.apprentice_email);
      crew.push({ email: form.apprentice_email, name: t?.name || '', role: 'apprentice' });
    }
    return JSON.stringify(crew);
  };

  const syncJobFromForm = async (jobUpdates) => {
    await base44.entities.Job.update(job.id, {
      ...jobUpdates,
      dispatch_status: 'assigned',
      status: job.status === 'scheduled' || job.status === 'unassigned' ? 'assigned' : job.status,
    });
  };

  /**
   * Save the assignment. If overrideData is provided, marks conflict_override_used = true.
   * If conflicts exist and no override is provided, blocks save for non-override users.
   */
  const performSave = async (overrideData = null) => {
    setSaving(true);
    if (diagnostics) {
      diagnostics.save_attempted = true;
      if (overrideData) diagnostics.override_submitted = true;
    }
    try {
      const leadTech = techs.find(t => t.email === form.lead_technician_email);
      const apprenticeTech = techs.find(t => t.email === form.apprentice_email);
      const selectedTruck = trucks.find(t => t.id === truckData.assigned_truck_id);
      const { scheduled_start, scheduled_end } = buildScheduledTimes();
      const crew = buildCrewAssignment();

      const assignmentData = {
        job_id: job.id,
        customer_id: job.customer_id || '',
        customer_name: job.customer_name || '',
        technician_email: form.lead_technician_email || '',
        technician_name: leadTech?.name || '',
        technician_id: leadTech?.id || '',
        apprentice_email: form.apprentice_email || '',
        apprentice_name: apprenticeTech?.name || '',
        assigned_vehicle: selectedTruck?.truck_number || truckData.auto_assigned_truck || '',
        crew_assignment: crew,
        scheduled_start,
        scheduled_end,
        status: 'assigned',
        dispatch_status: 'assigned',
        appointment_source: 'manual',
        address: job.address || '',
        city: job.city || '',
        state: job.state || '',
        zip: job.zip || '',
        day_number: 1,
        is_final_appointment: true,
        auto_assigned_truck: truckData.auto_assigned_truck || '',
        truck_assignment_source: truckData.truck_assignment_source || 'none',
        truck_assignment_status: truckData.truck_assignment_status || 'Not Required',
        truck_override_used: truckData.truck_override_used || false,
        truck_override_reason: truckData.truck_override_reason || '',
        truck_override_by: truckData.truck_override_by || '',
        truck_override_at: truckData.truck_override_at || '',
        conflict_override_used: !!overrideData,
        conflict_override_reason: overrideData?.reason || '',
        conflict_override_by: overrideData?.name || '',
        conflict_override_at: overrideData?.timestamp || '',
        conflict_warning_details: overrideData ? JSON.stringify(warnings) : '',
      };

      if (appointment) {
        await base44.entities.Appointment.update(appointment.id, assignmentData);
      } else {
        await base44.entities.Appointment.create(assignmentData);
      }

      const jobUpdates = {
        lead_technician_email: form.lead_technician_email || '',
        lead_technician_name: leadTech?.name || '',
        apprentice_email: form.apprentice_email || '',
        apprentice_name: apprenticeTech?.name || '',
        assigned_truck_id: truckData.assigned_truck_id || '',
        assigned_truck_number: selectedTruck?.truck_number || truckData.auto_assigned_truck || '',
        auto_assigned_truck: truckData.auto_assigned_truck || '',
        truck_assignment_source: truckData.truck_assignment_source || 'none',
        truck_assignment_status: truckData.truck_assignment_status || 'Not Required',
        truck_override_used: truckData.truck_override_used || false,
        truck_override_reason: truckData.truck_override_reason || '',
        truck_override_by: truckData.truck_override_by || '',
        truck_override_at: truckData.truck_override_at || '',
        appointment_date: form.appointment_date || '',
        arrival_window_start: form.arrival_window_start || '',
        arrival_window_end: form.arrival_window_end || '',
        technician_email: form.lead_technician_email || '',
        technician_name: [leadTech?.name, apprenticeTech?.name].filter(Boolean).join(', '),
        technician_emails: [form.lead_technician_email, form.apprentice_email].filter(Boolean),
        service_date: form.appointment_date || job.service_date,
      };
      await syncJobFromForm(jobUpdates);

      toast.success(appointment ? 'Assignment updated' : 'Appointment created and assignment saved');
      setWarnings([]);
      await loadAppointment();
      onUpdated?.();
    } catch (e) {
      toast.error('Failed to save assignment: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const { warnings: warns, hasConflict } = await validate();
    if (warns.length === 0) {
      await performSave(null);
      return;
    }
    // Non-conflict warnings (e.g. inactive tech) — still save
    if (!hasConflict) {
      toast.info(`${warns.length} non-blocking warning(s) — saving anyway.`);
      await performSave(null);
      return;
    }
    // True time-overlap conflict
    if (canOverride) {
      toast.warning(`${warns.length} conflict(s) detected — override required to save.`);
      setOverrideOpen(true);
    } else {
      toast.error('Time overlap conflict detected. Manager or dispatcher override required.');
    }
  };

  const handleOverrideConfirm = async (overrideData) => {
    setOverrideOpen(false);
    await performSave(overrideData);
  };

  const handleClear = async () => {
    if (!confirm('Clear all assignment data? This will remove the technician, apprentice, and truck from this job.')) return;
    setSaving(true);
    try {
      if (appointment) {
        await base44.entities.Appointment.update(appointment.id, {
          technician_email: '',
          technician_name: '',
          technician_id: '',
          apprentice_email: '',
          apprentice_name: '',
          assigned_vehicle: '',
          crew_assignment: '[]',
          status: 'scheduled',
          dispatch_status: 'unassigned',
          auto_assigned_truck: '',
          truck_assignment_source: 'none',
          truck_assignment_status: 'Not Required',
          truck_override_used: false,
          truck_override_reason: '',
          truck_override_by: '',
          truck_override_at: '',
          conflict_override_used: false,
          conflict_override_reason: '',
          conflict_override_by: '',
          conflict_override_at: '',
          conflict_warning_details: '',
        });
      }
      await base44.entities.Job.update(job.id, {
        lead_technician_email: '',
        lead_technician_name: '',
        apprentice_email: '',
        apprentice_name: '',
        assigned_truck_id: '',
        assigned_truck_number: '',
        auto_assigned_truck: '',
        truck_assignment_source: 'none',
        truck_assignment_status: 'Not Required',
        truck_override_used: false,
        truck_override_reason: '',
        truck_override_by: '',
        truck_override_at: '',
        arrival_window_start: '',
        arrival_window_end: '',
        technician_email: '',
        technician_name: '',
        technician_emails: [],
        dispatch_status: 'unassigned',
        status: 'scheduled',
      });
      setForm({
        lead_technician_email: '',
        apprentice_email: '',
        assigned_truck_id: '',
        appointment_date: job.service_date || '',
        arrival_window_start: '',
        arrival_window_end: '',
      });
      setTruckData({
        assigned_truck_id: '',
        auto_assigned_truck: '',
        truck_assignment_source: 'none',
        truck_assignment_status: 'Not Required',
        truck_override_used: false,
        truck_override_reason: '',
        truck_override_by: '',
        truck_override_at: '',
      });
      toast.success('Assignment cleared');
      await loadAppointment();
      onUpdated?.();
    } catch (e) {
      toast.error('Failed to clear assignment: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReassign = () => {
    setForm({
      lead_technician_email: '',
      apprentice_email: '',
      assigned_truck_id: '',
      appointment_date: form.appointment_date,
      arrival_window_start: form.arrival_window_start,
      arrival_window_end: form.arrival_window_end,
    });
    setTruckData({
      assigned_truck_id: '',
      auto_assigned_truck: '',
      truck_assignment_source: 'none',
      truck_assignment_status: 'Not Required',
      truck_override_used: false,
      truck_override_reason: '',
      truck_override_by: '',
      truck_override_at: '',
    });
    setWarnings([]);
    setDiagnostics(null);
    toast.info('Technicians cleared — select new assignments and save.');
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const dispatchStatus = job.dispatch_status || (appointment?.dispatch_status) || 'unassigned';
  const hasConflictWarnings = warnings.some(w => w.includes('Conflict'));

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> Assignment
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1"
                onClick={() => setShowDiagnostics(!showDiagnostics)}
              >
                <Stethoscope className="w-3.5 h-3.5" />
                {showDiagnostics ? 'Hide' : 'Show'} Diagnostics
              </Button>
              <Badge className={DISPATCH_COLORS[dispatchStatus] || DISPATCH_COLORS.unassigned}>
                {dispatch_status_label(dispatchStatus)}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {appointment && (
            <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700 flex items-center gap-2 flex-wrap">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Linked to appointment created {appointment.created_date ? formatDateET(appointment.created_date) : ''}</span>
              {appointment.servicetitan_appointment_id && (
                <span className="font-mono text-blue-800">· ServiceTitan Appointment ID: {appointment.servicetitan_appointment_id}</span>
              )}
            </div>
          )}

          {appointments.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Linked Appointments ({appointments.length})</Label>
              <Select value={activeAppointmentId || ''} onValueChange={selectAppointment}>
                <SelectTrigger><SelectValue placeholder="Select appointment" /></SelectTrigger>
                <SelectContent>
                  {appointments.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.servicetitan_appointment_id ? `ST Appt ${a.servicetitan_appointment_id}` : `Appt ${a.id.slice(-6)}`}
                      {(a.status === 'cancelled' || a.status === 'canceled') ? ' (cancelled)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {appointment && (appointment.technician_mapping_status || appointment.servicetitan_technician_id || appointment.servicetitan_technician_name) && (
            <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs space-y-0.5">
              <p className="font-semibold text-slate-700 mb-0.5">Imported Technician</p>
              <div className="flex gap-2"><span className="text-slate-500 w-32 shrink-0">ST Technician ID:</span><span className="font-mono text-slate-700">{appointment.servicetitan_technician_id || '—'}</span></div>
              <div className="flex gap-2"><span className="text-slate-500 w-32 shrink-0">Imported name:</span><span className="text-slate-700">{appointment.servicetitan_technician_name || appointment.technician_name || '—'}</span></div>
              <div className="flex gap-2"><span className="text-slate-500 w-32 shrink-0">Mapping status:</span><span className="text-slate-700">{appointment.technician_mapping_status || '—'}</span></div>
              {appointment.technician_mapping_warning && (
                <div className="flex gap-2 pt-1"><span className="text-slate-500 w-32 shrink-0">Warning:</span><span className="text-amber-700">{appointment.technician_mapping_warning}</span></div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Lead Technician */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Lead Technician</Label>
              <Select value={form.lead_technician_email} onValueChange={v => updateField('lead_technician_email', v)}>
                <SelectTrigger><SelectValue placeholder="Select lead technician" /></SelectTrigger>
                <SelectContent>
                  {techs.map(t => (
                    <SelectItem key={t.id} value={t.email}>
                      {t.name} {t.status !== 'Active' ? `(${t.status})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Apprentice */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Apprentice / Helper</Label>
              <Select value={form.apprentice_email} onValueChange={v => updateField('apprentice_email', v)}>
                <SelectTrigger><SelectValue placeholder="Select apprentice (optional)" /></SelectTrigger>
                <SelectContent>
                  {techs.map(t => (
                    <SelectItem key={t.id} value={t.email}>
                      {t.name} {t.status !== 'Active' ? `(${t.status})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Truck — auto-populated from lead technician */}
            <TruckAssignmentField
              trucks={trucks}
              leadTechnicianEmail={form.lead_technician_email}
              truckData={truckData}
              onTruckChange={setTruckData}
            />

            {/* Appointment Date */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Appointment Date</Label>
              <Input type="date" value={form.appointment_date} onChange={e => updateField('appointment_date', e.target.value)} />
            </div>

            {/* Arrival Window */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Arrival Window Start</Label>
              <Input type="time" value={form.arrival_window_start} onChange={e => updateField('arrival_window_start', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Arrival Window End</Label>
              <Input type="time" value={form.arrival_window_end} onChange={e => updateField('arrival_window_end', e.target.value)} />
            </div>
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 space-y-1">
              {warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
              {hasConflictWarnings && !canOverride && (
                <p className="text-xs text-red-700 font-medium pt-1">Manager or dispatcher override required.</p>
              )}
            </div>
          )}

          {/* Diagnostics */}
          {showDiagnostics && (
            <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs space-y-1 font-mono">
              <p className="font-semibold text-slate-700 mb-1">Diagnostics</p>
              {diagnostics ? (
                <>
                  <DiagRow label="New start" value={diagnostics.new_start ? `${diagnostics.new_start} (${formatTime(diagnostics.new_start)})` : '—'} />
                  <DiagRow label="New end" value={diagnostics.new_end ? `${diagnostics.new_end} (${formatTime(diagnostics.new_end)})` : '—'} />
                  <DiagRow label="Existing appts (same day)" value={diagnostics.existing_appts?.length || 0} />
                  {diagnostics.existing_appts?.map((a, i) => (
                    <DiagRow key={i} label={`  Appt ${i+1}`} value={`${a.customer || '—'}: ${formatTime(a.start)} – ${formatTime(a.end)} (tech: ${a.tech || '—'}, truck: ${a.truck || '—'})`} />
                  ))}
                  <DiagRow label="Tech overlap" value={String(diagnostics.tech_overlap)} />
                  <DiagRow label="Truck overlap" value={String(diagnostics.truck_overlap)} />
                  <DiagRow label="Conflict status" value={diagnostics.conflict_status} />
                  <DiagRow label="Override permission" value={String(diagnostics.override_permission)} />
                  <DiagRow label="Override submitted" value={String(diagnostics.override_submitted)} />
                  <DiagRow label="Save attempted" value={String(diagnostics.save_attempted)} />
                </>
              ) : (
                <p className="text-slate-500">No validation run yet — click Save to run conflict check.</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={handleSave} disabled={saving || validating} className="gap-1.5">
              {saving || validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {appointment ? 'Save Assignment' : 'Save & Create Appointment'}
            </Button>
            {appointment && (
              <Button variant="outline" onClick={handleReassign} disabled={saving} className="gap-1.5">
                <UserPlus className="w-4 h-4" /> Reassign Technician
              </Button>
            )}
            <Button variant="outline" onClick={handleClear} disabled={saving} className="gap-1.5 text-destructive hover:text-destructive">
              <Trash2 className="w-4 h-4" /> Clear Assignment
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConflictOverrideDialog
        open={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        onConfirm={handleOverrideConfirm}
        warnings={warnings.filter(w => w.includes('Conflict'))}
        saving={saving}
      />
    </div>
  );
}

function DiagRow({ label, value }) {
  return (
    <div className="flex gap-2">
      <span className="text-slate-500 w-40 shrink-0">{label}:</span>
      <span className="text-slate-700">{value}</span>
    </div>
  );
}

function dispatch_status_label(status) {
  return status ? status.replace(/_/g, ' ') : 'unassigned';
}