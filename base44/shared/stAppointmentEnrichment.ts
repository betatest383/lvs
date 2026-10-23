/**
 * ServiceTitan Appointment Enrichment — shared retrieval used by the import
 * path AND the post-import reconciler (the server-side equivalent of the
 * "Refresh from ServiceTitan" button).
 *
 * Why this exists:
 *   The JPM v2 appointment object the webhook/Zapier payload is built from can
 *   arrive with an empty `appointmentSummaries` array and no top-level
 *   technician. An Appointment imported with no technician signal must be
 *   enriched by re-fetching the live ServiceTitan appointment record and
 *   extracting the technician from the top-level fields first, then
 *   appointmentSummaries[0] — never relying only on appointmentSummaries.
 *
 * This reuses the exact extraction logic of
 * runServiceTitanAppointmentIncrementalSync.mapApiRecordToPayload so import-time
 * enrichment and the incremental sync share one technician extraction path.
 */
import { apiRequest, retryWithBackoff, getTenantId, getEnvironment } from "./stAuth.ts";
import { APPOINTMENTS_API_PATH } from "./stAppointmentSyncConfig.ts";

export interface StTechnician {
  technicianId: string;
  technicianName: string;
  technicianEmail: string;
}

/** Extract technician (id/name/email) from a ServiceTitan JPM v2 appointment record. */
export function extractTechnicianFromStAppointment(record: any): StTechnician {
  const r = record || {};
  let technicianId = String(r.technicianId || r.technician_id || "").trim();
  let technicianName = String(r.technicianName || r.technician_name || "").trim();
  let technicianEmail = String(r.technicianEmail || r.technician_email || "").trim();
  if (!technicianId && Array.isArray(r.appointmentSummaries) && r.appointmentSummaries.length > 0) {
    const s = r.appointmentSummaries[0] || {};
    technicianId = String(s.technicianId || s.technician_id || "").trim();
    technicianName = String(s.technicianName || s.technician_name || "").trim();
    technicianEmail = String(s.technicianEmail || s.technician_email || "").trim();
  }
  return { technicianId, technicianName, technicianEmail };
}

/** Fetch a single ServiceTitan appointment (JPM v2) by id. Returns null on failure. */
export async function fetchServiceTitanAppointment(
  stAppointmentId: string,
  tenantId?: string,
  environment?: string,
): Promise<any | null> {
  if (!stAppointmentId) return null;
  const tenant = tenantId || getTenantId();
  const env = environment || getEnvironment();
  const path = `${APPOINTMENTS_API_PATH(tenant)}/${stAppointmentId}`;
  try {
    return await retryWithBackoff(async () => apiRequest(path, env, {}));
  } catch (err) {
    console.error(
      "[ST APPT ENRICH] fetchServiceTitanAppointment failed:",
      stAppointmentId,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/** Fetch + extract technician for an appointment. Returns null when unavailable. */
export async function fetchAppointmentTechnician(
  stAppointmentId: string,
  tenantId?: string,
  environment?: string,
): Promise<StTechnician | null> {
  const record = await fetchServiceTitanAppointment(stAppointmentId, tenantId, environment);
  if (!record) return null;
  const t = extractTechnicianFromStAppointment(record);
  if (!t.technicianId && !t.technicianName) return null;
  return t;
}

/**
 * Repair a Job's Location link when it carries a raw servicetitan_location_id
 * but a blank location_id or a "Service address pending" placeholder, and the
 * Location exists locally by crm_location_id. Never creates a Location.
 * Returns the (possibly refreshed) Job record.
 */
export async function repairJobLocationLink(base44: any, job: any): Promise<any> {
  if (!job) return job;
  const stLocId = String(job.servicetitan_location_id || "").trim();
  if (!stLocId) return job;
  const addrPending =
    !job.address ||
    !String(job.address).trim() ||
    String(job.address).trim().toLowerCase() === "service address pending";
  const needsLink = !job.location_id || !String(job.location_id).trim();
  if (!needsLink && !addrPending) return job;
  try {
    const locs = await base44.asServiceRole.entities.Location.filter({ crm_location_id: stLocId }, null, 5);
    if (!locs || locs.length === 0) return job;
    const loc = locs[0];
    const upd: Record<string, any> = {};
    if (needsLink) upd.location_id = loc.id;
    if (addrPending) {
      if (loc.address) upd.address = loc.address;
      if (loc.city) upd.city = loc.city;
      if (loc.state) upd.state = loc.state;
      if (loc.zip) upd.zip = loc.zip;
    }
    if ((!job.servicetitan_location_name || !String(job.servicetitan_location_name).trim()) && loc.location_label) {
      upd.servicetitan_location_name = loc.location_label;
    }
    if (Object.keys(upd).length === 0) return job;
    await base44.asServiceRole.entities.Job.update(job.id, upd);
    console.log("[ST APPT ENRICH] repairJobLocationLink patched job", job.id, Object.keys(upd));
    return { ...job, ...upd };
  } catch (err) {
    console.error(
      "[ST APPT ENRICH] repairJobLocationLink failed for job",
      job.id,
      err instanceof Error ? err.message : String(err),
    );
    return job;
  }
}