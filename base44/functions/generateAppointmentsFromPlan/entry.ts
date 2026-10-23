import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { job_id, estimate_id } = body;

    if (!job_id && !estimate_id) {
      return Response.json({ error: 'job_id or estimate_id is required' }, { status: 400 });
    }

    // Resolve the job and estimate
    let job = null;
    let estimate = null;

    if (job_id) {
      job = await base44.asServiceRole.entities.Job.get(job_id);
    }

    // Find the estimate
    if (estimate_id) {
      estimate = await base44.asServiceRole.entities.Estimate.get(estimate_id);
      if (!job && estimate?.job_id) {
        job = await base44.asServiceRole.entities.Job.get(estimate.job_id);
      }
    } else if (job_id) {
      const estimates = await base44.asServiceRole.entities.Estimate.filter({ job_id });
      estimate = estimates[0] || null;
    }

    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }
    if (!estimate) {
      return Response.json({ error: 'No estimate found for this job' }, { status: 404 });
    }

    // Parse the scope of work plan
    let days = [];
    try {
      days = typeof estimate.scope_of_work_plan === 'string'
        ? JSON.parse(estimate.scope_of_work_plan)
        : (estimate.scope_of_work_plan || []);
    } catch {
      return Response.json({ error: 'Invalid scope_of_work_plan JSON on estimate' }, { status: 400 });
    }

    if (!Array.isArray(days) || days.length === 0) {
      return Response.json({ error: 'No daily work plans found in scope_of_work_plan' }, { status: 400 });
    }

    const totalJobDays = days.length;

    // Check for existing execution-plan appointments to avoid duplicates
    const existingAppts = await base44.asServiceRole.entities.Appointment.filter({ job_id: job.id });
    const alreadyGenerated = existingAppts.some(a => a.appointment_source === 'execution_plan');

    if (alreadyGenerated) {
      const existingPlanAppts = existingAppts
        .filter(a => a.appointment_source === 'execution_plan')
        .sort((a, b) => (a.day_number || 0) - (b.day_number || 0));
      return Response.json({
        status: 'already_exists',
        message: `Appointments already generated for this job (${existingPlanAppts.length} days)`,
        appointments: existingPlanAppts,
      });
    }

    // Parse equipment and fleet from estimate for day-level filtering
    let equipment = [];
    try { equipment = typeof estimate.required_special_equipment === 'string' ? JSON.parse(estimate.required_special_equipment) : (estimate.required_special_equipment || []); } catch { }
    let fleet = [];
    try { fleet = typeof estimate.fleet_resource_requests === 'string' ? JSON.parse(estimate.fleet_resource_requests) : (estimate.fleet_resource_requests || []); } catch { }

    // Determine start date — use the job's service_date, or tomorrow
    const startDate = job.service_date ? new Date(job.service_date + 'T08:00:00') : new Date(new Date().getTime() + 24 * 60 * 60 * 1000);
    startDate.setHours(8, 0, 0, 0);

    const createdAppointments = [];

    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const dayNumber = day.day_number || (i + 1);
      const isFinal = i === days.length - 1;

      // Calculate date for this appointment (skip weekends for scheduling)
      const apptDate = new Date(startDate);
      let businessDaysAdded = 0;
      let offset = 0;
      while (businessDaysAdded < i) {
        offset++;
        const testDate = new Date(startDate);
        testDate.setDate(startDate.getDate() + offset);
        const dayOfWeek = testDate.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          businessDaysAdded++;
        }
      }
      apptDate.setDate(startDate.getDate() + offset);
      apptDate.setHours(8, 0, 0, 0);

      const endTime = new Date(apptDate);
      const hours = day.estimated_hours || 8;
      endTime.setHours(apptDate.getHours() + hours);

      const dayEquipment = equipment.filter(e => !e.required_days?.length || e.required_days.includes(dayNumber));
      const dayFleet = fleet.filter(r => !r.required_days?.length || r.required_days.includes(dayNumber));

      const appt = await base44.asServiceRole.entities.Appointment.create({
        job_id: job.id,
        customer_id: job.customer_id || '',
        customer_name: job.customer_name || '',
        crm_job_number: job.crm_job_number || '',
        scheduled_start: apptDate.toISOString(),
        scheduled_end: endTime.toISOString(),
        technician_email: job.technician_email || '',
        technician_name: job.technician_name || '',
        status: 'scheduled',
        appointment_type: isFinal ? 'final_day' : 'work_day',
        address: job.address || '',
        city: job.city || '',
        state: job.state || '',
        zip: job.zip || '',
        day_number: dayNumber,
        total_job_days: totalJobDays,
        appointment_source: 'execution_plan',
        expected_daily_scope: day.daily_scope || '',
        expected_hours: hours,
        daily_production_goal: day.production_goal || '',
        expected_equipment: JSON.stringify(dayEquipment),
        expected_materials: JSON.stringify(dayFleet),
        assigned_vehicle: job.technician_email ? '' : '',
        is_final_appointment: isFinal,
        planned_hours: hours,
      });

      createdAppointments.push(appt);
    }

    // Update job status to in_progress if currently scheduled
    if (job.status === 'scheduled') {
      await base44.asServiceRole.entities.Job.update(job.id, { status: 'in_progress' });
    }

    // Log activity
    await base44.asServiceRole.entities.JobActivityLog.create({
      job_id: job.id,
      job_number: job.crm_job_number || '',
      customer_name: job.customer_name || '',
      technician_email: user.email || '',
      event_type: 'activity_completed',
      event_label: `Daily appointments generated from Execution Plan (${totalJobDays} days)`,
      event_details: JSON.stringify({ total_days: totalJobDays, appointment_ids: createdAppointments.map(a => a.id) }),
      performed_by: user.full_name || user.email || 'System',
      timestamp: new Date().toISOString(),
      hub_status: 'scheduled',
    });

    return Response.json({
      status: 'success',
      message: `Created ${createdAppointments.length} daily appointments from execution plan`,
      appointments: createdAppointments,
      total_days: totalJobDays,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});