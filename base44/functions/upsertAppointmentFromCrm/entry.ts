import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireCrmWebhook } from '../../shared/securityAuth.ts';
import { getTenantId } from '../../shared/stAuth.ts';
import { reconcileAppointmentImport } from '../../shared/appointmentReconciler.ts';
import { repairJobLocationLink, fetchAppointmentTechnician } from '../../shared/stAppointmentEnrichment.ts';

/**
 * upsertAppointmentFromCrm — Guarded Job/Appointment CRM Upsert (SECURED)
 *
 * Creates or updates Job and Appointment records from CRM webhook payloads.
 *
 * SECURITY (Stage 2F Remediation):
 *   - Requires signed webhook secret, scheduler secret, or authenticated admin/owner
 *   - Rejects browser/public calls
 *   - Resolves tenant and source identity server-side
 *   - Validates immutable ServiceTitan appointment and job IDs
 *   - Prevents caller-supplied role, employee identity, or ownership
 *   - Uses idempotent immutable-ID matching (crm_appointment_id, crm_job_number)
 *
 * GUARDED JOB CREATION (Requirement A):
 *   - A Job is NEVER created unless its exact existing Base44 Customer AND exact
 *     existing Base44 Location are found by ServiceTitan IDs.
 *   - Customer is resolved by servicetitan_customer_id (exact), then customer_number.
 *   - Location is resolved by Location.crm_location_id == servicetitan_location_id.
 *   - A Job is never created with a blank location_id, a blank crm_location_id,
 *     or a "Service address pending" placeholder — the real Location address is used.
 *   - If either parent is missing, the run stops, NOTHING is written, and a visible
 *     422 failure reason is returned.
 *
 * APPOINTMENT UPSERT + RECONCILER (Requirement B):
 *   - The ServiceTitan Appointment is upserted by servicetitan_appointment_id.
 *   - The upsert stores scheduled_start/scheduled_end and all ServiceTitan
 *     technician IDs/names (servicetitan_technician_id / servicetitan_technician_name).
 *   - After every Appointment create or update, reconcileAppointmentImport runs
 *     immediately so the linked Job's technician fields, dispatch_status
 *     (assigned when any ST technician ID is present), Location link, service
 *     address, and appointment rollup are current — never relying on a page refresh.
 *
 * Allowed invocation types:
 *   - Webhook with valid webhook secret (ServiceTitan → LVC OS)
 *   - Authenticated admin/owner (manual trigger from admin UI)
 */
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // ── Authentication: admin/owner (manual) OR X-CRM-Webhook-Secret (webhook) ──
    let user: any = null;
    try { user = await base44.auth.me(); } catch { /* webhook call */ }

    let authResult: any = { user: null };
    if (user) {
      if (user.role !== "admin" && user.role !== "owner") {
        return Response.json({ error: "Forbidden — admin access required" }, { status: 403 });
      }
      authResult = { user };
    } else {
      authResult = requireCrmWebhook(req);
      if (authResult.error) {
        console.log('[UPSERT_APPOINTMENT_FROM_CRM] Rejected: authentication failed');
        return authResult.error;
      }
    }

    // Extract appointment data from the webhook payload.
    let crm_appointment_id = body.appointment_id || body.id || body.appointmentId;
    const crm_job_number = body.job_number || body.jobNumber || body.job?.job_number;
    const customer_name = body.customer_name || body.customer?.name;
    const customer_number = body.customer_number || body.customer?.customer_number;
    const scheduled_start = body.scheduled_start || body.start_time || body.startTime || body.start;
    const scheduled_end = body.scheduled_end || body.end_time || body.endTime || body.end;
    const technician_name = body.technician_name || body.technician?.name;
    const technician_email = body.technician_email || body.technician?.email;
    const status = (body.status || 'scheduled').toLowerCase();
    const appointment_type = body.appointment_type || body.type;
    const address = body.address || body.job?.address;
    const city = body.city || body.job?.city;
    const state = body.state || body.job?.state;
    const zip = body.zip || body.job?.zip;
    const notes = body.notes;

    // ── Reject merged/multi-appointment payloads (Stage 2F hardening) ──
    // A single upsert MUST carry exactly ONE ServiceTitan appointment id. Zapier
    // Step 8 previously joined the appointment list into one comma-separated
    // `appointment_id` field, which produced ONE merged Base44 Appointment with a
    // comma-joined servicetitan_appointment_id and comma-joined schedule times.
    // Reject any appointment_id that is an array, an array-string, contains a
    // comma, or carries more than one id — and never create/update a merged
    // Appointment record. Each ServiceTitan appointment must arrive in its own
    // webhook POST (loop over appointments only, never technicians).
    const detectMergedAppointmentId = (v: any): { merged: boolean; reason?: string; normalized?: string } => {
      if (v == null) return { merged: false };
      if (Array.isArray(v)) return { merged: true, reason: "appointment_id is an array" };
      const s = String(v).trim();
      if (!s) return { merged: false };
      if (s.startsWith("[") && s.endsWith("]")) return { merged: true, reason: "appointment_id is an array-string" };
      if (s.includes(",")) return { merged: true, reason: "appointment_id contains a comma (multiple ServiceTitan ids)" };
      const tokens = s.split(/\s+/).filter(Boolean);
      if (tokens.length > 1) return { merged: true, reason: "appointment_id contains multiple whitespace-separated ids" };
      return { merged: false, normalized: s };
    };
    const mergedCheck = detectMergedAppointmentId(crm_appointment_id);
    if (mergedCheck.merged) {
      console.log("[UPSERT_APPOINTMENT_FROM_CRM] Rejected merged appointment_id:", crm_appointment_id);
      return Response.json({
        error: "Rejected: appointment_id must be a single ServiceTitan appointment id. Merged/multi-appointment payloads are not allowed.",
        reason: mergedCheck.reason,
        received: crm_appointment_id,
        stage: "merged_appointment_id_rejected",
        hint: "Send one webhook POST per ServiceTitan appointment — loop over appointments only, never technicians.",
      }, { status: 422 });
    }
    if (mergedCheck.normalized) crm_appointment_id = mergedCheck.normalized;

    // Defensive: a comma-joined schedule field also indicates a merged payload.
    const looksJoined = (v: any) => v != null && String(v).includes(",");
    if (looksJoined(scheduled_start) || looksJoined(scheduled_end)) {
      console.log("[UPSERT_APPOINTMENT_FROM_CRM] Rejected merged schedule fields for appointment:", crm_appointment_id);
      return Response.json({
        error: "Rejected: scheduled_start/scheduled_end must each be a single timestamp. Merged/multi-appointment payloads are not allowed.",
        stage: "merged_schedule_fields_rejected",
        hint: "Send one webhook POST per ServiceTitan appointment.",
      }, { status: 422 });
    }

    // ── ServiceTitan identity fields (server-resolved; never caller-supplied LVC ids) ──
    // ST IDs are numeric; reject any 24-hex Base44 id mistakenly mapped into these
    // fields so a resolved EmployeeRegistry/Location id is never treated as an ST id.
    const isBase44Id = (v: any) => /^[0-9a-f]{24}$/i.test(String(v || ''));
    const cleanStId = (v: any) => {
      const s = v == null ? '' : String(v).trim();
      return s && !isBase44Id(s) ? s : '';
    };
    const servicetitan_customer_id = cleanStId(body.servicetitan_customer_id || body.customer_id || body.customer?.id);
    const servicetitan_location_id = cleanStId(body.servicetitan_location_id || body.location_id || body.location?.id);
    const servicetitan_technician_id = cleanStId(body.servicetitan_technician_id || body.technician_id || body.technician?.id);
    const servicetitan_location_name = (body.servicetitan_location_name || body.location_name || body.location?.name || '').toString().trim();

    // ── Validate immutable ServiceTitan IDs ──
    if (!crm_appointment_id || !crm_job_number) {
      return Response.json(
        { error: 'Missing required fields: appointment_id and job_number' },
        { status: 400 }
      );
    }

    // ── Stable external identity (server-resolved; never caller-supplied) ──
    const servicetitan_appointment_id = crm_appointment_id;
    const servicetitan_job_id = crm_job_number;
    let servicetitan_tenant_id: string = body.tenant_id || body.servicetitan_tenant_id || body.tenant || '';
    if (!servicetitan_tenant_id) {
      try { servicetitan_tenant_id = getTenantId(); } catch { servicetitan_tenant_id = ''; }
    }

    // ── Technician enrichment (same retrieval path as "Refresh from ServiceTitan") ──
    // When the CRM payload supplied no ServiceTitan technician, fetch the live
    // JPM v2 appointment record and extract the technician from the top-level
    // fields, then appointmentSummaries[0]. Never rely only on an empty
    // appointmentSummaries array.
    let enrichedTechId = servicetitan_technician_id;
    let enrichedTechName = technician_name;
    if (!enrichedTechId && !enrichedTechName && servicetitan_appointment_id) {
      try {
        const fetched = await fetchAppointmentTechnician(servicetitan_appointment_id, servicetitan_tenant_id || undefined);
        if (fetched) {
          if (fetched.technicianId) enrichedTechId = fetched.technicianId;
          if (fetched.technicianName) enrichedTechName = fetched.technicianName;
        }
      } catch (enrichErr) {
        console.error('[UPSERT_APPOINTMENT_FROM_CRM] Technician enrichment failed:', enrichErr instanceof Error ? enrichErr.message : String(enrichErr));
      }
    }

    // ── Match or create the linked Job by immutable ST identity ──
    let job: any = null;
    let customer_id: string | null = null;

    let existingJobs = await base44.asServiceRole.entities.Job.filter({ crm_job_number });
    if (existingJobs.length === 0 && servicetitan_job_id) {
      existingJobs = await base44.asServiceRole.entities.Job.filter({ servicetitan_job_id });
    }

    if (existingJobs.length > 0) {
      job = existingJobs[0];
      customer_id = job.customer_id;
      // Integrity check is NOT bypassed when the Job pre-exists: repair a
      // resolvable-but-unlinked Location (and pending service address) before
      // any Appointment is created/updated against this Job.
      job = await repairJobLocationLink(base44, job);
    } else {
      // ── GUARDED JOB CREATION (Requirement A) ──
      // 1. Resolve the EXACT Base44 Customer by ServiceTitan customer ID, then customer_number.
      let resolvedCustomer: any = null;
      if (servicetitan_customer_id) {
        try {
          const bySt = await base44.asServiceRole.entities.Customer.filter({ servicetitan_customer_id });
          if (bySt.length > 0) resolvedCustomer = bySt[0];
        } catch { /* ignore */ }
      }
      if (!resolvedCustomer && customer_number) {
        try {
          const byNum = await base44.asServiceRole.entities.Customer.filter({ customer_number });
          if (byNum.length > 0) resolvedCustomer = byNum[0];
        } catch { /* ignore */ }
      }
      if (!resolvedCustomer) {
        return Response.json({
          error: 'Job not created — parent Customer not found by ServiceTitan customer ID. No records were written.',
          servicetitan_customer_id,
          customer_number,
          stage: 'guarded_customer_resolution',
        }, { status: 422 });
      }

      // 2. Resolve the EXACT Base44 Location by ServiceTitan location ID (Location.crm_location_id).
      let resolvedLocation: any = null;
      if (servicetitan_location_id) {
        try {
          const byCrm = await base44.asServiceRole.entities.Location.filter({ crm_location_id: servicetitan_location_id });
          if (byCrm.length > 0) resolvedLocation = byCrm[0];
        } catch { /* ignore */ }
      }
      if (!resolvedLocation) {
        return Response.json({
          error: 'Job not created — parent Location not found by ServiceTitan location ID. No records were written.',
          servicetitan_location_id,
          stage: 'guarded_location_resolution',
        }, { status: 422 });
      }

      customer_id = resolvedCustomer.id;

      // 3. Create the Job with the exact linked Location + real service address (never pending).
      const svcDate = scheduled_start ? String(scheduled_start).split('T')[0] : '';
      job = await base44.asServiceRole.entities.Job.create({
        crm_job_number,
        servicetitan_job_id,
        customer_id,
        customer_name: customer_name || resolvedCustomer.name || resolvedCustomer.customer_name || '',
        customer_number: customer_number || resolvedCustomer.customer_number || '',
        servicetitan_customer_id,
        location_id: resolvedLocation.id,
        servicetitan_location_id,
        servicetitan_location_name: servicetitan_location_name || resolvedLocation.location_label || '',
        technician_email: technician_email || '',
        technician_emails: technician_email ? [technician_email] : [],
        technician_name: technician_name || '',
        service_date: svcDate,
        appointment_date: svcDate || null,
        address: resolvedLocation.address || address || '',
        city: resolvedLocation.city || city || '',
        state: resolvedLocation.state || state || '',
        zip: resolvedLocation.zip || zip || '',
        status: 'scheduled',
        job_type: 'inspection',
        workflow_version: 'v2_package',
        servicetitan_sync_status: 'synced',
        servicetitan_source: 'webhook',
        import_source: 'webhook',
        imported_at: new Date().toISOString(),
      });
    }

    // Upsert the Appointment by stable external identity:
    //   (servicetitan_tenant_id, servicetitan_appointment_id)
    let existingAppts: any[] = [];
    if (servicetitan_appointment_id) {
      existingAppts = await base44.asServiceRole.entities.Appointment.filter({ servicetitan_appointment_id });
      if (servicetitan_tenant_id && existingAppts.length > 1) {
        const byTenant = existingAppts.filter((a) => a.servicetitan_tenant_id === servicetitan_tenant_id);
        if (byTenant.length > 0) existingAppts = byTenant;
      }
    }
    if (existingAppts.length === 0 && crm_appointment_id) {
      existingAppts = await base44.asServiceRole.entities.Appointment.filter({ crm_appointment_id });
      if (servicetitan_tenant_id && existingAppts.length > 1) {
        const byTenant = existingAppts.filter((a) => a.servicetitan_tenant_id === servicetitan_tenant_id);
        if (byTenant.length > 0) existingAppts = byTenant;
      }
    }
    existingAppts.sort((a, b) => new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime());

    // ST-owned fields: overwritten on update ONLY when supplied in the payload.
    // LVC-owned fields (notes, crew_assignment, assigned_vehicle, truck fields,
    // dispatch_status, technician_mapping_*) are never overwritten here.
    const stOwnedUpdate: Record<string, any> = {
      job_id: job.id,
      crm_appointment_id,
      crm_job_number,
      servicetitan_appointment_id,
      servicetitan_job_id,
      customer_id: customer_id || job.customer_id || '',
      appointment_source: 'crm',
    };
    if (servicetitan_tenant_id) stOwnedUpdate.servicetitan_tenant_id = servicetitan_tenant_id;
    if (servicetitan_customer_id) stOwnedUpdate.servicetitan_customer_id = servicetitan_customer_id;
    if (servicetitan_location_id) stOwnedUpdate.servicetitan_location_id = servicetitan_location_id;
    if (servicetitan_location_name) stOwnedUpdate.servicetitan_location_name = servicetitan_location_name;
    if (customer_name) stOwnedUpdate.customer_name = customer_name || job.customer_name || '';
    if (scheduled_start) stOwnedUpdate.scheduled_start = scheduled_start;
    if (scheduled_end) stOwnedUpdate.scheduled_end = scheduled_end;
    if (technician_email) stOwnedUpdate.technician_email = technician_email;
    if (enrichedTechName) stOwnedUpdate.technician_name = enrichedTechName;
    // Preserve raw ServiceTitan technician IDs/names so the reconciler can roll
    // them up onto the linked Job and escalate dispatch_status = assigned.
    if (enrichedTechId) stOwnedUpdate.servicetitan_technician_id = enrichedTechId;
    if (enrichedTechName) stOwnedUpdate.servicetitan_technician_name = enrichedTechName;
    if (status) stOwnedUpdate.status = status;
    if (appointment_type) stOwnedUpdate.appointment_type = appointment_type;
    if (address) stOwnedUpdate.address = address || job.address || '';
    if (city) stOwnedUpdate.city = city || job.city || '';
    if (state) stOwnedUpdate.state = state || job.state || '';
    if (zip) stOwnedUpdate.zip = zip || job.zip || '';

    let appointment: any;
    if (existingAppts.length > 0) {
      appointment = await base44.asServiceRole.entities.Appointment.update(existingAppts[0].id, stOwnedUpdate);
    } else {
      appointment = await base44.asServiceRole.entities.Appointment.create({
        ...stOwnedUpdate,
        customer_name: customer_name || job.customer_name || '',
        scheduled_start: scheduled_start || null,
        scheduled_end: scheduled_end || null,
        technician_email: technician_email || '',
        technician_name: enrichedTechName || '',
        status,
        appointment_type: appointment_type || '',
        address: address || job.address || '',
        city: city || job.city || '',
        state: state || job.state || '',
        zip: zip || job.zip || '',
        notes: notes || '',
        import_source: 'webhook',
        imported_at: new Date().toISOString(),
      });
    }

    // ── Post-import reconciliation (Requirement B) ──
    // Run the existing Job rollup/reconciler immediately after every Appointment
    // create or update. Idempotent; preserves manual LVC overrides.
    const appointmentId = appointment?.id || existingAppts[0]?.id;
    let reconcile: any = null;
    let reconcileError: string | null = null;
    try {
      reconcile = await reconcileAppointmentImport(base44, { appointment_id: appointmentId });
    } catch (reconcileErr) {
      reconcileError = reconcileErr instanceof Error ? reconcileErr.message : String(reconcileErr);
      console.error('[UPSERT_APPOINTMENT_FROM_CRM] Reconcile failed:', { job_id: job?.id, appointment_id: appointmentId, error: reconcileError });
    }

    console.log('[UPSERT_APPOINTMENT_FROM_CRM] Authorized upsert:', {
      crm_appointment_id,
      crm_job_number,
      action: existingAppts.length > 0 ? 'updated' : 'created',
      auth_user: authResult.user?.email || 'webhook',
    });

    return Response.json({
      success: true,
      appointment_id: appointmentId,
      job_id: job.id,
      action: existingAppts.length > 0 ? 'updated' : 'created',
      reconcile: reconcile
        ? { ok: true, processed: reconcile.processed, updated: reconcile.updated, errors: reconcile.errors }
        : { ok: false, error: reconcileError || 'Reconcile did not run', retryable: true },
      reconcile_failed: !!reconcileError,
    });
  } catch (error) {
    console.error('[UPSERT_APPOINTMENT_FROM_CRM] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}