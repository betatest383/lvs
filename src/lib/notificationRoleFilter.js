/**
 * Notification Role Filter
 *
 * Determines which notifications are management-scoped and should be hidden
 * from technician roles even when they would otherwise be visible as a
 * company or department broadcast.
 *
 * Technicians can always see:
 *   - Direct assignments (addressed to them)
 *   - Role broadcasts matching their role
 *   - Escalations / system notifications matched by role
 *   - True department broadcasts (non-management-scoped)
 *   - True company broadcasts (non-management-scoped)
 *
 * Technicians cannot see (management-scoped):
 *   - Company broadcasts about management/admin topics
 *   - Department broadcasts about management/admin topics
 *   - Approval Required notifications (unless directly assigned)
 */
import { INCLUSION_REASONS } from './notificationInclusionResolver';

const MANAGEMENT_SOURCE_KEYWORDS = [
  'management',
  'admin',
  'audit',
  'hr ',
  'human resources',
  'integration',
  'servicetitan',
  'role registry',
  'policy registry',
  'training registry',
  'certification registry',
  'onboarding',
  'continuous improvement',
  'rule engine',
  'rules engine',
  'impersonation',
  'user identity',
];

/**
 * Returns true if a notification is management-scoped — i.e., its content
 * is intended for management/admin audiences even when no specific recipient
 * is set.
 */
export function isManagementScopedNotification(n) {
  if (!n) return false;

  const notifType = n.notification_type || '';

  // Approval Required notifications are management-scoped by nature
  if (notifType === 'Approval Required') return true;

  const sourceModule = (n.source_module || '').toLowerCase();

  // Check source_module for management keywords
  return MANAGEMENT_SOURCE_KEYWORDS.some(kw => sourceModule.includes(kw));
}

/**
 * For technician roles, determines whether a notification should be excluded
 * because it is management-scoped and was only included as a company or
 * department broadcast (not a direct assignment or role match).
 *
 * @param {object} n - EnterpriseNotification record
 * @param {object} inclusion - inclusion result from resolveNotificationInclusion
 * @returns {boolean} true if the notification should be excluded for techs
 */
export function shouldExcludeForTechRole(n, inclusion) {
  if (!inclusion || !inclusion.shouldInclude) return false;
  if (!isManagementScopedNotification(n)) return false;

  // Keep direct assignments — always visible to the intended recipient
  const KEEP_REASONS = [
    INCLUSION_REASONS.DIRECT_ASSIGNMENT,
    INCLUSION_REASONS.BROADCAST_ROLE,
    INCLUSION_REASONS.ESCALATION,
    INCLUSION_REASONS.SYSTEM,
    INCLUSION_REASONS.LEGACY,
  ];

  if (KEEP_REASONS.includes(inclusion.reason)) return false;

  // Exclude company broadcasts and department broadcasts that are management-scoped
  return true;
}