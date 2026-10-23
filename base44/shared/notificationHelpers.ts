/**
 * Shared notification helpers used by manageNotification and manageTask.
 *
 * Centralizes ID generation, employee resolution, role normalization,
 * and notification inclusion logic so both backend functions use the
 * exact same rules. Extracted per the backend-function guide rule:
 * "Logic needed by more than one function must live in a shared module."
 */

export function normalizeRole(raw) {
  if (!raw) return '';
  return String(raw).trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

export function isPrivileged(roleKey) {
  return roleKey === 'admin' || roleKey === 'owner';
}

/**
 * Generate a collision-safe sequential ID (NOTF-######) for EnterpriseNotification.
 * Uses query + increment with retry — never count+1.
 */
export async function generateNotificationId(base44) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await base44.asServiceRole.entities.EnterpriseNotification.filter(
      { notification_id: { $regex: '^NOTF-' } },
      '-notification_id',
      1
    );
    let next = 1;
    if (existing.length > 0 && existing[0].notification_id) {
      const match = String(existing[0].notification_id).match(/NOTF-(\d+)/);
      if (match) next = parseInt(match[1], 10) + 1;
    }
    const candidate = 'NOTF-' + String(next).padStart(6, '0');
    const collision = await base44.asServiceRole.entities.EnterpriseNotification.filter(
      { notification_id: candidate },
      null,
      1
    );
    if (collision.length === 0) return candidate;
    await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
  }
  return 'NOTF-' + String(Date.now()).slice(-6);
}

/**
 * Generate a collision-safe sequential ID (ACK-######) for TaskAcknowledgment.
 */
export async function generateAcknowledgmentNumber(base44) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await base44.asServiceRole.entities.TaskAcknowledgment.filter(
      { acknowledgment_number: { $regex: '^ACK-' } },
      '-acknowledgment_number',
      1
    );
    let next = 1;
    if (existing.length > 0 && existing[0].acknowledgment_number) {
      const match = String(existing[0].acknowledgment_number).match(/ACK-(\d+)/);
      if (match) next = parseInt(match[1], 10) + 1;
    }
    const candidate = 'ACK-' + String(next).padStart(6, '0');
    const collision = await base44.asServiceRole.entities.TaskAcknowledgment.filter(
      { acknowledgment_number: candidate },
      null,
      1
    );
    if (collision.length === 0) return candidate;
    await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
  }
  return 'ACK-' + String(Date.now()).slice(-6);
}

/**
 * Resolve the authenticated user's EmployeeRegistry record server-side.
 * Never trusts caller-supplied identity.
 */
export async function resolveEmployee(base44, email) {
  if (!email) return null;
  const employees = await base44.asServiceRole.entities.EmployeeRegistry.filter({
    $or: [{ email: email }, { login_email: email }],
  });
  return employees[0] || null;
}

/**
 * Resolve the canonical role key from the EmployeeRegistry + RoleRegistry.
 */
export async function resolveRoleKey(base44, employee) {
  if (!employee) return '';
  const rawRole = employee.primary_role || employee.base44_user_role || '';
  if (!rawRole) return employee.base44_user_role === 'admin' ? 'admin' : '';
  const roleRegistry = await base44.asServiceRole.entities.RoleRegistry.filter({
    $or: [{ role_id: rawRole }, { role_key: normalizeRole(rawRole) }, { role_name: rawRole }],
  });
  if (roleRegistry.length > 0 && roleRegistry[0].role_key) {
    return normalizeRole(roleRegistry[0].role_key);
  }
  return normalizeRole(rawRole);
}

/**
 * Determine if a notification is visible to the given employee.
 * Mirrors the client-side resolveNotificationInclusion logic.
 */
