import { createClientFromRequest } from "npm:@base44/sdk";

const SENDER = "lvcostitan@gmail.com";
const RECIPIENT = "lvcostitan@gmail.com";

// LVC OS is the source of truth for estimate status. ServiceTitan recognizes only
// three estimate statuses (Open, Sold, Dismissed). Every LVC OS status is mapped
// explicitly below; an unmapped status is rejected (never silently defaulted).
// No "partially accepted" mapping exists — an estimate is accepted or declined as a
// complete document. A scope change requires a revised/replacement estimate.
const STATUS_MAP: Record<string, string> = {
  draft: "Open",
  pending_review: "Open",
  approved: "Open",
  execution_plan: "Open",
  ready_for_presentation: "Open",
  sent: "Open",
  accepted: "Sold",
  declined: "Dismissed",
  ready_for_scheduling: "Sold",
};

function mapStatus(lvcStatus: string): string | null {
  return STATUS_MAP[lvcStatus] ?? null;
}

function asText(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function requiredNumber(value: unknown, label: string): number {
  if (value == null || asText(value) === "") throw new Error(`${label} is required`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a valid number`);
  return number;
}

function parseLineItems(value: unknown): Record<string, unknown>[] {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Estimate line_items must contain JSON");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Estimate line_items is not valid JSON");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Estimate must contain at least one line item");
  }
  return parsed as Record<string, unknown>[];
}

function base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function revisionToken(estimate: Record<string, unknown>): string {
  return asText(estimate.updated_date || estimate.created_date || estimate.id)
    .replace(/[^0-9A-Za-z]/g, "")
    .slice(0, 40) || "UNVERSIONED";
}

async function audit(
  base44: any,
  data: {
    status: "Processed" | "Failed";
    idempotencyKey: string;
    estimateId: string;
    jobId: string;
    customerId: string;
    technicianId: string;
    serviceTitanJobId: string;
    sentAt: string;
    gmailMessageId?: string;
    errorMessage?: string;
  },
) {
  try {
    await base44.asServiceRole.entities.IntegrationEvent.create({
      event_id: `EVT-EST-EMAIL-${crypto.randomUUID()}`,
      source_system: "LVC_OS",
      event_type: "ESTIMATE_EMAIL_DISPATCHED",
      external_id: data.idempotencyKey,
      received_at: data.sentAt,
      processed_at: data.sentAt,
      status: data.status,
      raw_payload: JSON.stringify({
        service_titan_job_id: data.serviceTitanJobId,
        estimate_id: data.estimateId,
        gmail_message_id: data.gmailMessageId || null,
      }),
      parsed_summary: data.status === "Processed"
        ? `Estimate ${data.estimateId} emailed for ServiceTitan job ${data.serviceTitanJobId}`
        : `Estimate email failed for ServiceTitan job ${data.serviceTitanJobId}`,
      related_customer_id: data.customerId,
      related_job_id: data.jobId,
      related_technician_id: data.technicianId,
      related_estimate_id: data.estimateId,
      error_message: data.errorMessage || "",
      retry_count: 0,
    });
  } catch (error) {
    console.error("Estimate bridge audit write failed", error);
  }
}

Deno.serve(async (req) => {
  let stage = "request";
  let base44: any;
  let auditContext: any = null;

  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed", stage }, { status: 405 });
    }

    base44 = createClientFromRequest(req);
    stage = "authenticate_caller";
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized", stage }, { status: 401 });
    if (user.role !== "admin") {
      return Response.json({ error: "Admin access required", stage }, { status: 403 });
    }

    stage = "validate_request";
    const requestBody = await req.json();
    const estimateId = asText(requestBody?.estimate_id);
    if (!estimateId) {
      return Response.json({ error: "estimate_id is required", stage }, { status: 400 });
    }

    stage = "load_estimate";
    const estimate = await base44.asServiceRole.entities.Estimate.get(estimateId);
    if (!estimate) return Response.json({ error: "Estimate not found", stage }, { status: 404 });

    stage = "validate_estimate_name";
    const estimateName = asText(estimate.estimate_name).slice(0, 120);
    if (!estimateName) {
      return Response.json({
        error: "Enter an Estimate Name before saving or sending this estimate.",
        stage,
      }, { status: 422 });
    }

    stage = "validate_estimate_status";
    const lvcEstimateStatus = asText(estimate.status);
    const serviceTitanStatus = mapStatus(lvcEstimateStatus);
    if (!serviceTitanStatus) {
      return Response.json({
        error: `Unmapped LVC estimate status "${lvcEstimateStatus}". Status was not translated to a ServiceTitan status and no silent default was applied.`,
        stage,
      }, { status: 422 });
    }

    stage = "load_job";
    const jobId = asText(estimate.job_id);
    if (!jobId) {
      return Response.json({ error: "Estimate is missing its linked Job ID", stage }, { status: 422 });
    }
    const job = await base44.asServiceRole.entities.Job.get(jobId);
    if (!job) {
      return Response.json({ error: "The Job linked to this estimate was not found", stage }, { status: 422 });
    }

    stage = "validate_service_titan_job";
    const serviceTitanJobId = asText(
      job.servicetitan_job_id || job.crm_job_number || job.servicetitan_job_number,
    );
    if (!/^\d+$/.test(serviceTitanJobId)) {
      return Response.json({
        error: "The linked Job must contain a numeric ServiceTitan Job ID",
        stage,
      }, { status: 422 });
    }

    stage = "resolve_technician";
    const technicianEmail = asText(job.technician_email).toLowerCase();
    if (!technicianEmail) {
      return Response.json({
        error: "The linked Job must have a Primary Technician Email",
        stage,
      }, { status: 422 });
    }

    const employees = await base44.asServiceRole.entities.EmployeeRegistry.list("employee_id", 500);
    const employee = employees.find((candidate: Record<string, unknown>) => {
      const emails = [
        asText(candidate.email).toLowerCase(),
        asText(candidate.login_email).toLowerCase(),
      ];
      return emails.includes(technicianEmail) && /^\d+$/.test(asText(candidate.servicetitan_employee_id));
    });
    if (!employee) {
      return Response.json({
        error: "No Employee Registry record matches the technician email with a numeric ServiceTitan Employee ID",
        stage,
      }, { status: 422 });
    }

    const soldById = asText(employee.servicetitan_employee_id);
    stage = "validate_estimate";
    const lineItems = parseLineItems(estimate.line_items);
    const subtotal = requiredNumber(estimate.subtotal, "Estimate subtotal");
    const taxRate = Number(estimate.tax_rate || 0);
    const taxAmount = Number(estimate.tax_amount || 0);
    const total = requiredNumber(estimate.total, "Estimate total");
    if (![taxRate, taxAmount].every(Number.isFinite) || subtotal < 0 || taxAmount < 0 || total < 0) {
      return Response.json({ error: "Estimate financial fields are invalid", stage }, { status: 422 });
    }

    let customer: Record<string, unknown> | null = null;
    if (asText(estimate.customer_id)) {
      try {
        customer = await base44.asServiceRole.entities.Customer.get(asText(estimate.customer_id));
      } catch {
        customer = null;
      }
    }

    const sentAt = new Date().toISOString();
    // ESTIMATE_RECORD_ID is the stable cross-system identity for the estimate.
    // IDEMPOTENCY_KEY identifies one specific estimate revision/event. An identical
    // revision sent twice is rejected as already processed; a later revision or
    // status change produces a new integration event with a new revision-specific key.
    // The current downstream Zapier action is "Create Estimate" (no upsert); a stable
    // key is NOT used as a substitute for an update operation.
    const idempotencyKey = `ESTIMATE:${estimate.id}:${revisionToken(estimate)}`;
    const lvcDocumentId = asText(estimate.estimate_number) || `EST-${estimate.id}`;

    stage = "prevent_duplicate_send";
    const prior = await base44.asServiceRole.entities.IntegrationEvent.filter({
      event_type: "ESTIMATE_EMAIL_DISPATCHED",
      external_id: idempotencyKey,
      status: "Processed",
    }, "-processed_at", 1);
    if (prior.length) {
      return Response.json({
        error: "This unchanged estimate revision was already emailed to the integration inbox",
        stage,
        idempotency_key: idempotencyKey,
        prior_event_id: prior[0].event_id || prior[0].id,
      }, { status: 409 });
    }

    const technicianName = [
      asText(employee.preferred_name) || asText(employee.first_name),
      asText(employee.last_name),
    ].filter(Boolean).join(" ");

    const payload = {
      schema_version: "1.0",
      document_type: "ESTIMATE",
      source_system: "LVC_OS",
      service_titan_job_id: serviceTitanJobId,
      estimate_name: estimateName,
      lvc_document_id: lvcDocumentId,
      estimate_record_id: asText(estimate.id),
      estimate_status: asText(estimate.status),
      lvc_estimate_status: lvcEstimateStatus,
      service_titan_estimate_status: serviceTitanStatus,
      estimate_updated_at: asText(estimate.updated_date),
      idempotency_key: idempotencyKey,
      customer: {
        lvc_customer_id: asText(estimate.customer_id),
        name: asText(estimate.customer_name || customer?.name),
        email: asText(customer?.email),
        phone: asText(customer?.phone),
      },
      job: {
        lvc_job_id: asText(job.id),
        service_date: asText(job.service_date),
        address: asText(job.address),
        city: asText(job.city),
        state: asText(job.state),
        zip: asText(job.zip),
      },
      attribution: {
        technician_name: technicianName,
        technician_email: technicianEmail,
        service_titan_employee_id: soldById,
        sold_by_id: soldById,
      },
      financials: { subtotal, tax_rate: taxRate, tax_amount: taxAmount, total },
      line_items: lineItems,
      notes: asText(estimate.notes),
      valid_until: asText(estimate.valid_until),
      pdf_url: null,
      sent_at: sentAt,
      requested_by: { user_id: asText(user.id), email: asText(user.email) },
    };

    auditContext = {
      idempotencyKey,
      estimateId: asText(estimate.id),
      jobId: asText(job.id),
      customerId: asText(estimate.customer_id),
      technicianId: asText(employee.employee_id || employee.id),
      serviceTitanJobId,
      sentAt,
    };

    const plainBody = [
      "DOCUMENT_TYPE=ESTIMATE",
      "SCHEMA_VERSION=1.0",
      `SERVICE_TITAN_JOB_ID=${serviceTitanJobId}`,
      `ESTIMATE_NAME: ${estimateName}`,
      `LVC_DOCUMENT_ID=${lvcDocumentId}`,
      `ESTIMATE_RECORD_ID=${asText(estimate.id)}`,
      `LVC_ESTIMATE_STATUS=${lvcEstimateStatus}`,
      `SERVICE_TITAN_ESTIMATE_STATUS=${serviceTitanStatus}`,
      `IDEMPOTENCY_KEY=${idempotencyKey}`,
      `TECHNICIAN_EMAIL=${technicianEmail}`,
      `TECHNICIAN_ID=${soldById}`,
      `SOLD_BY_ID=${soldById}`,
      `SUBTOTAL=${subtotal.toFixed(2)}`,
      `TAX_AMOUNT=${taxAmount.toFixed(2)}`,
      `TOTAL=${total.toFixed(2)}`,
      "PDF_URL=",
      `PAYLOAD_JSON=${JSON.stringify(payload)}`,
    ].join("\r\n");

    const mimeMessage = [
      `From: LVC OS Bridge <${SENDER}>`,
      `To: ${RECIPIENT}`,
      `Subject: ${serviceTitanJobId}`,
      `Date: ${new Date(sentAt).toUTCString()}`,
      `Message-ID: <lvcos-estimate-${crypto.randomUUID()}@lvcos.local>`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "X-LVCOS-Document-Type: ESTIMATE",
      `X-LVCOS-Idempotency-Key: ${idempotencyKey}`,
      "",
      plainBody,
    ].join("\r\n");

    stage = "get_gmail_connection";
    const connection = await base44.asServiceRole.connectors.getConnection("gmail");
    if (!connection?.accessToken) {
      return Response.json({ error: "Gmail connection returned no access token", stage }, { status: 502 });
    }

    stage = "send_gmail_message";
    const gmailResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: base64Url(mimeMessage) }),
    });
    const responseText = await gmailResponse.text();
    let gmailResult: any = {};
    try {
      gmailResult = responseText ? JSON.parse(responseText) : {};
    } catch {
      gmailResult = { raw_response: responseText };
    }
    if (!gmailResponse.ok || !gmailResult?.id) {
      const message = gmailResult?.error?.message ||
        `Gmail did not accept the estimate message (HTTP ${gmailResponse.status})`;
      await audit(base44, { ...auditContext, status: "Failed", errorMessage: message });
      return Response.json({ error: message, stage }, { status: 502 });
    }

    stage = "write_audit_event";
    await audit(base44, {
      ...auditContext,
      status: "Processed",
      gmailMessageId: gmailResult.id,
    });

    return Response.json({
      success: true,
      stage: "completed",
      document_type: "ESTIMATE",
      sender: SENDER,
      recipient: RECIPIENT,
      subject: serviceTitanJobId,
      lvc_document_id: lvcDocumentId,
      estimate_id: asText(estimate.id),
      service_titan_job_id: serviceTitanJobId,
      lvc_estimate_status: lvcEstimateStatus,
      service_titan_estimate_status: serviceTitanStatus,
      sold_by_id: soldById,
      idempotency_key: idempotencyKey,
      sent_at: sentAt,
      gmail_message_id: gmailResult.id,
      gmail_thread_id: gmailResult.threadId || null,
      pdf_included: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Estimate Gmail bridge error", { stage, message });
    if (base44 && auditContext) {
      await audit(base44, { ...auditContext, status: "Failed", errorMessage: message });
    }
    return Response.json({ error: message, stage }, { status: 500 });
  }
});