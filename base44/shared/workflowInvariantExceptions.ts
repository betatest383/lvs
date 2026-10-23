/**
 * Durable, append-only evidence for blocking decision-invariant violations.
 * Never deletes or edits CustomerDecisionRecord history. Repeated detections
 * of the same evidence collapse to one exception and one alert per manager.
 */
function nowIso() { return new Date().toISOString(); }

function normalizedEvidence(report: any) {
  return (report?.violations || [])
    .filter((v: any) => v.severity === 'block')
    .map((v: any) => ({
      code: String(v.code || ''),
      detail: String(v.detail || ''),
      evidence_ids: [...new Set((v.evidence_ids || []).map(String))].sort(),
    }))
    .sort((a: any, b: any) => a.code.localeCompare(b.code));
}

function exceptionKey(workflowId: string, evidence: any[]) {
  const compact = evidence.map((v) => `${v.code}:${v.evidence_ids.join(',')}`).join('|');
  return `INV-${workflowId}-${compact}`;
}

export async function recordBlockingInvariantException(
  base44: any,
  args: {
    workflow: any;
    report: any;
    mutationRequestId?: string;
    detectingFunction: string;
    lockGeneration?: number;
  },
) {
  const evidence = normalizedEvidence(args.report);
  if (!evidence.length) return null;

  const db = base44.asServiceRole;
  const key = exceptionKey(args.workflow.id, evidence);
  const existing = await db.entities.WorkflowInvariantException
    .filter({ exception_key: key }, '-detected_at', 1)
    .catch(() => []);
  if (existing?.[0]) return existing[0];

  // Route directly to active employees in a role that has manager approval
  // authority. The source RoleRegistry is used, not caller-supplied emails.
  const [roles, employees] = await Promise.all([
    db.entities.RoleRegistry.list('role_name', 200).catch(() => []),
    db.entities.EmployeeRegistry.filter({ employment_status: 'Active' }, 'email', 500).catch(() => []),
  ]);
  const managerRoleIds = new Set((roles || [])
    .filter((r: any) => !!r.manager_approval_authority)
    .flatMap((r: any) => [r.id, r.role_id, r.role_key, r.role_name].filter(Boolean).map(String)));
  const recipients = (employees || []).filter((e: any) =>
    managerRoleIds.has(String(e.primary_role || '')) && !!(e.linked_user_id || e.login_email || e.email),
  );

  const exception = await db.entities.WorkflowInvariantException.create({
    exception_key: key,
    workflow_id: args.workflow.id,
    job_id: args.workflow.job_id,
    mutation_request_id: args.mutationRequestId || '',
    workflow_revision_version: Number(args.workflow.workflow_revision_version || 0),
    lock_generation: Number(args.lockGeneration || args.workflow.decision_lock_generation || 0),
    severity: 'block',
    invariant_codes: evidence.map((v: any) => v.code),
    evidence_json: JSON.stringify(evidence),
    detected_at: nowIso(),
    detecting_function: args.detectingFunction,
    manager_notification_status: recipients.length ? 'sent' : 'failed',
  });

  await Promise.all(recipients.map(async (employee: any) => {
    const recipientEmail = employee.login_email || employee.email || '';
    const recipientName = `${employee.preferred_name || employee.first_name || ''} ${employee.last_name || ''}`.trim();
    const notificationId = `INV-${exception.id}-${employee.id}`.slice(0, 120);
    const duplicate = await db.entities.EnterpriseNotification
      .filter({ notification_id: notificationId }, '-created_date', 1)
      .catch(() => []);
    if (duplicate?.[0]) return;
    await db.entities.EnterpriseNotification.create({
      notification_id: notificationId,
      title: 'Workflow invariant exception requires review',
      message: `Workflow ${args.workflow.id} is blocked by ${evidence.map((v: any) => v.code).join(', ')}.`,
      notification_type: 'Critical',
      notification_purpose: 'workflow_invariant_exception',
      priority: 'Critical',
      status: 'Sent',
      source_module: 'workflow_hardening',
      source_record_id: exception.id,
      recipient_employee_registry_id: employee.id,
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      recipient_user_id: employee.linked_user_id || null,
      related_job: args.workflow.job_id,
      related_workflow: args.workflow.id,
      delivery_methods: ['In-App'],
      requires_acknowledgment: true,
      is_archived: false,
      sent_date: nowIso(),
      escalation_level: 0,
    });
  })).catch(() => {});

  return exception;
}
