import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ─── Redeploy marker: select_warehouse / check_warehouse_session / start_another_session ───
// ─── Capability-based permissions ───
const WAREHOUSE_CAPABILITIES = {
  admin: '*',
  owner: '*',
  director_of_operations: '*',
  operations_manager: '*',
  warehouse_manager: '*',
  inventory_specialist: '*',
  warehouse_associate: ['warehouse.setup.view', 'warehouse.material.assign', 'warehouse.inventory.count'],
};

function hasCapability(roleKey, capability) {
  const caps = WAREHOUSE_CAPABILITIES[roleKey];
  if (!caps) return false;
  if (caps === '*') return true;
  return caps.includes(capability);
}

// ─── Reactivation is a separate, restricted permission ───
// NOT implied by warehouse.location.create or the '*' wildcard.
// Warehouse Managers can create locations but cannot reactivate
// inactive ones without being explicitly added to this set.
const REACTIVATION_ALLOWED_ROLES = new Set([
  'admin',
  'owner',
  'director_of_operations',
  'operations_manager',
]);

function canReactivateWarehouse(roleKey) {
  return REACTIVATION_ALLOWED_ROLES.has(roleKey);
}

function normalizeRole(raw) {
  if (!raw) return '';
  return String(raw).trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

async function resolveUserRole(base44, user) {
  if (user.role === 'admin') return 'admin';
  const employees = await base44.asServiceRole.entities.EmployeeRegistry.filter({
    $or: [{ email: user.email }, { login_email: user.email }],
  });
  const employee = employees[0];
  if (!employee) return normalizeRole(user.role) || 'user';
  const rawRole = normalizeRole(employee.primary_role || '');
  if (!WAREHOUSE_CAPABILITIES[rawRole] && employee.primary_role) {
    try {
      const roles = await base44.asServiceRole.entities.RoleRegistry.filter({
        $or: [
          { role_key: rawRole },
          { role_name: employee.primary_role },
          { role_id: employee.primary_role },
        ],
      });
      if (roles[0]?.role_key) return normalizeRole(roles[0].role_key);
    } catch {}
  }
  return rawRole;
}

// ─── SHA-256 hash for count integrity ───
async function hashCountData(countData) {
  const json = JSON.stringify(countData);
  const encoder = new TextEncoder();
  const data = encoder.encode(json);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Server-side total recalculation from count data ───
async function recalculateTotals(base44, countData) {
  const itemIds = Object.keys(countData).filter(id =>
    countData[id]?.count !== undefined && countData[id]?.count !== '' && countData[id]?.count !== null
  );

  if (itemIds.length === 0) {
    return { itemIds: [], snapshot: {}, totalItems: 0, totalQty: 0, totalValue: 0 };
  }

  const items = await base44.asServiceRole.entities.InventoryMaster.filter({
    id: { $in: itemIds },
  });

  const snapshot = {};
  let totalQty = 0;
  let totalValue = 0;
  let itemCount = 0;

  for (const itemId of itemIds) {
    const item = items.find(i => i.id === itemId);
    if (!item) {
      throw new Error(`Inventory item not found: ${itemId}`);
    }
    const qty = Number(countData[itemId].count);
    if (isNaN(qty) || qty < 0) {
      throw new Error(`Invalid count for item: ${item.item_name}`);
    }
    const unitCost = item.unit_cost || 0;
    snapshot[itemId] = {
      count: qty,
      unit_cost: unitCost,
      item_name: item.item_name,
      bin_location: item.bin_location,
      sku: item.sku || null,
      inventory_type: item.inventory_type,
    };
    totalQty += qty;
    totalValue += qty * unitCost;
    itemCount++;
  }

  return {
    itemIds,
    snapshot,
    totalItems: itemCount,
    totalQty,
    totalValue: Math.round(totalValue * 100) / 100,
  };
}

// ═════════════════════════════════════════════════════════════════
// APPROVAL HANDOFF: Task + Notification creation
// ═════════════════════════════════════════════════════════════════

const HANDOFF_DEDUP_PREFIX = 'warehouse_count_approval';

// ─── Opening-balance approval capability ───
// This is a workflow-specific capability, SEPARATE from the broader
// can_approve_inventory capability (which covers ordinary inventory
// adjustments and remains on Warehouse Manager roles). Only Owner and
// Director of Operations may approve warehouse setup/opening-balance
// sessions. Warehouse Managers may NOT, even if can_approve_inventory
// is true on their RoleRegistry record.
const OPENING_BALANCE_APPROVAL_ROLE_KEYS = new Set(['owner', 'director_of_operations']);

function canApproveOpeningBalance(roleKey) {
  return OPENING_BALANCE_APPROVAL_ROLE_KEYS.has(roleKey);
}

// ─── Test user detection ───
// Excludes test/demo users from production notification routing.
function isTestUser(employee) {
  if (!employee) return true;
  const name = `${employee.first_name || ''} ${employee.last_name || ''}`.toLowerCase();
  if (name.includes('test user') || name.includes('testuser') || name.includes(' test ')) return true;
  if (!employee.email || employee.email.trim() === '') return true;
  if (employee.email.toLowerCase().includes('test@')) return true;
  return false;
}

// ─── Approval eligibility for warehouse setup/opening-balance sessions ───
// Resolves through the active EmployeeRegistry → RoleRegistry relationship
// using the workflow-specific warehouse.setup.approve_opening_balance
// capability (Owner + Director of Operations only). Separates primary
// (Owner) from backup (Director of Operations). Excludes test users,
// disabled accounts, inactive employees, and the session submitter.
// base44_user_role: 'admin' is platform access only — NOT approval authority.
async function resolveEligibleApprovers(base44, submitterEmail, sessionDataClassification) {
  const isTestSession = ['test', 'demo_seed', 'superseded_test', 'demo', 'seed'].includes(sessionDataClassification);

  const approvalRoles = await base44.asServiceRole.entities.RoleRegistry.filter({
    status: 'Active',
    role_key: { $in: Array.from(OPENING_BALANCE_APPROVAL_ROLE_KEYS) },
  }, null, 20);

  const approvalRoleIds = approvalRoles.map(r => r.role_id).filter(Boolean);
  const approvalRoleNames = approvalRoles.map(r => r.role_name).filter(Boolean);

  if (approvalRoleIds.length === 0 && approvalRoleNames.length === 0) {
    return { primaryApprover: null, backupApprover: null, qualifyingRoles: [], isTestSession };
  }

  const roleMatchers = [];
  for (const name of approvalRoleNames) roleMatchers.push({ primary_role: name });
  for (const id of approvalRoleIds) roleMatchers.push({ primary_role: id });

  const employees = await base44.asServiceRole.entities.EmployeeRegistry.filter({
    employment_status: 'Active',
    $or: roleMatchers,
  }, null, 50);

  // Exclude: submitter (self-approval), test users, disabled accounts
  const lowerSubmitter = (submitterEmail || '').toLowerCase();
  const qualifiedApprovers = employees.filter(e =>
    e.email &&
    e.email.toLowerCase() !== lowerSubmitter &&
    !isTestUser(e) &&
    e.account_status !== 'Disabled' &&
    e.employment_status === 'Active'
  );

  const ownerRoles = approvalRoles.filter(r => r.role_key === 'owner');
  const ownerRoleIds = ownerRoles.map(r => r.role_id).filter(Boolean);
  const ownerRoleNames = ownerRoles.map(r => r.role_name).filter(Boolean);

  const directorRoles = approvalRoles.filter(r => r.role_key === 'director_of_operations');
  const directorRoleIds = directorRoles.map(r => r.role_id).filter(Boolean);
  const directorRoleNames = directorRoles.map(r => r.role_name).filter(Boolean);

  const primaryApprover = qualifiedApprovers.find(e =>
    (ownerRoleIds.includes(e.primary_role) || ownerRoleNames.includes(e.primary_role)) &&
    e.user_linked && e.account_status === 'Active'
  ) || qualifiedApprovers.find(e =>
    ownerRoleIds.includes(e.primary_role) || ownerRoleNames.includes(e.primary_role)
  ) || null;

  const backupApprover = qualifiedApprovers.find(e =>
    (directorRoleIds.includes(e.primary_role) || directorRoleNames.includes(e.primary_role)) &&
    e.user_linked && e.account_status === 'Active'
  ) || qualifiedApprovers.find(e =>
    directorRoleIds.includes(e.primary_role) || directorRoleNames.includes(e.primary_role)
  ) || null;

  return {
    primaryApprover,
    backupApprover,
    qualifyingRoles: approvalRoles.map(r => ({ role_id: r.role_id, role_name: r.role_name, role_key: r.role_key })),
    isTestSession,
  };
}

async function computeSessionMetrics(base44, session) {
  const counts = session.count_data_json ? JSON.parse(session.count_data_json) : {};
  const assignedIds = session.assigned_item_ids || [];

  const countedEntries = Object.entries(counts).filter(([, v]) =>
    v?.count !== undefined && v?.count !== '' && v?.count !== null
  );

  const totalQuantity = countedEntries.reduce((sum, [, v]) => sum + Number(v.count || 0), 0);

  let totalValue = 0;
  let zeroCountItems = [];
  let missingCounts = [];
  let missingBins = [];
  let photoCount = 0;

  if (assignedIds.length > 0) {
    const items = await base44.asServiceRole.entities.InventoryMaster.filter({
      id: { $in: assignedIds },
    }, null, 10000);

    const itemMap = new Map(items.map(i => [i.id, i]));

    for (const itemId of assignedIds) {
      const item = itemMap.get(itemId);
      if (!item) { missingCounts.push(itemId); continue; }

      const countEntry = counts[itemId];
      if (!countEntry || countEntry.count === undefined || countEntry.count === '' || countEntry.count === null) {
        missingCounts.push(item.item_name || itemId);
      } else {
        const qty = Number(countEntry.count);
        totalValue += qty * (item.unit_cost || 0);
        if (qty === 0) zeroCountItems.push(item.item_name || itemId);
      }

      if (!item.bin_location) missingBins.push(item.item_name || itemId);
      if (countEntry?.photo_ids && Array.isArray(countEntry.photo_ids)) photoCount += countEntry.photo_ids.length;
    }
  }

  return {
    countedItems: countedEntries.length,
    totalQuantity,
    totalValue: Math.round(totalValue * 100) / 100,
    zeroCountItems,
    missingCounts,
    missingBins,
    photoCount,
    assignedCount: assignedIds.length,
  };
}

async function generateApprovalTaskNumber(base44) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await base44.asServiceRole.entities.EnterpriseTask.filter(
      { task_number: { $regex: '^TSK-' } }, '-task_number', 1
    );
    let next = 1;
    if (existing.length > 0 && existing[0].task_number) {
      const match = String(existing[0].task_number).match(/TSK-(\d+)/);
      if (match) next = parseInt(match[1], 10) + 1;
    }
    const candidate = 'TSK-' + String(next).padStart(6, '0');
    const collision = await base44.asServiceRole.entities.EnterpriseTask.filter({ task_number: candidate }, null, 1);
    if (collision.length === 0) return candidate;
    await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
  }
  return 'TSK-' + String(Date.now()).slice(-6);
}

