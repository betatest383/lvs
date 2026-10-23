/**
 * Pure validation logic for the Zapier → LVC OS ServiceTitan Job Snapshot receiver.
 *
 * Extracted as a shared module so the envelope/snapshot validation contract is
 * unit-testable independently of the HTTP/SDK runtime, and reusable without
 * duplication. Contains NO I/O and NO secret handling.
 *
 * Contract (envelope):
 *   schema_version === "1.0"
 *   source === "zapier"
 *   event_type === "servicetitan.job_snapshot"
 *   environment === "diagnostic"          (production is not yet authorized)
 *   job_id            — nonempty string
 *   snapshot_json     — valid JSON string whose parsed root is an object
 *   correlation_id    — optional string
 *
 * If the parsed snapshot contains a Job ID field, it must match the envelope job_id.
 * Upstream records are never silently corrected, filtered, transformed, or discarded.
 */

export interface EnvelopeValidation {
  valid: boolean;
  status?: number;
  error?: string;
  stage?: string;
  parsedSnapshot?: any;
}

/** Candidate field names that may carry a Job ID inside a parsed ServiceTitan job snapshot. */
const JOB_ID_FIELDS = ["job_id", "jobId", "id", "job_number", "jobNumber"];

/**
 * Validate a parsed envelope object against the job-snapshot contract.
 * Returns the parsed snapshot on success, or a sanitized error on failure.
 * Pure function — no I/O, no side effects.
 */
export function validateEnvelope(envelope: any): EnvelopeValidation {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    return { valid: false, status: 400, error: "Invalid request body — JSON root must be an object", stage: "parse" };
  }

  if (envelope.schema_version !== "1.0") {
    return { valid: false, status: 422, error: "Invalid envelope — schema_version must equal 1.0", stage: "validate" };
  }
  if (envelope.source !== "zapier") {
    return { valid: false, status: 422, error: "Invalid envelope — source must equal zapier", stage: "validate" };
  }
  if (envelope.event_type !== "servicetitan.job_snapshot") {
    return { valid: false, status: 422, error: "Invalid envelope — event_type must equal servicetitan.job_snapshot", stage: "validate" };
  }
  if (envelope.environment !== "diagnostic") {
    return { valid: false, status: 422, error: "Invalid envelope — environment must equal diagnostic (production ingestion is not yet authorized)", stage: "validate" };
  }
  const jobId = typeof envelope.job_id === "string" ? envelope.job_id.trim() : "";
  if (!jobId) {
    return { valid: false, status: 422, error: "Invalid envelope — job_id must be a nonempty string", stage: "validate" };
  }

  const snapshotJsonRaw = envelope.snapshot_json;
  if (typeof snapshotJsonRaw !== "string" || !snapshotJsonRaw.trim()) {
    return { valid: false, status: 422, error: "Invalid envelope — snapshot_json must be a nonempty JSON string", stage: "validate" };
  }

  let parsedSnapshot: any;
  try {
    parsedSnapshot = JSON.parse(snapshotJsonRaw);
  } catch {
    return { valid: false, status: 422, error: "Invalid snapshot_json — not valid JSON", stage: "validate" };
  }
  if (!parsedSnapshot || typeof parsedSnapshot !== "object" || Array.isArray(parsedSnapshot)) {
    return { valid: false, status: 422, error: "Invalid snapshot_json — parsed root must be an object", stage: "validate" };
  }

  // If the parsed snapshot carries a Job ID, it must match the envelope job_id.
  for (const field of JOB_ID_FIELDS) {
    if (parsedSnapshot[field] !== undefined && parsedSnapshot[field] !== null && parsedSnapshot[field] !== "") {
      if (String(parsedSnapshot[field]) !== jobId) {
        return { valid: false, status: 422, error: `Job ID mismatch — snapshot ${field} does not match envelope job_id`, stage: "validate" };
      }
      break;
    }
  }

  return { valid: true, parsedSnapshot };
}

/**
 * Build sanitized request metadata. Never includes credentials, secret header
 * values, or the Idempotency-Key value (stored in its own field). Pure function.
 */
export function buildRequestMetadata(method: string, contentType: string, userAgent: string, host: string): string {
  return JSON.stringify({
    method: method || "",
    content_type: contentType || "",
    user_agent: userAgent || "",
    host: host || "",
  });
}