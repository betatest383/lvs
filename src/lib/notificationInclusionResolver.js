/**
 * Notification Inclusion Resolver
 *
 * Determines WHY a notification is visible to a specific employee by inspecting
 * the routing fields stored on the notification record.
 *
 * Routing priority (first match wins):
 *   1. Direct Assignment — person-specific recipient field matches this employee
 *   2. Legacy name match — only when no person-specific field is set on the notification
 *      AND recipient_name matches this employee (pre-registry data)
 *   3. Role broadcast — only when no person-specific fields are set
 *   4. Department broadcast — only when no person-specific AND no role set
 *   5. Company broadcast — only when all recipient fields blank
 *
 * If a notification is addressed to a DIFFERENT employee (person-specific field
 * populated but doesn't match), it is excluded from normal results and flagged
 * as an excluded unexpected match.
 */
import { resolveRoleFromRegistry } from '@/lib/roleUtils';

export const INCLUSION_REASONS = {
  DIRECT_ASSIGNMENT: 'Direct Assignment (Employee)',
  BROADCAST_ROLE: 'Broadcast by Role',
  BROADCAST_DEPARTMENT: 'Broadcast by Department',
  BROADCAST_ALL: 'Broadcast to All Employees',
  ESCALATION: 'Escalation',
  SYSTEM: 'System Notification',
  LEGACY: 'Legacy Assignment',
  OTHER: 'Other',
};

export const ROUTING_BADGES = {
  ASSIGNED_TO_YOU: 'Assigned to You',
  ROLE_BROADCAST: 'Role Broadcast',
  DEPT_BROADCAST: 'Department Broadcast',
  COMPANY_BROADCAST: 'Company Broadcast',
};

export const BADGE_COLORS = {
  'Assigned to You': 'bg-green-100 text-green-700 border-green-200',
  'Role Broadcast': 'bg-blue-100 text-blue-700 border-blue-200',
  'Department Broadcast': 'bg-purple-100 text-purple-700 border-purple-200',
  'Company Broadcast': 'bg-indigo-100 text-indigo-700 border-indigo-200',
};

export const ROUTING_FIELD_DEFS = [
  { key: 'recipient_employee_registry_id', label: 'Registry ID' },
  { key: 'recipient_name', label: 'Name' },
  { key: 'recipient_email', label: 'Email' },
  { key: 'recipient_role', label: 'Role' },
  { key: 'recipient_department', label: 'Department' },
  { key: 'recipient_user_id', label: 'User ID' },
];

export function getRoutingFields(n) {
  if (!n) return {};
  return {
    recipient_employee_registry_id: n.recipient_employee_registry_id || null,
    recipient_name: n.recipient_name || null,
    recipient_email: n.recipient_email || null,
    recipient_role: n.recipient_role || null,
    recipient_department: n.recipient_department || null,
    recipient_user_id: n.recipient_user_id || null,
  };
}

/**
 * @param {object} n  - EnterpriseNotification record
 * @param {object} emp - EmployeeRegistry record
 * @param {string} resolvedRole - canonical role key for emp
 * @param {array}  roleRegistry - RoleRegistry records
 * @returns {{ shouldInclude, reason, detail, badge, unexpectedMatch, excludedUnexpectedMatch, routingFields }}
 */