async function createApprovalHandoff(base44, session, submitterEmail) {
  const sessionId = session.id;
  const dedupKey = `${HANDOFF_DEDUP_PREFIX}:${sessionId}`;

  // ─── Check for existing approval task (dedup) ───
  const existingTasks = await base44.asServiceRole.entities.EnterpriseTask.filter({
    related_module: 'inventory_count_session',
    related_record_id: sessionId,
    task_type: 'Approval',
  }, null, 5);

  const activeTask = existingTasks.find(t => !['Completed', 'Canceled', 'Cancelled'].includes(t.status));

  // ─── Resolve eligible approvers (primary + backup) ───
  const { primaryApprover, backupApprover, isTestSession } = await resolveEligibleApprovers(
    base44, submitterEmail, session.data_classification
  );

  // ─── Compute session metrics for task description ───
  const metrics = await computeSessionMetrics(base44, session);

  const warehouseName = session.warehouse_location_name || 'Unknown';
  const sessionNumber = session.session_id || sessionId;
  const submittedAt = session.submitted_at || new Date().toISOString();
  const submitterShort = (submitterEmail || 'Unknown').split('@')[0];

  // ─── Skip production notifications for test/demo sessions ───
  if (isTestSession) {
    console.log(`[HANDOFF] Skipping production notifications for test-classified session ${sessionId}`);
    let task = activeTask;
    if (!task) {
      const taskNumber = await generateApprovalTaskNumber(base44);
      task = await base44.asServiceRole.entities.EnterpriseTask.create({
        task_number: taskNumber,
        task_id: taskNumber,
        title: `[TEST] Approve Warehouse Opening Count — ${warehouseName}`,
        description: `Test session — no production notifications sent.\n\nWarehouse: ${warehouseName}\nSession: ${sessionNumber}\nSubmitted by: ${submitterEmail}`,
        task_type: 'Approval',
        priority: 'Low',
        status: 'Awaiting Approval',
        assigned_employee_registry_id: primaryApprover?.id || null,
        assigned_to: primaryApprover ? `${primaryApprover.first_name} ${primaryApprover.last_name}` : null,
        assigned_to_email: primaryApprover?.email || null,
        assigned_to_linked_user_id: primaryApprover?.linked_user_id || null,
        assigned_role: primaryApprover?.primary_role || null,
        related_module: 'inventory_count_session',
        related_record_id: sessionId,
        related_route: `/warehouse/setup/${sessionId}`,
        source_module: 'inventory_count_session',
        source_record_id: sessionId,
        requires_approval: true,
        approval_role: 'Owner',
        created_by: submitterEmail,
        notes: `TEST SESSION — Dedup key: ${dedupKey}`,
      });
    }
    return { task, notifications: [], primaryApprover: primaryApprover ? { email: primaryApprover.email, name: `${primaryApprover.first_name} ${primaryApprover.last_name}` } : null, backupApprover: backupApprover ? { email: backupApprover.email, name: `${backupApprover.first_name} ${backupApprover.last_name}` } : null, dedupKey, metrics, isTestSession: true };
  }

  // ─── No eligible primary approver — create escalation ───
  if (!primaryApprover) {
    console.log(`[HANDOFF] No eligible primary approver for session ${sessionId} — creating escalation`);
    const escalationNotif = await base44.asServiceRole.entities.EnterpriseNotification.create({
      notification_id: 'NTF-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      title: 'ESCALATION: No eligible approver for warehouse opening count',
      message: `Session ${sessionNumber} for warehouse ${warehouseName} was submitted by ${submitterEmail}, but no active Owner or authorized Director of Operations was found to approve it. Please assign an eligible approver or reconfigure the Owner/Director role.`,
      notification_type: 'Critical',
      priority: 'Critical',
      status: 'Pending',
      source_module: 'inventory_count_session',
      source_record_id: sessionId,
      recipient_email: submitterEmail,
      recipient_name: submitterShort,
      delivery_methods: ['In-App'],
      requires_acknowledgment: true,
      is_archived: false,
      escalation_level: 1,
    });
    return { task: null, notifications: [{ id: escalationNotif.id, notification_id: escalationNotif.notification_id, recipient: submitterEmail, type: 'escalation' }], primaryApprover: null, backupApprover: null, dedupKey, metrics, escalation: true };
  }

  // ─── Create or reuse the approval task (ONE task, assigned to primary) ───
  let task = activeTask;
  if (!task) {
    const taskNumber = await generateApprovalTaskNumber(base44);

    const description = [
      `Warehouse: ${warehouseName}`,
      `Session: ${sessionNumber}`,
      `Submitted by: ${submitterEmail}`,
      `Submitted at: ${new Date(submittedAt).toLocaleString()}`,
      ``,
      `Item Summary:`,
      `  Assigned items: ${metrics.assignedCount}`,
      `  Counted items: ${metrics.countedItems}`,
      `  Total quantity: ${metrics.totalQuantity}`,
      `  Total inventory value: $${metrics.totalValue.toFixed(2)}`,
      metrics.zeroCountItems.length > 0 ? `  Zero-count items (${metrics.zeroCountItems.length}): ${metrics.zeroCountItems.join(', ')}` : `  Zero-count items: None`,
      metrics.missingCounts.length > 0 ? `  Missing counts (${metrics.missingCounts.length}): ${metrics.missingCounts.slice(0, 20).join(', ')}` : `  Missing counts: None`,
      metrics.missingBins.length > 0 ? `  Items missing bin (${metrics.missingBins.length}): ${metrics.missingBins.slice(0, 20).join(', ')}` : `  Missing bins: None`,
      `  Shelf photos: ${metrics.photoCount}`,
      ``,
      `Action Required: Owner or authorized Director must review and approve.`,
      `Direct link: /warehouse/setup/${sessionId}`,
    ].join('\n');

    task = await base44.asServiceRole.entities.EnterpriseTask.create({
      task_number: taskNumber,
      task_id: taskNumber,
      title: `Approve Warehouse Opening Count — ${warehouseName}`,
      description,
      task_type: 'Approval',
      priority: 'High',
      status: 'Awaiting Approval',
      assigned_employee_registry_id: primaryApprover.id,
      assigned_to: `${primaryApprover.first_name} ${primaryApprover.last_name}`,
      assigned_to_email: primaryApprover.email,
      assigned_to_linked_user_id: primaryApprover.linked_user_id || null,
      assigned_role: primaryApprover.primary_role,
      related_module: 'inventory_count_session',
      related_record_id: sessionId,
      related_route: `/warehouse/setup/${sessionId}?mode=approval`,
      source_module: 'inventory_count_session',
      source_record_id: sessionId,
      requires_approval: true,
      approval_role: 'Owner',
      created_by: submitterEmail,
      notes: `Dedup key: ${dedupKey}`,
    });

    console.log(`[HANDOFF] Created task ${task.task_number} for session ${sessionId} assigned to ${primaryApprover.email}`);
  }

  // ─── Create notifications: primary approver + backup only (NO duplicate tasks) ───
  const notificationRecipients = [
    { employee: primaryApprover, role: 'primary' },
    ...(backupApprover ? [{ employee: backupApprover, role: 'backup' }] : []),
  ];

  const createdNotifications = [];
  for (const { employee: approver, role: approverRole } of notificationRecipients) {
    const existingNotifs = await base44.asServiceRole.entities.EnterpriseNotification.filter({
      source_module: 'inventory_count_session',
      source_record_id: sessionId,
      notification_type: 'Approval Required',
      recipient_employee_registry_id: approver.id,
    }, null, 1);

    if (existingNotifs.length > 0) {
      createdNotifications.push({ id: existingNotifs[0].id, notification_id: existingNotifs[0].notification_id, recipient: approver.email, role: approverRole, already_existed: true });
      continue;
    }

    const notifMessage = approverRole === 'backup'
      ? `${submitterShort} submitted ${metrics.countedItems} items totaling ${metrics.totalQuantity} units for warehouse ${warehouseName}. You are receiving this as backup/oversight. The primary approval task has been assigned to the Owner.`
      : `${submitterShort} submitted ${metrics.countedItems} items totaling ${metrics.totalQuantity} units for warehouse ${warehouseName}. Owner or authorized Director must review and approve.`;

    const notification = await base44.asServiceRole.entities.EnterpriseNotification.create({
      notification_id: 'NTF-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      title: 'Warehouse opening count ready for approval',
      message: notifMessage,
      notification_type: 'Approval Required',
      priority: 'High',
      status: 'Pending',
      source_module: 'inventory_count_session',
      source_record_id: sessionId,
      recipient_employee_registry_id: approver.id,
      recipient_email: approver.email,
      recipient_name: `${approver.first_name} ${approver.last_name}`,
      recipient_user_id: approver.linked_user_id || null,
      recipient_role: approver.primary_role,
      recipient_department: approver.department || null,
      related_task: task.id,
      delivery_methods: ['In-App'],
      requires_acknowledgment: false,
      is_archived: false,
      escalation_level: 0,
    });

    createdNotifications.push({ id: notification.id, notification_id: notification.notification_id, recipient: approver.email, role: approverRole });
    console.log(`[HANDOFF] Created notification ${notification.notification_id} for ${approver.email} (${approverRole})`);
  }

  return {
    task,
    notifications: createdNotifications,
    primaryApprover: { email: primaryApprover.email, name: `${primaryApprover.first_name} ${primaryApprover.last_name}` },
    backupApprover: backupApprover ? { email: backupApprover.email, name: `${backupApprover.first_name} ${backupApprover.last_name}` } : null,
    dedupKey,
    metrics,
  };
}

async function resolveApproverIdentityByEmail(base44, approverEmail) {
  const approverEmps = await base44.asServiceRole.entities.EmployeeRegistry.filter({
    $or: [{ email: approverEmail }, { login_email: approverEmail }],
  }, null, 1);
  const emp = approverEmps[0] || null;
  return {
    resolved_by_employee_id: emp?.id || null,
    resolved_by_name: emp ? `${emp.first_name} ${emp.last_name}` : approverEmail,
  };
}