export function canViewNotification(n, employee, employeeId, roleKey, privileged) {
  if (!n || !employee) return false;
  if (privileged) return true;

  const rRegId = (n.recipient_employee_registry_id || '').trim();
  const rEmail = (n.recipient_email || '').toLowerCase().trim();
  const rUserId = (n.recipient_user_id || '').trim();
  const rName = (n.recipient_name || '').toLowerCase().trim();
  const rRole = normalizeRole(n.recipient_role || '');
  const rDept = (n.recipient_department || '').trim();

  const eRegId = employee.id || '';
  const eEmail = (employee.email || '').toLowerCase().trim();
  const eUserId = employee.linked_user_id || '';
  const eDept = (employee.department || '').trim();
  const eFullName = `${employee.first_name || ''} ${employee.last_name || ''}`.toLowerCase().trim();

  const hasPersonSpecific = rRegId || rEmail || rUserId || rName;

  // Direct assignment always wins
  if (hasPersonSpecific) {
    if (rRegId && rRegId === eRegId) return true;
    if (rEmail && rEmail === eEmail) return true;
    if (rUserId && rUserId === eUserId) return true;
    // Legacy name match (only when no modern person-specific field)
    if (rName && !rRegId && !rEmail && !rUserId) {
      if (eFullName === rName || (employee.last_name && rName === employee.last_name.toLowerCase().trim())) return true;
    }
    return false; // Addressed to someone else
  }

  // Role broadcast
  if (rRole && rRole === roleKey) return true;

  // Department broadcast (only when no role)
  if (!rRole && rDept && rDept === eDept) return true;

  // Company broadcast (all recipient fields blank)
  if (!rRole && !rDept) return true;

  return false;
}

/**
 * Determine if the authenticated employee is the DIRECT recipient of a notification.
 * This is STRICTER than canViewNotification — it does NOT consider Owner/admin
 * privilege, role broadcasts, or department broadcasts.
 *
 * Used for:
 * - Personal actionable alert queue (persistent banner delivery)
 * - Acknowledgment authorization (who may satisfy a required acknowledgment)
 *
 * A notification is directly addressed when one of these matches:
 * 1. recipient_employee_registry_id equals authenticated EmployeeRegistry entity ID
 * 2. exact normalized recipient_email equals authenticated login email or employee email
 *
 * Names are NEVER used for identity resolution (duplicate-name protection).
 */
export function isDirectRecipient(n, employee) {
  if (!n || !employee) return false;
  const rRegId = (n.recipient_employee_registry_id || '').trim();
  const rEmail = (n.recipient_email || '').toLowerCase().trim();
  const eRegId = employee.id || '';
  const eEmail = (employee.email || '').toLowerCase().trim();
  const eLoginEmail = (employee.login_email || '').toLowerCase().trim();

  if (rRegId && rRegId === eRegId) return true;
  if (rEmail && (rEmail === eEmail || rEmail === eLoginEmail)) return true;
  return false;
}

/**
 * Build the deterministic idempotency key for a TaskAcknowledgment.
 */
export function buildIdempotencyKey(taskId, assignmentVersion, employeeId, response) {
  return `${taskId}:${assignmentVersion}:${employeeId}:${response}`;
}

/**
 * Write an audit event to AutomationRunLog.
 */
export async function logEvent(base44, recordId, sourceModule, eventType, details, userEmail) {
  try {
    await base44.asServiceRole.entities.AutomationRunLog.create({
      log_id: sourceModule.toUpperCase().slice(0, 4) + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      log_type: 'event',
      source_module: sourceModule,
      trigger_event: eventType,
      related_record_id: recordId,
      status: 'success',
      conditions_met: true,
      execution_trace_json: JSON.stringify({ ...details, timestamp: new Date().toISOString(), user: userEmail }),
      triggered_by: userEmail,
    });
  } catch (e) {
    /* best-effort */
  }
}

/**
 * Priority rank for alert queue ordering. Lower number = higher priority.
 */
export function priorityRank(priority) {
  switch (priority) {
    case 'Critical': return 0;
    case 'High': return 1;
    case 'Medium': return 2;
    case 'Low': return 3;
    default: return 2;
  }
}