export function resolveNotificationInclusion(n, emp, resolvedRole, roleRegistry) {
  if (!n || !emp) {
    return { shouldInclude: false, reason: null, detail: null, badge: null, unexpectedMatch: false, excludedUnexpectedMatch: false, routingFields: getRoutingFields(n) };
  }

  const routingFields = getRoutingFields(n);

  // --- Extract notification recipient fields ---
  const rRegId = (n.recipient_employee_registry_id || '').trim();
  const rEmail = (n.recipient_email || '').toLowerCase().trim();
  const rUserId = (n.recipient_user_id || '').trim();
  const rName = (n.recipient_name || '').toLowerCase().trim();
  const rRoleRaw = n.recipient_role || '';
  const rRole = resolveRoleFromRegistry(rRoleRaw, roleRegistry).canonicalRoleKey;
  const rDept = (n.recipient_department || '').trim();

  // --- Determine which person-specific fields are populated ---
  const hasRegId = !!rRegId;
  const hasEmail = !!rEmail;
  const hasUserId = !!rUserId;
  const hasName = !!rName;
  const hasRole = !!rRole;
  const hasDept = !!rDept;
  const hasPersonSpecific = hasRegId || hasEmail || hasUserId || hasName;

  // --- Extract employee fields for matching ---
  const eRegId = emp.id || '';
  const eEmail = (emp.email || '').toLowerCase().trim();
  const eUserId = emp.linked_user_id || '';
  const eDept = (emp.department || '').trim();
  const eFullName = `${emp.first_name || ''} ${emp.last_name || ''}`.toLowerCase().trim();
  const eLast = (emp.last_name || '').toLowerCase().trim();

  // --- Direct assignment checks ---
  const regMatch = hasRegId && rRegId === eRegId;
  const emailMatch = hasEmail && rEmail === eEmail;
  const userIdMatch = hasUserId && rUserId === eUserId;
  const directMatch = regMatch || emailMatch || userIdMatch;

  // --- Legacy name match (only when no modern person-specific field is set) ---
  const nameExactMatch = hasName && eFullName && rName === eFullName;
  const namePartialMatch = hasName && eLast && (rName === eLast || eFullName.includes(rName));
  const legacyMatch = (nameExactMatch || namePartialMatch) && !hasRegId && !hasEmail && !hasUserId;

  // --- Rule 1: Direct Assignment always wins ---
  if (hasPersonSpecific) {
    if (directMatch || legacyMatch) {
      const detail = regMatch ? 'Matched by recipient_employee_registry_id'
        : emailMatch ? 'Matched by recipient_email'
        : userIdMatch ? 'Matched by recipient_user_id'
        : `Matched by recipient_name ("${n.recipient_name}") — pre-registry`;
      return { shouldInclude: true, reason: INCLUSION_REASONS.DIRECT_ASSIGNMENT, detail, badge: ROUTING_BADGES.ASSIGNED_TO_YOU, unexpectedMatch: false, excludedUnexpectedMatch: false, routingFields };
    }
    // Person-specific recipient set but does NOT match this employee — EXCLUDE
    const target = n.recipient_email || n.recipient_name || rRegId || 'another employee';
    return { shouldInclude: false, reason: INCLUSION_REASONS.OTHER, detail: `Addressed to "${target}" — excluded (person-specific recipient mismatch)`, badge: null, unexpectedMatch: false, excludedUnexpectedMatch: true, routingFields };
  }

  // --- No person-specific fields set below this point ---

  // --- Rule 2: Role broadcast — only when no person-specific fields ---
  if (hasRole && rRole === resolvedRole) {
    // Escalation / system overrides take precedence in labeling, but inclusion is the same
    if ((n.escalation_level || 0) > 0) {
      return { shouldInclude: true, reason: INCLUSION_REASONS.ESCALATION, detail: `Escalation level ${n.escalation_level} — routed by role`, badge: ROUTING_BADGES.ROLE_BROADCAST, unexpectedMatch: false, excludedUnexpectedMatch: false, routingFields };
    }
    if (n.notification_type === 'System' || n.source_module === 'System') {
      return { shouldInclude: true, reason: INCLUSION_REASONS.SYSTEM, detail: 'System notification — routed by role', badge: ROUTING_BADGES.ROLE_BROADCAST, unexpectedMatch: false, excludedUnexpectedMatch: false, routingFields };
    }
    return { shouldInclude: true, reason: INCLUSION_REASONS.BROADCAST_ROLE, detail: `Matched by recipient_role ("${rRoleRaw}" → ${rRole})`, badge: ROUTING_BADGES.ROLE_BROADCAST, unexpectedMatch: false, excludedUnexpectedMatch: false, routingFields };
  }

  // --- Rule 3: Department broadcast — only when no person-specific AND no role ---
  if (!hasRole && hasDept && rDept === eDept) {
    if ((n.escalation_level || 0) > 0) {
      return { shouldInclude: true, reason: INCLUSION_REASONS.ESCALATION, detail: `Escalation level ${n.escalation_level} — routed by department`, badge: ROUTING_BADGES.DEPT_BROADCAST, unexpectedMatch: false, excludedUnexpectedMatch: false, routingFields };
    }
    if (n.notification_type === 'System' || n.source_module === 'System') {
      return { shouldInclude: true, reason: INCLUSION_REASONS.SYSTEM, detail: 'System notification — routed by department', badge: ROUTING_BADGES.DEPT_BROADCAST, unexpectedMatch: false, excludedUnexpectedMatch: false, routingFields };
    }
    return { shouldInclude: true, reason: INCLUSION_REASONS.BROADCAST_DEPARTMENT, detail: `Matched by recipient_department ("${rDept}")`, badge: ROUTING_BADGES.DEPT_BROADCAST, unexpectedMatch: false, excludedUnexpectedMatch: false, routingFields };
  }

  // --- Rule 4: Company broadcast — only when all recipient fields blank ---
  if (!hasRole && !hasDept) {
    return { shouldInclude: true, reason: INCLUSION_REASONS.BROADCAST_ALL, detail: 'No recipient fields set — visible to all employees', badge: ROUTING_BADGES.COMPANY_BROADCAST, unexpectedMatch: false, excludedUnexpectedMatch: false, routingFields };
  }

  // --- Rule 5: Has role or dept but doesn't match this employee — exclude ---
  return { shouldInclude: false, reason: INCLUSION_REASONS.OTHER, detail: 'Recipient role/department does not match this employee', badge: null, unexpectedMatch: false, excludedUnexpectedMatch: false, routingFields };
}