async function completeApprovalTask(base44, sessionId, approverEmail, resolutionType, resolutionDecision) {
  const rType = resolutionType || 'approved';
  const rDecision = resolutionDecision || 'Warehouse opening count approved';
  const now = new Date().toISOString();
  const approverIdentity = await resolveApproverIdentityByEmail(base44, approverEmail);

  const isApproval = rType === 'approved';
  const taskStatus = isApproval ? 'Completed' : 'Changes Requested';
  const taskApprovalStatus = isApproval ? 'Approved' : 'Changes Requested';

  // Find and complete the active approval task(s)
  const tasks = await base44.asServiceRole.entities.EnterpriseTask.filter({
    related_module: 'inventory_count_session',
    related_record_id: sessionId,
    task_type: 'Approval',
    status: { $nin: ['Completed', 'Canceled', 'Cancelled'] },
  }, null, 5);

  for (const task of tasks) {
    await base44.asServiceRole.entities.EnterpriseTask.update(task.id, {
      status: taskStatus,
      approved_by: isApproval ? approverEmail : null,
      approved_at: isApproval ? now : null,
      approved_date: isApproval ? now.split('T')[0] : null,
      approval_status: taskApprovalStatus,
      completed_at: isApproval ? now : null,
      completed_date: isApproval ? now.split('T')[0] : null,
      completion_summary: `Inventory count ${rType.replace(/_/g, ' ')} by ${approverEmail}`,
      updated_by: approverEmail,
    });
    console.log(`[HANDOFF] ${taskStatus} task ${task.task_number} for session ${sessionId}`);
  }

  // Resolve related notifications with proper lifecycle
  const notifs = await base44.asServiceRole.entities.EnterpriseNotification.filter({
    source_module: 'inventory_count_session',
    source_record_id: sessionId,
    notification_type: 'Approval Required',
    status: { $nin: ['Resolved', 'Expired', 'Cancelled'] },
  }, null, 20);

  for (const notif of notifs) {
    const preserveAck = notif.acknowledged_by && notif.acknowledged_by.toLowerCase() === (notif.recipient_email || '').toLowerCase();
    const update = {
      status: 'Resolved',
      resolved_at: now,
      resolved_by_employee_id: approverIdentity.resolved_by_employee_id,
      resolved_by_name: approverIdentity.resolved_by_name,
      resolution_type: rType,
      resolution_decision: rDecision,
      resolution_source_type: 'inventory_count_session',
      resolution_source_id: sessionId,
      is_archived: true,
      archived_at: now,
      archived_by: approverEmail,
    };
    if (!preserveAck) {
      update.acknowledged_by = null;
      update.acknowledged_date = null;
    }
    await base44.asServiceRole.entities.EnterpriseNotification.update(notif.id, update);
  }

  return { completedTasks: tasks.length, resolvedNotifications: notifs.length };
}

async function createCorrectionHandoff(base44, session, approverEmail, reason) {
  const sessionId = session.id;
  const submitterEmail = session.started_by;

  // Find the submitter's employee record
  const submitterEmployees = await base44.asServiceRole.entities.EmployeeRegistry.filter({
    $or: [{ email: submitterEmail }, { login_email: submitterEmail }],
  }, null, 1);
  const submitter = submitterEmployees[0];

  // Complete the original approval task + resolve notifications
  await completeApprovalTask(base44, sessionId, approverEmail, 'returned_for_correction', 'Warehouse opening count returned for correction');

  // Create a correction task for the submitter (dedup)
  const existingCorrection = await base44.asServiceRole.entities.EnterpriseTask.filter({
    related_module: 'inventory_count_session',
    related_record_id: sessionId,
    task_type: 'Corrective Action',
    status: { $nin: ['Completed', 'Canceled', 'Cancelled'] },
  }, null, 1);

  let correctionTask = existingCorrection[0];
  if (!correctionTask) {
    const taskNumber = await generateApprovalTaskNumber(base44);
    correctionTask = await base44.asServiceRole.entities.EnterpriseTask.create({
      task_number: taskNumber,
      task_id: taskNumber,
      title: `Correct Warehouse Count — ${session.warehouse_location_name || 'Unknown'}`,
      description: `Session ${session.session_id} was returned for correction by ${approverEmail}.\n\nReason: ${reason || 'No reason provided'}\n\nPlease review the counts, make corrections, and resubmit for review.\n\nDirect link: /warehouse/setup/${sessionId}`,
      task_type: 'Corrective Action',
      priority: 'High',
      status: 'Assigned',
      assigned_employee_registry_id: submitter?.id || null,
      assigned_to: submitter ? `${submitter.first_name} ${submitter.last_name}` : null,
      assigned_to_email: submitter?.email || submitterEmail,
      assigned_to_linked_user_id: submitter?.linked_user_id || null,
      assigned_role: submitter?.primary_role || null,
      related_module: 'inventory_count_session',
      related_record_id: sessionId,
      related_route: `/warehouse/setup/${sessionId}`,
      source_module: 'inventory_count_session',
      source_record_id: sessionId,
      created_by: approverEmail,
      notes: `Returned by ${approverEmail}: ${reason || 'No reason provided'}`,
    });
    console.log(`[HANDOFF] Created correction task ${correctionTask.task_number} for session ${sessionId}`);
  }

  // Create a notification for the submitter (dedup)
  if (submitter) {
    const existingNotif = await base44.asServiceRole.entities.EnterpriseNotification.filter({
      source_module: 'inventory_count_session',
      source_record_id: sessionId,
      notification_type: 'Warning',
      recipient_employee_registry_id: submitter.id,
    }, null, 1);

    if (existingNotif.length === 0) {
      await base44.asServiceRole.entities.EnterpriseNotification.create({
        notification_id: 'NTF-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        title: 'Warehouse count returned for correction',
        message: `${approverEmail} returned your count for ${session.warehouse_location_name || 'warehouse'} for correction. Reason: ${reason || 'No reason provided'}`,
        notification_type: 'Warning',
        priority: 'High',
        status: 'Pending',
        source_module: 'inventory_count_session',
        source_record_id: sessionId,
        recipient_employee_registry_id: submitter.id,
        recipient_email: submitter.email,
        recipient_name: `${submitter.first_name} ${submitter.last_name}`,
        recipient_user_id: submitter.linked_user_id || null,
        recipient_role: submitter.primary_role,
        related_task: correctionTask.id,
        delivery_methods: ['In-App'],
        requires_acknowledgment: false,
        is_archived: false,
        escalation_level: 0,
      });
      console.log(`[HANDOFF] Created correction notification for ${submitter.email}`);
    }
  }

  return { correctionTask };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;
    const roleKey = await resolveUserRole(base44, user);

    // ─── General access check: must have warehouse.inventory.count or warehouse.setup.manage ───
    if (!hasCapability(roleKey, 'warehouse.inventory.count') && !hasCapability(roleKey, 'warehouse.setup.manage')) {
      return Response.json({ error: 'You do not have permission to perform inventory count operations.' }, { status: 403 });
    }

    // ═══════════════════════════════════════════════════════════════
    // LOAD ACTIVE — find or create session for current user
    // ═══════════════════════════════════════════════════════════════
    if (action === 'load_active') {
      const sessions = await base44.asServiceRole.entities.InventoryCountSession.filter(
        { started_by: user.email, status: { $in: ['in_progress', 'awaiting_review', 'approved', 'posting', 'partially_posted'] } },
        '-updated_date', 1
      );

      if (sessions.length > 0) {
        const session = sessions[0];
        const counts = session.count_data_json ? JSON.parse(session.count_data_json) : {};
        return Response.json({ success: true, session, counts, has_unfinished: true });
      }

      // No unfinished session — wizard will call create_session explicitly
      return Response.json({ success: true, session: null, counts: {}, has_unfinished: false });
    }

    // ═══════════════════════════════════════════════════════════════
    // UPDATE STEP — session owner or admin only
    // ═══════════════════════════════════════════════════════════════
    if (action === 'update_step') {
      const { session_id, step } = body;
      const session = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

      if (session.started_by !== user.email && !hasCapability(roleKey, 'warehouse.setup.manage')) {
        return Response.json({ error: 'Only the session owner can update progress' }, { status: 403 });
      }

      const updated = await base44.asServiceRole.entities.InventoryCountSession.update(session_id, {
        current_step: step,
      });
      return Response.json({ success: true, session: updated });
    }

    // ═══════════════════════════════════════════════════════════════
    // SET WAREHOUSE — links session to a specific warehouse location
    // ═══════════════════════════════════════════════════════════════
    if (action === 'set_warehouse') {
      const { session_id, warehouse_location_id, warehouse_location_name } = body;
      const session = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

      if (session.started_by !== user.email && !hasCapability(roleKey, 'warehouse.setup.manage')) {
        return Response.json({ error: 'Only the session owner can set warehouse' }, { status: 403 });
      }

      const updated = await base44.asServiceRole.entities.InventoryCountSession.update(session_id, {
        warehouse_location_id,
        warehouse_location_name: warehouse_location_name || '',
      });
      return Response.json({ success: true, session: updated });
    }

    // ═══════════════════════════════════════════════════════════════
    // SELECT WAREHOUSE — validates active status, checks for duplicate
    // open sessions, blocks change if items assigned/counted without
    // explicit force_reset. Returns warehouse snapshot + duplicates.
    // ═══════════════════════════════════════════════════════════════
    if (action === 'select_warehouse') {
      const { session_id, warehouse_location_id, force_reset } = body;

      let warehouse;
      try {
        warehouse = await base44.asServiceRole.entities.WarehouseLocation.get(warehouse_location_id);
      } catch {
        return Response.json({ error: 'Warehouse not found' }, { status: 404 });
      }
      if (!warehouse) return Response.json({ error: 'Warehouse not found' }, { status: 404 });

      // Block inactive warehouses unless user has the separate reactivation permission.
      // warehouse.location.create does NOT grant reactivation rights.
      if (warehouse.is_active === false && !canReactivateWarehouse(roleKey)) {
        return Response.json({
          error: 'This warehouse is inactive. Reactivation requires the warehouse.location.reactivate permission, which is not granted by location creation rights.',
          warehouse_inactive: true,
        }, { status: 403 });
      }

      const session = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

      if (session.started_by !== user.email && !hasCapability(roleKey, 'warehouse.setup.manage')) {
        return Response.json({ error: 'Only the session owner can select a warehouse' }, { status: 403 });
      }

      // Only editable sessions can select/change warehouse
      if (!['in_progress'].includes(session.status)) {
        return Response.json({ error: `Session is not editable (status: ${session.status})` }, { status: 400 });
      }

      // Block change if session has items/counts (unless force_reset)
      const hasItems = (session.assigned_item_ids || []).length > 0;
      const counts = session.count_data_json ? JSON.parse(session.count_data_json) : {};
      const hasCounts = Object.keys(counts).filter(id =>
        counts[id]?.count !== undefined && counts[id]?.count !== '' && counts[id]?.count !== null
      ).length > 0;

      if (session.warehouse_location_id &&
          session.warehouse_location_id !== warehouse_location_id &&
          (hasItems || hasCounts) &&
          !force_reset) {
        return Response.json({
          error: 'Cannot change warehouse after items have been stocked or counted. This would invalidate all bin assignments.',
          has_assigned_items: hasItems,
          has_counts: hasCounts,
          requires_reset: true,
          current_warehouse_id: session.warehouse_location_id,
          current_warehouse_name: session.warehouse_location_name,
        }, { status: 409 });
      }

      const updateData = {
        warehouse_location_id,
        warehouse_location_name: warehouse.name,
      };

      if (force_reset && (hasItems || hasCounts)) {
        updateData.assigned_item_ids = [];
        updateData.count_data_json = '{}';
        updateData.no_materials_confirmed = false;
        console.log(`[SESSION AUDIT] user=${user.email} action=warehouse_reset session=${session_id} cleared_items=${hasItems} cleared_counts=${hasCounts}`);
      }

      // Check for duplicate open sessions on same warehouse
      const duplicateSessions = await base44.asServiceRole.entities.InventoryCountSession.filter({
        warehouse_location_id,
        status: { $in: ['in_progress', 'awaiting_review', 'approved'] },
        id: { $ne: session_id },
        data_classification: { $ne: 'test' },
      }, '-updated_date', 10);

      const updated = await base44.asServiceRole.entities.InventoryCountSession.update(session_id, updateData);

      console.log(`[SESSION AUDIT] user=${user.email} action=select_warehouse session=${session_id} warehouse="${warehouse.name}" reset=${!!force_reset} duplicates=${duplicateSessions.length}`);

      return Response.json({
        success: true,
        session: updated,
        warehouse: {
          id: warehouse.id,
          name: warehouse.name,
          location_code: warehouse.location_code,
          address: warehouse.address || '',
          city: warehouse.city || '',
          state: warehouse.state || '',
          is_active: warehouse.is_active !== false,
        },
        duplicate_sessions: duplicateSessions.map(s => ({
          session_id: s.session_id,
          id: s.id,
          status: s.status,
          started_by: s.started_by,
          started_at: s.started_at,
        })),
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // CHECK WAREHOUSE SESSION — checks for existing open sessions on a warehouse
    // ═══════════════════════════════════════════════════════════════
    if (action === 'check_warehouse_session') {
      const { warehouse_location_id, exclude_session_id } = body;

      const filter = {
        warehouse_location_id,
        status: { $in: ['in_progress', 'awaiting_review', 'approved'] },
        data_classification: { $ne: 'test' },
      };
      if (exclude_session_id) filter.id = { $ne: exclude_session_id };

      const existing = await base44.asServiceRole.entities.InventoryCountSession.filter(filter, '-updated_date', 10);

      return Response.json({
        success: true,
        has_existing: existing.length > 0,
        existing_sessions: existing.map(s => ({
          session_id: s.session_id,
          id: s.id,
          status: s.status,
          started_by: s.started_by,
          started_at: s.started_at,
          warehouse_location_name: s.warehouse_location_name,
        })),
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // RECORD ASSIGNMENTS — adds item IDs to session.assigned_item_ids
    // ═══════════════════════════════════════════════════════════════
    if (action === 'record_assignments') {
      const { session_id, item_ids } = body;
      const session = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

      if (session.started_by !== user.email && !hasCapability(roleKey, 'warehouse.setup.manage')) {
        return Response.json({ error: 'Only the session owner can record assignments' }, { status: 403 });
      }

      const existing = new Set(session.assigned_item_ids || []);
      (item_ids || []).forEach(id => existing.add(id));

      const updated = await base44.asServiceRole.entities.InventoryCountSession.update(session_id, {
        assigned_item_ids: Array.from(existing),
        no_materials_confirmed: false,
      });
      console.log(`[SESSION AUDIT] user=${user.email} action=record_assignments session=${session_id} added=${(item_ids || []).length} total=${existing.size}`);
      return Response.json({ success: true, session: updated });
    }

    // ═══════════════════════════════════════════════════════════════
    // CONFIRM NO MATERIALS — user explicitly confirms zero materials
    // ═══════════════════════════════════════════════════════════════
    if (action === 'confirm_no_materials') {
      const { session_id } = body;
      const session = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

      if (session.started_by !== user.email && !hasCapability(roleKey, 'warehouse.setup.manage')) {
        return Response.json({ error: 'Only the session owner can confirm no materials' }, { status: 403 });
      }

      const updated = await base44.asServiceRole.entities.InventoryCountSession.update(session_id, {
        no_materials_confirmed: true,
      });
      console.log(`[SESSION AUDIT] user=${user.email} action=confirm_no_materials session=${session_id}`);
      return Response.json({ success: true, session: updated });
    }

    // ═══════════════════════════════════════════════════════════════
    // SAVE COUNTS — session owner only; auto-revokes approval if changed
    // ═══════════════════════════════════════════════════════════════
    if (action === 'save_counts') {
      const { session_id, counts } = body;
      const session = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

      if (session.started_by !== user.email && !hasCapability(roleKey, 'warehouse.setup.manage')) {
        return Response.json({ error: 'Only the session owner can save counts' }, { status: 403 });
      }

      // Reject if activation has started
      if (['posting', 'partially_posted', 'completed'].includes(session.status)) {
        return Response.json({ error: 'Cannot save counts after activation has started' }, { status: 400 });
      }

      const update = { count_data_json: JSON.stringify(counts) };

      // Auto-revoke approval if counts changed after approval or submission
      if (session.status === 'approved' || session.status === 'awaiting_review') {
        update.status = 'in_progress';
        update.approved_by = null;
        update.approved_at = null;
        update.approval_snapshot_json = null;
        update.approval_count_hash = null;
        update.submitted_by = null;
        update.submitted_at = null;
        update.review_acknowledged = false;
        update.server_total_items = 0;
        update.server_total_quantity = 0;
        update.server_total_value = 0;
      }

      const updated = await base44.asServiceRole.entities.InventoryCountSession.update(session_id, update);
      return Response.json({ success: true, session: updated });
    }

    // ═══════════════════════════════════════════════════════════════
    // SUBMIT FOR REVIEW — idempotent: in_progress → awaiting_review.
    // Already-awaiting_review returns success (already_submitted: true).
    // Approved/posting/completed returns current workflow state.
    // Abandoned blocks with restore instructions.
    // ═══════════════════════════════════════════════════════════════
    if (action === 'submit_for_review') {
      const { session_id } = body;
      const session = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

      if (session.started_by !== user.email && !hasCapability(roleKey, 'warehouse.setup.manage')) {
        return Response.json({ error: 'Only the session owner can submit for review' }, { status: 403 });
      }

      // ─── Idempotent: already submitted — ensure handoff exists, return success ───
      if (session.status === 'awaiting_review') {
        console.log(`[BYPASS AUDIT] SUBMIT IDEMPOTENT user=${user.email} session=${session_id} already=awaiting_review`);
        let handoff = null;
        try {
          handoff = await createApprovalHandoff(base44, session, session.submitted_by || user.email);
        } catch (e) {
          console.error(`[HANDOFF ERROR] Idempotent handoff for ${session_id}: ${e.message}`);
        }
        return Response.json({ success: true, already_submitted: true, session, handoff });
      }

      // ─── Forward-only: session has advanced past submission ───
      if (['approved', 'posting', 'partially_posted', 'completed'].includes(session.status)) {
        console.log(`[BYPASS AUDIT] SUBMIT FORWARD user=${user.email} session=${session_id} status=${session.status}`);
        return Response.json({ success: true, already_submitted: true, session });
      }

      // ─── Abandoned/archived — cannot submit, must be restored ───
      if (session.status === 'abandoned') {
        return Response.json({
          error: 'This session has been archived and cannot be submitted. An Owner or Admin must restore it before submission.',
          session_archived: true,
        }, { status: 400 });
      }

      // ─── Only in_progress can transition to awaiting_review ───
      if (session.status !== 'in_progress') {
        return Response.json({ error: `Session must be in_progress to submit for review (current: ${session.status})` }, { status: 400 });
      }

      // ─── Session-scoped completeness validation ───
      // Only check items assigned in THIS session (session.assigned_item_ids),
      // not globally-assigned items from other sessions or warehouses.
      const counts = session.count_data_json ? JSON.parse(session.count_data_json) : {};
      const countedItemIds = new Set(Object.keys(counts).filter(id =>
        counts[id]?.count !== undefined && counts[id]?.count !== '' && counts[id]?.count !== null
      ));

      const sessionAssignedIds = session.assigned_item_ids || [];
      let missingItems = [];

      if (sessionAssignedIds.length > 0) {
        // Fetch only items assigned in this session
        const sessionItems = await base44.asServiceRole.entities.InventoryMaster.filter({
          id: { $in: sessionAssignedIds },
        }, null, 10000);
        missingItems = sessionItems.filter(item => !countedItemIds.has(item.id));
      } else if (!session.no_materials_confirmed) {
        return Response.json({
          error: 'No materials have been assigned for this warehouse setup. Please assign materials or confirm "No Materials" before submitting.',
        }, { status: 400 });
      }
      // If no_materials_confirmed and assigned_item_ids is empty, allow submission with 0 items

      if (missingItems.length > 0) {
        console.log(`[BYPASS AUDIT] SUBMIT BLOCKED user=${user.email} session=${session_id} missing=${missingItems.length}`);
        return Response.json({
          error: `Inventory count incomplete. ${missingItems.length} assigned item(s) have not been counted. Please complete the missing counts before submitting.`,
          missing_count: missingItems.length,
          missing_item_names: missingItems.slice(0, 20).map(i => i.item_name),
        }, { status: 400 });
      }

      const updated = await base44.asServiceRole.entities.InventoryCountSession.update(session_id, {
        status: 'awaiting_review',
        submitted_by: user.email,
        submitted_at: new Date().toISOString(),
      });
      console.log(`[BYPASS AUDIT] SUBMITTED user=${user.email} session=${session_id} items=${sessionAssignedIds.length}`);

      // ─── Create approval handoff (task + notifications) ───
      let handoff = null;
      try {
        handoff = await createApprovalHandoff(base44, updated, user.email);
      } catch (handoffErr) {
        console.error(`[HANDOFF ERROR] Failed for session ${session_id}: ${handoffErr.message}`);
      }
      return Response.json({ success: true, session: updated, handoff });
    }

    // ═══════════════════════════════════════════════════════════════
    // APPROVE — Owner/Admin only; prevents self-approval;
    // server-recalculates totals and snapshot
    // ═══════════════════════════════════════════════════════════════
    if (action === 'approve') {
      const { session_id } = body;

      if (!canApproveOpeningBalance(roleKey)) {
        console.log(`[BYPASS AUDIT] DENIED user=${user.email} role=${roleKey} action=session_approve session=${session_id}`);
        return Response.json({ error: 'Only the Owner or an authorized Director of Operations can approve opening-balance counts. Warehouse Managers may not approve warehouse setup sessions.' }, { status: 403 });
      }

      const session = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

      // ─── Separation of duties: prevent self-approval ───
      if (session.started_by === user.email || session.assigned_to === user.email) {
        console.log(`[BYPASS AUDIT] DENIED user=${user.email} action=self_approve session=${session_id} started_by=${session.started_by}`);
        return Response.json({ error: 'Cannot approve your own session. Separation of duties required.' }, { status: 403 });
      }

      if (session.status !== 'awaiting_review') {
        return Response.json({ error: 'Session must be submitted for review before approval' }, { status: 400 });
      }

      // ─── Server-side recalculation (never trust browser totals) ───
      const counts = session.count_data_json ? JSON.parse(session.count_data_json) : {};
      let calcResult;
      try {
        calcResult = await recalculateTotals(base44, counts);
      } catch (calcErr) {
        return Response.json({ error: 'Approval failed: ' + calcErr.message }, { status: 400 });
      }

      if (calcResult.totalItems === 0) {
        return Response.json({ error: 'No counted items to approve' }, { status: 400 });
      }

      const countHash = await hashCountData(counts);

      const updated = await base44.asServiceRole.entities.InventoryCountSession.update(session_id, {
        status: 'approved',
        approved_by: user.email,
        approved_at: new Date().toISOString(),
        approval_snapshot_json: JSON.stringify(calcResult.snapshot),
        approval_count_hash: countHash,
        review_acknowledged: true,
        server_total_items: calcResult.totalItems,
        server_total_quantity: calcResult.totalQty,
        server_total_value: calcResult.totalValue,
      });

      console.log(`[BYPASS AUDIT] user=${user.email} role=${roleKey} action=session_approve session=${session_id} items=${calcResult.totalItems} qty=${calcResult.totalQty} value=${calcResult.totalValue}`);

      // ─── Complete approval task + resolve notifications ───
      let taskResolution = null;
      try {
        taskResolution = await completeApprovalTask(base44, session_id, user.email);
      } catch (e) {
        console.error(`[HANDOFF ERROR] Failed to complete approval task for ${session_id}: ${e.message}`);
      }

      return Response.json({
        success: true,
        session: updated,
        server_calculated: {
          item_count: calcResult.totalItems,
          total_quantity: calcResult.totalQty,
          total_value: calcResult.totalValue,
        },
        task_resolution: taskResolution,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // REJECT — Owner/Admin only; reverts to in_progress
    // ═══════════════════════════════════════════════════════════════
    if (action === 'reject' || action === 'return_for_correction') {
      const { session_id, reason } = body;

      if (!hasCapability(roleKey, 'warehouse.setup.manage')) {
        console.log(`[BYPASS AUDIT] DENIED user=${user.email} role=${roleKey} action=session_return session=${session_id}`);
        return Response.json({ error: 'Only Owner/Admin can return sessions for correction' }, { status: 403 });
      }

      const session = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

      if (!['awaiting_review', 'approved'].includes(session.status)) {
        return Response.json({ error: 'Session must be awaiting review or approved to return for correction' }, { status: 400 });
      }

      const returnCount = (session.return_count || 0) + 1;
      const updated = await base44.asServiceRole.entities.InventoryCountSession.update(session_id, {
        status: 'in_progress',
        approved_by: null,
        approved_at: null,
        approval_snapshot_json: null,
        approval_count_hash: null,
        submitted_by: null,
        submitted_at: null,
        review_acknowledged: false,
        server_total_items: 0,
        server_total_quantity: 0,
        server_total_value: 0,
        return_reason: reason || 'Returned for correction',
        return_count: returnCount,
        returned_by: user.email,
        returned_at: new Date().toISOString(),
        notes: (session.notes || '') + `\n[Returned for correction #${returnCount} by ${user.email}: ${reason || 'No reason provided'}]`,
      });

      console.log(`[BYPASS AUDIT] user=${user.email} role=${roleKey} action=session_return session=${session_id} return_count=${returnCount}`);

      // ─── Complete approval task + create correction task/notification for submitter ───
      let correctionHandoff = null;
      try {
        correctionHandoff = await createCorrectionHandoff(base44, updated, user.email, reason);
      } catch (e) {
        console.error(`[HANDOFF ERROR] Failed to create correction handoff for ${session_id}: ${e.message}`);
      }

      return Response.json({ success: true, session: updated, correction_handoff: correctionHandoff });
    }

    // ═══════════════════════════════════════════════════════════════
    // ACTIVATE — Owner/Admin only; prevents self-activation;
    // requires approved + unchanged; processes sequentially;
    // verifies exactly one transaction per item; partial failure safe
    // ═══════════════════════════════════════════════════════════════
    if (action === 'activate') {
      const { session_id } = body;

      if (!hasCapability(roleKey, 'warehouse.setup.manage')) {
        console.log(`[BYPASS AUDIT] DENIED user=${user.email} role=${roleKey} action=session_activate session=${session_id}`);
        return Response.json({ error: 'Only Owner/Admin can activate inventory' }, { status: 403 });
      }

      const session = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

      // ─── Idempotency: completed sessions never re-process ───
      // Returns the existing activation results without creating any new transactions.
      if (session.status === 'completed') {
        const existingResults = session.activation_results_json ? JSON.parse(session.activation_results_json) : [];
        const successCount = existingResults.filter(r => r.success).length;
        const failedCount = existingResults.filter(r => !r.success).length;
        console.log(`[BYPASS AUDIT] ACTIVATE ALREADY_COMPLETED session=${session_id} user=${user.email} — returning existing results (${successCount} posted, ${failedCount} failed)`);
        return Response.json({
          success: true,
          session,
          results: existingResults,
          already_completed: true,
          summary: {
            total: existingResults.length,
            succeeded: successCount,
            failed: failedCount,
            all_posted: failedCount === 0 && successCount > 0,
          },
        });
      }

      // ─── Separation of duties: prevent self-activation ───
      if (session.started_by === user.email || session.assigned_to === user.email) {
        console.log(`[BYPASS AUDIT] DENIED user=${user.email} action=self_activate session=${session_id} started_by=${session.started_by}`);
        return Response.json({ error: 'Cannot activate your own session. Separation of duties required.' }, { status: 403 });
      }

      // ─── Require approved status ───
      if (session.status !== 'approved' && session.status !== 'partially_posted') {
        return Response.json({ error: 'Session must be approved before activation' }, { status: 400 });
      }

      // ─── Verify counts unchanged since approval (hash check) ───
      if (session.status === 'approved' && session.approval_count_hash) {
        const counts = session.count_data_json ? JSON.parse(session.count_data_json) : {};
        const currentHash = await hashCountData(counts);
        if (currentHash !== session.approval_count_hash) {
          console.log(`[BYPASS AUDIT] ACTIVATION REJECTED session=${session_id} reason=counts_changed_since_approval`);
          return Response.json({ error: 'Counts have changed since approval. Re-approval required.' }, { status: 400 });
        }
      }

      // ─── Load server-calculated approval snapshot ───
      const snapshot = session.approval_snapshot_json ? JSON.parse(session.approval_snapshot_json) : {};
      const snapshotItemIds = Object.keys(snapshot);

      if (snapshotItemIds.length === 0) {
        return Response.json({ error: 'No items in approved snapshot' }, { status: 400 });
      }

      // ─── Load existing activation results (for resume) ───
      const existingResults = session.activation_results_json ? JSON.parse(session.activation_results_json) : [];
      const postedItemIds = new Set(existingResults.filter(r => r.success).map(r => r.item_id));

      // ─── Mark session as posting ───
      await base44.asServiceRole.entities.InventoryCountSession.update(session_id, {
        status: 'posting',
        activated_by: user.email,
        activation_started_at: new Date().toISOString(),
      });

      console.log(`[BYPASS AUDIT] user=${user.email} role=${roleKey} action=session_activate session=${session_id} total_items=${snapshotItemIds.length} already_posted=${postedItemIds.size}`);

      // ─── Process items sequentially ───
      const results = [...existingResults.filter(r => r.success)];
      const itemsToProcess = snapshotItemIds.filter(id => !postedItemIds.has(id));

      for (const itemId of itemsToProcess) {
        const snap = snapshot[itemId];
        const result = {
          item_id: itemId,
          item_name: snap.item_name,
          count: snap.count,
          unit_cost: snap.unit_cost,
          idempotency_key: `${session_id}:${itemId}`,
          success: false,
          error: null,
          transaction_id: null,
          posted_at: null,
        };

        try {
          // ─── Idempotency: check for existing transaction ───
          const existing = await base44.asServiceRole.entities.InventoryTransaction.filter({
            source_document_id: session_id,
            inventory_master_id: itemId,
          }, null, 1);

          if (existing.length > 0) {
            result.success = true;
            result.transaction_id = existing[0].transaction_id;
            result.idempotent = true;
            result.posted_at = existing[0].transaction_date;
          } else {
            // ─── Process through the protected transaction function ───
            // processInventoryMasterTransaction has compensating rollback:
            //   audit record created FIRST, then inventory updated.
            //   If audit fails → inventory untouched.
            //   If inventory update fails → audit record deleted (rollback).
            const txnRes = await base44.functions.invoke('processInventoryMasterTransaction', {
              transaction_type: 'opening_balance',
              inventory_master_id: itemId,
              quantity: snap.count,
              destination_location: snap.bin_location || '',
              reason: 'Opening Balance — Warehouse Setup',
              notes: `Bin: ${snap.bin_location || 'N/A'} | Session: ${session_id}`,
              idempotency_key: `${session_id}:${itemId}`,
              count_session_id: session_id,
              unit_cost: snap.unit_cost,
            });

            const txnData = txnRes.data || txnRes;
            result.success = true;
            result.transaction_id = txnData.transaction_id;
            result.idempotent = txnData.idempotent;
            result.posted_at = new Date().toISOString();
          }
        } catch (e) {
          const errData = e.response?.data || e.data || {};
          result.error = errData.error || e.message || 'Unknown error';
        }

        results.push(result);
      }

      // ─── Verify: each successfully posted item has exactly one transaction ───
      for (const r of results.filter(r => r.success)) {
        const txns = await base44.asServiceRole.entities.InventoryTransaction.filter({
          source_document_id: session_id,
          inventory_master_id: r.item_id,
        }, null, 10);

        if (txns.length === 0) {
          // Audit-record failure left inventory unchanged — mark as failed
          console.error(`[SESSION AUDIT] Missing transaction for item ${r.item_id} in session ${session_id} — marking as failed`);
          r.success = false;
          r.error = 'Transaction record not found after posting — inventory unchanged';
          r.transaction_id = null;
        } else if (txns.length > 1) {
          console.error(`[SESSION AUDIT] Duplicate transaction detected for item ${r.item_id} in session ${session_id}: ${txns.length} transactions`);
        }
      }

      // ─── Determine final status ───
      const successCount = results.filter(r => r.success).length;
      const failedCount = results.filter(r => !r.success).length;
      const allSuccess = results.length > 0 && failedCount === 0;

      const updateData = {
        activation_results_json: JSON.stringify(results),
        activation_completed: allSuccess,
      };

      if (allSuccess) {
        updateData.status = 'completed';
        updateData.completed_at = new Date().toISOString();
      } else {
        updateData.status = 'partially_posted';
      }

      const updated = await base44.asServiceRole.entities.InventoryCountSession.update(session_id, updateData);

      console.log(`[BYPASS AUDIT] ACTIVATION ${allSuccess ? 'COMPLETE' : 'PARTIAL'} session=${session_id} user=${user.email} succeeded=${successCount} failed=${failedCount}`);

      return Response.json({
        success: true,
        session: updated,
        results,
        summary: {
          total: results.length,
          succeeded: successCount,
          failed: failedCount,
          all_posted: allSuccess,
        },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // REOPEN — Owner/Admin only; reopens a completed/partially_posted session
    // ═══════════════════════════════════════════════════════════════
    if (action === 'reopen') {
      const { session_id, reason } = body;

      if (!hasCapability(roleKey, 'warehouse.setup.manage')) {
        console.log(`[BYPASS AUDIT] DENIED user=${user.email} role=${roleKey} action=session_reopen session=${session_id}`);
        return Response.json({ error: 'Only Owner/Admin can reopen sessions' }, { status: 403 });
      }

      const session = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

      if (!['completed', 'partially_posted'].includes(session.status)) {
        return Response.json({ error: 'Session must be completed or partially posted to reopen' }, { status: 400 });
      }

      const updated = await base44.asServiceRole.entities.InventoryCountSession.update(session_id, {
        status: 'approved',
        activation_completed: false,
        completed_at: null,
        reopened_at: new Date().toISOString(),
        reopened_by: user.email,
        notes: (session.notes || '') + `\n[Reopened by ${user.email}: ${reason || 'No reason provided'}]`,
      });

      console.log(`[BYPASS AUDIT] user=${user.email} role=${roleKey} action=session_reopen session=${session_id} reason=${reason || 'none'}`);
      return Response.json({ success: true, session: updated });
    }

    // ═══════════════════════════════════════════════════════════════
    // ADD EVIDENCE — session owner or warehouse setup roles
    // Server-loads BinLocation by ID, verifies warehouse match,
    // verifies item belongs to session, resolves uploader identity,
    // creates a durable WarehouseSetupEvidence record.
    // ═══════════════════════════════════════════════════════════════
    if (action === 'add_evidence') {
      const { session_id, evidence_urls, evidence_notes, photo_type, bin_location_id, item_id, step_name, caption } = body;
      const session = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

      if (session.started_by !== user.email && !hasCapability(roleKey, 'warehouse.inventory.count')) {
        return Response.json({ error: 'Only the session owner or warehouse setup roles can add evidence' }, { status: 403 });
      }

      // ─── Evidence status enforcement (server-side) ───
      const BLOCKED_STATUSES = ['approved', 'posting', 'partially_posted', 'completed', 'abandoned'];
      if (BLOCKED_STATUSES.includes(session.status)) {
        return Response.json({
          error: `Evidence upload is blocked for sessions with status "${session.status}". An authorized Admin must reopen the session before evidence can be added.`,
          session_status: session.status,
          evidence_blocked: true,
        }, { status: 403 });
      }

      const isPostSubmission = session.status === 'awaiting_review';
      const timestamp = new Date().toISOString();

      // ─── Resolve uploader identity from EmployeeRegistry ───
      const uploaderEmployees = await base44.asServiceRole.entities.EmployeeRegistry.filter({
        $or: [{ email: user.email }, { login_email: user.email }],
      }, null, 1);
      const uploaderEmployee = uploaderEmployees[0] || null;

      const uploaderIdentity = {
        uploaded_by_user_id: user.id || null,
        uploaded_by_employee_id: uploaderEmployee?.id || null,
        uploaded_by_name: uploaderEmployee ? `${uploaderEmployee.first_name} ${uploaderEmployee.last_name}` : user.full_name || user.email,
        uploaded_by_email: uploaderEmployee?.email || user.email,
      };

      // ─── Server-load and verify BinLocation if bin_location_id provided ───
      let verifiedBin = null;
      if (bin_location_id) {
        try {
          verifiedBin = await base44.asServiceRole.entities.BinLocation.get(bin_location_id);
        } catch {
          return Response.json({
            error: 'Bin location not found for the provided bin_location_id.',
            bin_location_id,
            bin_not_found: true,
          }, { status: 400 });
        }
        if (!verifiedBin) {
          return Response.json({ error: 'Bin location not found.' }, { status: 400 });
        }

        // ─── Cross-warehouse rejection: bin must belong to session's warehouse ───
        if (verifiedBin.warehouse_location_id !== session.warehouse_location_id) {
          console.log(`[EVIDENCE AUDIT] CROSS_WAREHOUSE_REJECTED user=${user.email} session=${session_id} session_warehouse=${session.warehouse_location_id} bin_warehouse=${verifiedBin.warehouse_location_id} bin=${verifiedBin.bin_code}`);
          return Response.json({
            error: `Cross-warehouse evidence rejected. Bin "${verifiedBin.bin_code}" belongs to a different warehouse than the session.`,
            session_warehouse_id: session.warehouse_location_id,
            bin_warehouse_id: verifiedBin.warehouse_location_id,
            bin_code: verifiedBin.bin_code,
            cross_warehouse_rejected: true,
          }, { status: 403 });
        }
      }

      // ─── Verify item belongs to current session if item_id provided ───
      let verifiedItem = null;
      if (item_id) {
        const sessionAssignedIds = session.assigned_item_ids || [];
        if (!sessionAssignedIds.includes(item_id)) {
          return Response.json({
            error: 'Item does not belong to the current session. Evidence can only be associated with items assigned in this session.',
            item_id,
            assigned_item_count: sessionAssignedIds.length,
            item_not_in_session: true,
          }, { status: 400 });
        }

        try {
          verifiedItem = await base44.asServiceRole.entities.InventoryMaster.get(item_id);
        } catch {
          return Response.json({ error: 'Inventory item not found.' }, { status: 400 });
        }

        // ─── Verify item's current bin relationship if a bin was selected ───
        if (verifiedBin && verifiedItem.bin_location_id && verifiedItem.bin_location_id !== bin_location_id) {
          console.log(`[EVIDENCE AUDIT] ITEM_BIN_MISMATCH user=${user.email} session=${session_id} item=${item_id} item_bin=${verifiedItem.bin_location_id} selected_bin=${bin_location_id}`);
          return Response.json({
            error: `Item "${verifiedItem.item_name}" is currently assigned to a different bin than the selected bin. Please select the correct bin for this item.`,
            item_id,
            item_name: verifiedItem.item_name,
            item_current_bin_id: verifiedItem.bin_location_id,
            selected_bin_id: bin_location_id,
            item_bin_mismatch: true,
          }, { status: 400 });
        }
      }

      // ─── Generate evidence number ───
      let evidenceNumber = 'EVD-' + Date.now();
      try {
        const existingEvidence = await base44.asServiceRole.entities.WarehouseSetupEvidence.filter(
          { evidence_number: { $regex: '^EVD-' } }, '-evidence_number', 1
        );
        let next = 1;
        if (existingEvidence.length > 0 && existingEvidence[0].evidence_number) {
          const match = String(existingEvidence[0].evidence_number).match(/EVD-(\d+)/);
          if (match) next = parseInt(match[1], 10) + 1;
        }
        evidenceNumber = 'EVD-' + String(next).padStart(6, '0');
      } catch {}

      // ─── Create durable WarehouseSetupEvidence records ───
      const createdEvidence = [];
      for (const url of (evidence_urls || [])) {
        const evRecord = await base44.asServiceRole.entities.WarehouseSetupEvidence.create({
          evidence_number: evidenceNumber,
          session_id: session_id,
          file_url: url,
          photo_type: photo_type || 'other',
          warehouse_location_id: session.warehouse_location_id,
          warehouse_location_name: session.warehouse_location_name || '',
          bin_location_id: verifiedBin?.id || null,
          bin_code: verifiedBin?.bin_code || '',
          item_id: verifiedItem?.id || null,
          item_name: verifiedItem?.item_name || '',
          step_name: step_name || '',
          caption: caption || '',
          uploaded_by_user_id: uploaderIdentity.uploaded_by_user_id,
          uploaded_by_employee_id: uploaderIdentity.uploaded_by_employee_id,
          uploaded_by_name: uploaderIdentity.uploaded_by_name,
          uploaded_by_email: uploaderIdentity.uploaded_by_email,
          uploaded_at: timestamp,
          post_submission: isPostSubmission,
          session_status_at_upload: session.status,
        });
        createdEvidence.push({
          id: evRecord.id,
          evidence_number: evRecord.evidence_number,
          file_url: evRecord.file_url,
        });
      }

      // ─── Backward-compatible: also update session evidence arrays ───
      const newMetadata = (evidence_urls || []).map((url, idx) => ({
        file_url: url,
        evidence_id: createdEvidence[idx]?.id || null,
        evidence_number: createdEvidence[idx]?.evidence_number || null,
        photo_type: photo_type || 'other',
        warehouse_name: session.warehouse_location_name || '',
        warehouse_location_id: session.warehouse_location_id,
        bin_location_id: verifiedBin?.id || null,
        bin_code: verifiedBin?.bin_code || '',
        item_name: verifiedItem?.item_name || '',
        item_id: verifiedItem?.id || null,
        step_name: step_name || '',
        caption: caption || '',
        uploaded_by_user_id: uploaderIdentity.uploaded_by_user_id,
        uploaded_by_employee_id: uploaderIdentity.uploaded_by_employee_id,
        uploaded_by_name: uploaderIdentity.uploaded_by_name,
        uploaded_by_email: uploaderIdentity.uploaded_by_email,
        uploaded_at: timestamp,
        post_submission: isPostSubmission,
      }));

      let existingMetadata = [];
      try { existingMetadata = session.evidence_metadata_json ? JSON.parse(session.evidence_metadata_json) : []; } catch {}

      const existing = session.evidence_urls || [];
      const updated = await base44.asServiceRole.entities.InventoryCountSession.update(session_id, {
        evidence_urls: [...existing, ...(evidence_urls || [])],
        evidence_metadata_json: JSON.stringify([...existingMetadata, ...newMetadata]),
        notes: (session.notes || '') + (evidence_notes ? `\n[Evidence: ${evidence_notes}]` : ''),
      });

      console.log(`[BYPASS AUDIT] user=${user.email} role=${roleKey} action=add_evidence session=${session_id} files=${(evidence_urls || []).length} status=${session.status} post_submission=${isPostSubmission} bin_verified=${!!verifiedBin} item_verified=${!!verifiedItem} uploader_employee=${uploaderIdentity.uploaded_by_employee_id}`);

      // ─── For awaiting_review: notify primary + backup approvers only ───
      if (isPostSubmission) {
        try {
          const sessionSubmitter = session.submitted_by || session.started_by;
          const { primaryApprover, backupApprover, isTestSession } = await resolveEligibleApprovers(
            base44, sessionSubmitter, session.data_classification
          );

          if (isTestSession) {
            console.log(`[EVIDENCE] Skipping production post-submission notifications for test session ${session_id}`);
          } else {
            const recipients = [
              ...(primaryApprover ? [{ employee: primaryApprover, role: 'primary' }] : []),
              ...(backupApprover ? [{ employee: backupApprover, role: 'backup' }] : []),
            ];
            for (const { employee: approver } of recipients) {
              const existingNotif = await base44.asServiceRole.entities.EnterpriseNotification.filter({
                source_module: 'inventory_count_session',
                source_record_id: session_id,
                notification_type: 'Information',
                recipient_employee_registry_id: approver.id,
                title: 'Post-Submission Evidence Added',
              }, null, 1);

              if (existingNotif.length === 0) {
                await base44.asServiceRole.entities.EnterpriseNotification.create({
                  notification_id: 'NTF-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
                  title: 'Post-Submission Evidence Added',
                  message: `${uploaderIdentity.uploaded_by_name} added evidence to session ${session.session_id || session_id} after submission. Review the new evidence before approving.`,
                  notification_type: 'Information',
                  priority: 'Medium',
                  status: 'Pending',
                  source_module: 'inventory_count_session',
                  source_record_id: session_id,
                  recipient_employee_registry_id: approver.id,
                  recipient_email: approver.email,
                  recipient_name: `${approver.first_name} ${approver.last_name}`,
                  recipient_user_id: approver.linked_user_id || null,
                  recipient_role: approver.primary_role,
                  delivery_methods: ['In-App'],
                  requires_acknowledgment: false,
                  is_archived: false,
                  escalation_level: 0,
                });
              }
            }
            console.log(`[EVIDENCE] Post-submission evidence notification sent to ${recipients.length} approver(s) for session ${session_id} (primary + backup only)`);
          }
        } catch (e) {
          console.error(`[EVIDENCE] Failed to notify approvers: ${e.message}`);
        }
      }

      return Response.json({
        success: true,
        session: updated,
        evidence_records: createdEvidence,
        evidence_metadata: newMetadata,
        uploader_identity: uploaderIdentity,
        post_submission: isPostSubmission,
        bin_verified: verifiedBin ? { id: verifiedBin.id, bin_code: verifiedBin.bin_code, warehouse_location_id: verifiedBin.warehouse_location_id } : null,
        item_verified: verifiedItem ? { id: verifiedItem.id, item_name: verifiedItem.item_name, bin_location_id: verifiedItem.bin_location_id } : null,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // LIST SESSIONS — oversight roles; returns session summaries (read-only)
    // ═══════════════════════════════════════════════════════════════
    if (action === 'list_sessions') {
      if (!hasCapability(roleKey, 'warehouse.setup.manage')) {
        return Response.json({ error: 'Access denied. Oversight role required to list sessions.' }, { status: 403 });
      }

      const { status_filter, employee_filter, warehouse_filter } = body;
      const filter = {};
      if (status_filter) filter.status = status_filter;
      if (employee_filter) filter.started_by = employee_filter;
      if (warehouse_filter) filter.warehouse_location_id = warehouse_filter;

      const sessions = await base44.asServiceRole.entities.InventoryCountSession.filter(filter, '-created_date', 100);

      const summaries = sessions.map(s => ({
        id: s.id,
        session_id: s.session_id,
        status: s.status,
        started_by: s.started_by,
        assigned_to: s.assigned_to,
        submitted_by: s.submitted_by,
        submitted_at: s.submitted_at,
        approved_by: s.approved_by,
        approved_at: s.approved_at,
        activated_by: s.activated_by,
        activation_completed: s.activation_completed,
        started_at: s.started_at,
        completed_at: s.completed_at,
        server_total_items: s.server_total_items,
        server_total_quantity: s.server_total_quantity,
        server_total_value: s.server_total_value,
        current_step: s.current_step,
        warehouse_location_name: s.warehouse_location_name,
        return_count: s.return_count || 0,
        return_reason: s.return_reason,
        notes: s.notes,
      }));

      return Response.json({ success: true, sessions: summaries, count: summaries.length });
    }

    // ═══════════════════════════════════════════════════════════════
    // GET — load a specific session
    // ═══════════════════════════════════════════════════════════════
    if (action === 'get') {
      const { session_id } = body;
      const session = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });
      const counts = session.count_data_json ? JSON.parse(session.count_data_json) : {};
      return Response.json({ success: true, session, counts });
    }

    // ═══════════════════════════════════════════════════════════════
    // CREATE SESSION — creates a brand new session; optionally archives existing
    // ═══════════════════════════════════════════════════════════════
    if (action === 'create_session') {
      const { archive_existing_session_id } = body;

      if (archive_existing_session_id) {
        const existing = await base44.asServiceRole.entities.InventoryCountSession.get(archive_existing_session_id);
        if (!existing) return Response.json({ error: 'Session to archive not found' }, { status: 404 });

        if (existing.started_by !== user.email && !hasCapability(roleKey, 'warehouse.setup.manage')) {
          return Response.json({ error: 'Only the session owner can archive it' }, { status: 403 });
        }

        await base44.asServiceRole.entities.InventoryCountSession.update(archive_existing_session_id, {
          status: 'abandoned',
          notes: (existing.notes || '') + `\n[Archived by ${user.email} to start new setup]`,
        });
        console.log(`[SESSION AUDIT] user=${user.email} action=archive_and_new session=${archive_existing_session_id}`);
      }

      const newSession = await base44.asServiceRole.entities.InventoryCountSession.create({
        session_id: 'WSS-' + Date.now(),
        session_type: 'initial_inventory',
        status: 'in_progress',
        current_step: 0,
        started_by: user.email,
        assigned_to: user.email,
        review_acknowledged: false,
        activation_completed: false,
        count_data_json: '{}',
        activation_results_json: '[]',
        assigned_item_ids: [],
        bin_ids: [],
        no_materials_confirmed: false,
        started_at: new Date().toISOString(),
      });

      console.log(`[SESSION AUDIT] user=${user.email} action=create_session session=${newSession.id} archived=${archive_existing_session_id || 'none'}`);
      return Response.json({ success: true, session: newSession, counts: {} });
    }

    // ═══════════════════════════════════════════════════════════════
    // ARCHIVE SESSION — marks a session as abandoned (preserved for audit)
    // ═══════════════════════════════════════════════════════════════
    if (action === 'archive_session') {
      const { session_id } = body;
      const session = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

      if (session.started_by !== user.email && !hasCapability(roleKey, 'warehouse.setup.manage')) {
        return Response.json({ error: 'Only the session owner or admin can archive' }, { status: 403 });
      }

      if (session.status === 'completed') {
        return Response.json({ error: 'Cannot archive a completed session' }, { status: 400 });
      }

      const updated = await base44.asServiceRole.entities.InventoryCountSession.update(session_id, {
        status: 'abandoned',
        notes: (session.notes || '') + `\n[Archived by ${user.email}]`,
      });

      console.log(`[SESSION AUDIT] user=${user.email} action=archive session=${session_id}`);
      return Response.json({ success: true, session: updated });
    }

    // ═══════════════════════════════════════════════════════════════
    // DUPLICATE SESSION — creates a new session copying basic setup
    // ═══════════════════════════════════════════════════════════════
    if (action === 'duplicate_session') {
      const { session_id } = body;
      const source = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
      if (!source) return Response.json({ error: 'Session not found' }, { status: 404 });

      const newSession = await base44.asServiceRole.entities.InventoryCountSession.create({
        session_id: 'WSS-' + Date.now(),
        session_type: 'initial_inventory',
        status: 'in_progress',
        current_step: 0,
        started_by: user.email,
        assigned_to: user.email,
        review_acknowledged: false,
        activation_completed: false,
        count_data_json: '{}',
        activation_results_json: '[]',
        assigned_item_ids: [],
        bin_ids: [...(source.bin_ids || [])],
        no_materials_confirmed: false,
        warehouse_location_id: source.warehouse_location_id,
        warehouse_location_name: source.warehouse_location_name,
        started_at: new Date().toISOString(),
      });

      console.log(`[SESSION AUDIT] user=${user.email} action=duplicate source=${session_id} new=${newSession.id}`);
      return Response.json({ success: true, session: newSession, counts: {} });
    }

    // ═══════════════════════════════════════════════════════════════
    // DELETE SESSION — admin only; only draft or archived sessions
    // ═══════════════════════════════════════════════════════════════
    if (action === 'delete_session') {
      if (!hasCapability(roleKey, 'warehouse.setup.manage')) {
        return Response.json({ error: 'Only Owner/Admin can delete sessions' }, { status: 403 });
      }

      const { session_id } = body;
      const session = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

      if (!['in_progress', 'abandoned'].includes(session.status)) {
        return Response.json({ error: 'Can only delete draft or archived sessions' }, { status: 400 });
      }

      await base44.asServiceRole.entities.InventoryCountSession.delete(session_id);
      console.log(`[SESSION AUDIT] user=${user.email} action=delete session=${session_id} status=${session.status}`);
      return Response.json({ success: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // RESOLVE ACTIVATION EXCEPTION — marks a single failed activation
    // result as resolved so it stops appearing in the unresolved count.
    // ═══════════════════════════════════════════════════════════════
    if (action === 'resolve_activation_exception') {
      const { session_id, item_id, resolution_notes } = body;
      if (!hasCapability(roleKey, 'warehouse.setup.manage')) {
        return Response.json({ error: 'Only Owner/Admin can resolve activation exceptions' }, { status: 403 });
      }

      const session = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

      const results = session.activation_results_json ? JSON.parse(session.activation_results_json) : [];
      let found = false;
      for (const r of results) {
        if (!r.success && r.item_id === item_id) {
          r.resolved = true;
          r.resolved_at = new Date().toISOString();
          r.resolved_by = user.email;
          r.resolution_notes = resolution_notes || '';
          found = true;
          break;
        }
      }

      if (!found) {
        return Response.json({ error: 'Unresolved activation exception not found for that item' }, { status: 404 });
      }

      const updated = await base44.asServiceRole.entities.InventoryCountSession.update(session_id, {
        activation_results_json: JSON.stringify(results),
      });

      console.log(`[SESSION AUDIT] user=${user.email} action=resolve_exception session=${session_id} item=${item_id}`);
      return Response.json({ success: true, session: updated });
    }

    // ═══════════════════════════════════════════════════════════════
    // CLASSIFY SESSION — sets data_classification (production/test/superseded_test)
    // ═══════════════════════════════════════════════════════════════
    if (action === 'classify_session') {
      const { session_id, classification, reason } = body;
      if (!hasCapability(roleKey, 'warehouse.setup.manage')) {
        return Response.json({ error: 'Only Owner/Admin can classify sessions' }, { status: 403 });
      }

      const valid = ['production', 'test', 'superseded_test'];
      if (!valid.includes(classification)) {
        return Response.json({ error: 'Invalid classification: ' + classification }, { status: 400 });
      }

      const session = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

      const updated = await base44.asServiceRole.entities.InventoryCountSession.update(session_id, {
        data_classification: classification,
        classification_changed_by: user.email,
        classification_changed_at: new Date().toISOString(),
        classification_reason: reason || '',
        notes: (session.notes || '') + `\n[Classified as ${classification} by ${user.email}: ${reason || 'No reason provided'}]`,
      });

      console.log(`[SESSION AUDIT] user=${user.email} action=classify session=${session_id} classification=${classification}`);
      return Response.json({ success: true, session: updated });
    }

    // ═══════════════════════════════════════════════════════════════
    // START ANOTHER SESSION — creates a new session for a warehouse that
    // already has an open session. Requires explicit second confirmation
    // from the user. Records full audit: user, timestamp, warehouse,
    // existing session IDs, new session ID, and optional reason.
    // ═══════════════════════════════════════════════════════════════
    if (action === 'start_another_session') {
      const { warehouse_location_id, warehouse_location_name, existing_session_ids, reason } = body;

      if (!warehouse_location_id) {
        return Response.json({ error: 'warehouse_location_id is required' }, { status: 400 });
      }

      // Verify the warehouse exists
      let warehouse;
      try {
        warehouse = await base44.asServiceRole.entities.WarehouseLocation.get(warehouse_location_id);
      } catch {
        return Response.json({ error: 'Warehouse not found' }, { status: 404 });
      }
      if (!warehouse) return Response.json({ error: 'Warehouse not found' }, { status: 404 });

      // Block inactive warehouses (same reactivation permission as select_warehouse)
      if (warehouse.is_active === false && !canReactivateWarehouse(roleKey)) {
        return Response.json({
          error: 'This warehouse is inactive. Reactivation requires the warehouse.location.reactivate permission.',
          warehouse_inactive: true,
        }, { status: 403 });
      }

      const existingIds = Array.isArray(existing_session_ids) ? existing_session_ids : [];
      const timestamp = new Date().toISOString();
      const newSessionNumber = 'WSS-' + Date.now();

      const auditEntry = `\n[Dual Session Started] user=${user.email} timestamp=${timestamp} warehouse="${warehouse.name}" (id=${warehouse_location_id}) existing_session_ids=[${existingIds.join(', ')}] new_session_id=${newSessionNumber} reason=${(reason || 'No reason provided').trim()}`;

      const newSession = await base44.asServiceRole.entities.InventoryCountSession.create({
        session_id: newSessionNumber,
        session_type: 'initial_inventory',
        status: 'in_progress',
        current_step: 0,
        started_by: user.email,
        assigned_to: user.email,
        review_acknowledged: false,
        activation_completed: false,
        count_data_json: '{}',
        activation_results_json: '[]',
        assigned_item_ids: [],
        bin_ids: [],
        no_materials_confirmed: false,
        warehouse_location_id,
        warehouse_location_name: warehouse.name,
        started_at: timestamp,
        notes: auditEntry,
      });

      console.log(`[SESSION AUDIT] user=${user.email} action=start_another_session warehouse="${warehouse.name}" existing=[${existingIds.join(', ')}] new=${newSession.id} (${newSessionNumber}) reason=${(reason || 'none').trim()}`);

      return Response.json({ success: true, session: newSession, counts: {} });
    }

    // ═══════════════════════════════════════════════════════════════
    // SYNC TASK APPROVAL — detects a completed approval task for an
    // awaiting_review session and syncs the session to approved state.
    // This prevents desync when an approver completes the task from
    // the Task Center instead of using the wizard's Approve button.
    // ═══════════════════════════════════════════════════════════════
    if (action === 'sync_task_approval') {
      const { session_id } = body;
      const session = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

      // Only sync if the session is still awaiting_review
      if (session.status !== 'awaiting_review') {
        return Response.json({ success: true, session, synced: false, reason: `Session status is ${session.status}, not awaiting_review` });
      }

      // Check for a completed approval task
      const approvalTasks = await base44.asServiceRole.entities.EnterpriseTask.filter({
        related_module: 'inventory_count_session',
        related_record_id: session_id,
        task_type: 'Approval',
        status: 'Completed',
      }, null, 5);

      const completedTask = approvalTasks[0];
      if (!completedTask) {
        return Response.json({ success: true, session, synced: false, reason: 'No completed approval task found' });
      }

      // Server-side recalculation from count data
      const counts = session.count_data_json ? JSON.parse(session.count_data_json) : {};
      let calcResult;
      try {
        calcResult = await recalculateTotals(base44, counts);
      } catch (calcErr) {
        return Response.json({ error: 'Sync failed: ' + calcErr.message }, { status: 400 });
      }

      if (calcResult.totalItems === 0) {
        return Response.json({ success: true, session, synced: false, reason: 'No counted items to approve' });
      }

      const countHash = await hashCountData(counts);

      // Preserve the original approver + timestamp from the completed task
      const approverEmail = completedTask.approved_by || completedTask.assigned_to_email || 'Unknown';
      const approvedAt = completedTask.approved_at || completedTask.completed_at || new Date().toISOString();

      const updated = await base44.asServiceRole.entities.InventoryCountSession.update(session_id, {
        status: 'approved',
        approved_by: approverEmail,
        approved_at: approvedAt,
        approval_snapshot_json: JSON.stringify(calcResult.snapshot),
        approval_count_hash: countHash,
        review_acknowledged: true,
        server_total_items: calcResult.totalItems,
        server_total_quantity: calcResult.totalQty,
        server_total_value: calcResult.totalValue,
      });

      console.log(`[SYNC] user=${user.email} session=${session_id} synced_from_task=${completedTask.task_number} approver=${approverEmail} approved_at=${approvedAt}`);

      // Resolve related notifications
      const syncApproverIdentity = await resolveApproverIdentityByEmail(base44, approverEmail);
      const notifs = await base44.asServiceRole.entities.EnterpriseNotification.filter({
        source_module: 'inventory_count_session',
        source_record_id: session_id,
        notification_type: 'Approval Required',
        status: { $nin: ['Resolved', 'Expired', 'Cancelled'] },
      }, null, 20);

      for (const notif of notifs) {
        const preserveAck = notif.acknowledged_by && notif.acknowledged_by.toLowerCase() === (notif.recipient_email || '').toLowerCase();
        const update = {
          status: 'Resolved',
          resolved_at: approvedAt,
          resolved_by_employee_id: syncApproverIdentity.resolved_by_employee_id,
          resolved_by_name: syncApproverIdentity.resolved_by_name,
          resolution_type: 'approved',
          resolution_decision: 'Warehouse opening count approved',
          resolution_source_type: 'inventory_count_session',
          resolution_source_id: session_id,
          is_archived: true,
          archived_at: approvedAt,
          archived_by: approverEmail,
        };
        if (!preserveAck) {
          update.acknowledged_by = null;
          update.acknowledged_date = null;
        }
        await base44.asServiceRole.entities.EnterpriseNotification.update(notif.id, update);
      }

      return Response.json({ success: true, session: updated, synced: true, task_number: completedTask.task_number });
    }

    // ═══════════════════════════════════════════════════════════════
    // REPAIR APPROVAL HANDOFF — creates missing task/notifications
    // for an already-awaiting_review session. Idempotent and safe.
    // ═══════════════════════════════════════════════════════════════
    if (action === 'repair_approval_handoff') {
      const { session_id } = body;

      if (!hasCapability(roleKey, 'warehouse.setup.manage')) {
        return Response.json({ error: 'Only Owner/Admin can repair approval handoffs' }, { status: 403 });
      }

      const session = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

      if (session.status !== 'awaiting_review') {
        return Response.json({ error: `Session must be awaiting_review to repair handoff (current: ${session.status})` }, { status: 400 });
      }

      const handoff = await createApprovalHandoff(base44, session, session.submitted_by || session.started_by);
      console.log(`[HANDOFF] Repaired handoff for session ${session_id} by ${user.email}`);
      return Response.json({ success: true, handoff });
    }

    return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});