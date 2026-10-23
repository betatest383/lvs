/**
 * Task Search Functions — Server-side search/resolve functions for
 * RegistrySearchCombobox integration in the task creation form.
 *
 * Each function follows the signature:
 *   searchFn(query, page, filters) => { items, hasMore }
 *   resolveFn(ids) => { [id]: { label, secondary } }
 *
 * All searches are server-side, debounced, paginated, and exclude
 * archived records by default.
 */

import { base44 } from '@/api/base44Client';

const PAGE_SIZE = 20;

// ─── Helper: build regex query ──────────────────────────────────────────────
function buildSearchQuery(query, fields) {
  if (!query || !query.trim()) return {};
  const regex = { $regex: query, $options: 'i' };
  return { $or: fields.map(f => ({ [f]: regex })) };
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPLOYEES
// ═══════════════════════════════════════════════════════════════════════════
export async function searchEmployees(query, page, filters = {}) {
  const skip = (page || 0) * PAGE_SIZE;
  const searchQ = buildSearchQuery(query, [
    'first_name', 'last_name', 'preferred_name', 'email', 'login_email',
    'employee_id', 'primary_role', 'department',
  ]);
  const dbQuery = { ...searchQ };
  if (filters.excludeArchived !== false) dbQuery.employment_status = 'Active';
  if (filters.department) dbQuery.department = filters.department;
  if (filters.role) dbQuery.primary_role = filters.role;

  const records = await base44.entities.EmployeeRegistry.filter(dbQuery, '-created_date', PAGE_SIZE);
  return {
    items: records.map(e => ({
      id: e.id,
      label: `${e.preferred_name || e.first_name} ${e.last_name}`,
      secondary: `${e.employee_id} · ${e.primary_role || '—'} · ${e.department || '—'}`,
      employee: e,
    })),
    hasMore: records.length === PAGE_SIZE,
  };
}

export async function resolveEmployees(ids) {
  if (!ids?.length) return {};
  const records = await base44.entities.EmployeeRegistry.filter(
    { id: { $in: ids } }, null, ids.length
  );
  const resolved = {};
  for (const e of records) {
    resolved[e.id] = {
      label: `${e.preferred_name || e.first_name} ${e.last_name}`,
      secondary: `${e.employee_id} · ${e.primary_role || '—'} · ${e.department || '—'}`,
    };
  }
  return resolved;
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════════════════════════════════
export async function searchCustomers(query, page, filters = {}) {
  const searchQ = buildSearchQuery(query, [
    'first_name', 'last_name', 'name', 'email', 'phone', 'address',
    'customer_id', 'servicetitan_customer_id',
  ]);
  const dbQuery = { ...searchQ };
  if (filters.excludeArchived !== false) dbQuery.status = { $ne: 'Archived' };

  const records = await base44.entities.Customer.filter(dbQuery, '-created_date', PAGE_SIZE);
  return {
    items: records.map(c => ({
      id: c.id,
      label: c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || 'Unknown',
      secondary: [c.phone, c.email, c.customer_id].filter(Boolean).join(' · '),
    })),
    hasMore: records.length === PAGE_SIZE,
  };
}

export async function resolveCustomers(ids) {
  if (!ids?.length) return {};
  const records = await base44.entities.Customer.filter(
    { id: { $in: ids } }, null, ids.length
  );
  const resolved = {};
  for (const c of records) {
    resolved[c.id] = {
      label: c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || 'Unknown',
      secondary: [c.phone, c.email, c.customer_id].filter(Boolean).join(' · '),
    };
  }
  return resolved;
}

// ═══════════════════════════════════════════════════════════════════════════
// JOBS (filtered by customer)
// ═══════════════════════════════════════════════════════════════════════════
export async function searchJobs(query, page, filters = {}) {
  const searchQ = buildSearchQuery(query, [
    'job_number', 'title', 'address', 'job_type', 'status',
  ]);
  const dbQuery = { ...searchQ };
  if (filters.customerId) dbQuery.customer_id = filters.customerId;
  if (filters.excludeArchived !== false) dbQuery.status = { $ne: 'Archived' };

  const records = await base44.entities.Job.filter(dbQuery, '-created_date', PAGE_SIZE);
  return {
    items: records.map(j => ({
      id: j.id,
      label: j.job_number || j.title || 'Untitled Job',
      secondary: [j.address, j.job_type, j.status, j.date && new Date(j.date).toLocaleDateString()].filter(Boolean).join(' · '),
    })),
    hasMore: records.length === PAGE_SIZE,
  };
}

export async function resolveJobs(ids) {
  if (!ids?.length) return {};
  const records = await base44.entities.Job.filter(
    { id: { $in: ids } }, null, ids.length
  );
  const resolved = {};
  for (const j of records) {
    resolved[j.id] = {
      label: j.job_number || j.title || 'Untitled Job',
      secondary: [j.address, j.job_type, j.status].filter(Boolean).join(' · '),
    };
  }
  return resolved;
}

// ═══════════════════════════════════════════════════════════════════════════
// TRUCKS
// ═══════════════════════════════════════════════════════════════════════════
export async function searchTrucks(query, page, filters = {}) {
  const searchQ = buildSearchQuery(query, ['truck_number', 'truck_name', 'license_plate', 'vin']);
  const dbQuery = { ...searchQ };
  if (filters.excludeArchived !== false) dbQuery.status = { $ne: 'Archived' };

  const records = await base44.entities.TruckProfile.filter(dbQuery, '-created_date', PAGE_SIZE);
  return {
    items: records.map(t => ({
      id: t.id,
      label: t.truck_number || t.truck_name || 'Unknown Truck',
      secondary: [t.license_plate, t.status].filter(Boolean).join(' · '),
    })),
    hasMore: records.length === PAGE_SIZE,
  };
}

export async function resolveTrucks(ids) {
  if (!ids?.length) return {};
  const records = await base44.entities.TruckProfile.filter(
    { id: { $in: ids } }, null, ids.length
  );
  const resolved = {};
  for (const t of records) {
    resolved[t.id] = {
      label: t.truck_number || t.truck_name || 'Unknown Truck',
      secondary: [t.license_plate, t.status].filter(Boolean).join(' · '),
    };
  }
  return resolved;
}

// ═══════════════════════════════════════════════════════════════════════════
// EQUIPMENT
// ═══════════════════════════════════════════════════════════════════════════
export async function searchEquipment(query, page, filters = {}) {
  const searchQ = buildSearchQuery(query, ['asset_tag', 'equipment_name', 'serial_number', 'manufacturer', 'model']);
  const dbQuery = { ...searchQ };
  if (filters.excludeArchived !== false) dbQuery.status = { $ne: 'Archived' };

  const records = await base44.entities.EquipmentMaster.filter(dbQuery, '-created_date', PAGE_SIZE);
  return {
    items: records.map(e => ({
      id: e.id,
      label: e.equipment_name || e.asset_tag || 'Unknown Equipment',
      secondary: [e.asset_tag, e.manufacturer, e.model].filter(Boolean).join(' · '),
    })),
    hasMore: records.length === PAGE_SIZE,
  };
}

export async function resolveEquipment(ids) {
  if (!ids?.length) return {};
  const records = await base44.entities.EquipmentMaster.filter(
    { id: { $in: ids } }, null, ids.length
  );
  const resolved = {};
  for (const e of records) {
    resolved[e.id] = {
      label: e.equipment_name || e.asset_tag || 'Unknown Equipment',
      secondary: [e.asset_tag, e.manufacturer, e.model].filter(Boolean).join(' · '),
    };
  }
  return resolved;
}

// ═══════════════════════════════════════════════════════════════════════════
// SOPs
// ═══════════════════════════════════════════════════════════════════════════
export async function searchSOPs(query, page, filters = {}) {
  const searchQ = buildSearchQuery(query, ['sop_number', 'title', 'description', 'department']);
  const dbQuery = { ...searchQ };
  if (filters.excludeArchived !== false) dbQuery.status = { $nin: ['Archived', 'Retired'] };

  const records = await base44.entities.SopRegistry.filter(dbQuery, '-created_date', PAGE_SIZE);
  return {
    items: records.map(s => ({
      id: s.id,
      label: s.title || s.sop_number || 'Untitled SOP',
      secondary: [s.sop_number, s.department, s.status].filter(Boolean).join(' · '),
    })),
    hasMore: records.length === PAGE_SIZE,
  };
}

export async function resolveSOPs(ids) {
  if (!ids?.length) return {};
  const records = await base44.entities.SopRegistry.filter(
    { id: { $in: ids } }, null, ids.length
  );
  const resolved = {};
  for (const s of records) {
    resolved[s.id] = {
      label: s.title || s.sop_number || 'Untitled SOP',
      secondary: [s.sop_number, s.department, s.status].filter(Boolean).join(' · '),
    };
  }
  return resolved;
}

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOWS
// ═══════════════════════════════════════════════════════════════════════════
export async function searchWorkflows(query, page, filters = {}) {
  const searchQ = buildSearchQuery(query, ['workflow_number', 'name', 'description', 'department']);
  const dbQuery = { ...searchQ };
  if (filters.excludeArchived !== false) dbQuery.status = { $nin: ['Archived', 'Retired'] };

  const records = await base44.entities.WorkflowRegistry.filter(dbQuery, '-created_date', PAGE_SIZE);
  return {
    items: records.map(w => ({
      id: w.id,
      label: w.name || w.workflow_number || 'Untitled Workflow',
      secondary: [w.workflow_number, w.department, w.status].filter(Boolean).join(' · '),
    })),
    hasMore: records.length === PAGE_SIZE,
  };
}

export async function resolveWorkflows(ids) {
  if (!ids?.length) return {};
  const records = await base44.entities.WorkflowRegistry.filter(
    { id: { $in: ids } }, null, ids.length
  );
  const resolved = {};
  for (const w of records) {
    resolved[w.id] = {
      label: w.name || w.workflow_number || 'Untitled Workflow',
      secondary: [w.workflow_number, w.department, w.status].filter(Boolean).join(' · '),
    };
  }
  return resolved;
}

// ═══════════════════════════════════════════════════════════════════════════
// BUSINESS PROCESSES
// ═══════════════════════════════════════════════════════════════════════════
export async function searchBusinessProcesses(query, page, filters = {}) {
  const searchQ = buildSearchQuery(query, ['process_number', 'name', 'description', 'department']);
  const dbQuery = { ...searchQ };
  if (filters.excludeArchived !== false) dbQuery.status = { $nin: ['Archived', 'Retired'] };

  const records = await base44.entities.BusinessProcess.filter(dbQuery, '-created_date', PAGE_SIZE);
  return {
    items: records.map(b => ({
      id: b.id,
      label: b.name || b.process_number || 'Untitled Process',
      secondary: [b.process_number, b.department, b.status].filter(Boolean).join(' · '),
    })),
    hasMore: records.length === PAGE_SIZE,
  };
}

export async function resolveBusinessProcesses(ids) {
  if (!ids?.length) return {};
  const records = await base44.entities.BusinessProcess.filter(
    { id: { $in: ids } }, null, ids.length
  );
  const resolved = {};
  for (const b of records) {
    resolved[b.id] = {
      label: b.name || b.process_number || 'Untitled Process',
      secondary: [b.process_number, b.department, b.status].filter(Boolean).join(' · '),
    };
  }
  return resolved;
}

// ═══════════════════════════════════════════════════════════════════════════
// TRAINING
// ═══════════════════════════════════════════════════════════════════════════
export async function searchTraining(query, page, filters = {}) {
  const searchQ = buildSearchQuery(query, ['training_number', 'title', 'description', 'department']);
  const dbQuery = { ...searchQ };
  if (filters.excludeArchived !== false) dbQuery.status = { $nin: ['Retired', 'Archived'] };

  const records = await base44.entities.TrainingRegistry.filter(dbQuery, '-created_date', PAGE_SIZE);
  return {
    items: records.map(t => ({
      id: t.id,
      label: t.title || t.training_number || 'Untitled Training',
      secondary: [t.training_number, t.department, t.status].filter(Boolean).join(' · '),
    })),
    hasMore: records.length === PAGE_SIZE,
  };
}

export async function resolveTraining(ids) {
  if (!ids?.length) return {};
  const records = await base44.entities.TrainingRegistry.filter(
    { id: { $in: ids } }, null, ids.length
  );
  const resolved = {};
  for (const t of records) {
    resolved[t.id] = {
      label: t.title || t.training_number || 'Untitled Training',
      secondary: [t.training_number, t.department, t.status].filter(Boolean).join(' · '),
    };
  }
  return resolved;
}

// ═══════════════════════════════════════════════════════════════════════════
// CERTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════
export async function searchCertifications(query, page, filters = {}) {
  const searchQ = buildSearchQuery(query, ['certification_number', 'name', 'description', 'department']);
  const dbQuery = { ...searchQ };
  if (filters.excludeArchived !== false) dbQuery.status = { $nin: ['Retired', 'Archived'] };

  const records = await base44.entities.CertificationRegistry.filter(dbQuery, '-created_date', PAGE_SIZE);
  return {
    items: records.map(c => ({
      id: c.id,
      label: c.name || c.certification_number || 'Untitled Certification',
      secondary: [c.certification_number, c.department, c.status].filter(Boolean).join(' · '),
    })),
    hasMore: records.length === PAGE_SIZE,
  };
}

export async function resolveCertifications(ids) {
  if (!ids?.length) return {};
  const records = await base44.entities.CertificationRegistry.filter(
    { id: { $in: ids } }, null, ids.length
  );
  const resolved = {};
  for (const c of records) {
    resolved[c.id] = {
      label: c.name || c.certification_number || 'Untitled Certification',
      secondary: [c.certification_number, c.department, c.status].filter(Boolean).join(' · '),
    };
  }
  return resolved;
}

// ═══════════════════════════════════════════════════════════════════════════
// CORRECTIVE ACTIONS
// ═══════════════════════════════════════════════════════════════════════════
export async function searchCorrectiveActions(query, page, filters = {}) {
  const searchQ = buildSearchQuery(query, ['corrective_action_number', 'title', 'description']);
  const dbQuery = { ...searchQ };
  if (filters.excludeArchived !== false) dbQuery.status = { $nin: ['Closed', 'Archived', 'Cancelled'] };

  const records = await base44.entities.CorrectiveAction.filter(dbQuery, '-created_date', PAGE_SIZE);
  return {
    items: records.map(c => ({
      id: c.id,
      label: c.title || c.corrective_action_number || 'Untitled Corrective Action',
      secondary: [c.corrective_action_number, c.status, c.priority].filter(Boolean).join(' · '),
    })),
    hasMore: records.length === PAGE_SIZE,
  };
}

export async function resolveCorrectiveActions(ids) {
  if (!ids?.length) return {};
  const records = await base44.entities.CorrectiveAction.filter(
    { id: { $in: ids } }, null, ids.length
  );
  const resolved = {};
  for (const c of records) {
    resolved[c.id] = {
      label: c.title || c.corrective_action_number || 'Untitled Corrective Action',
      secondary: [c.corrective_action_number, c.status, c.priority].filter(Boolean).join(' · '),
    };
  }
  return resolved;
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPROVEMENT REQUESTS
// ═══════════════════════════════════════════════════════════════════════════
export async function searchImprovementRequests(query, page, filters = {}) {
  const searchQ = buildSearchQuery(query, ['request_number', 'title', 'description']);
  const dbQuery = { ...searchQ };
  if (filters.excludeArchived !== false) dbQuery.status = { $nin: ['Archived', 'Closed', 'Rejected'] };

  const records = await base44.entities.ImprovementRequest.filter(dbQuery, '-created_date', PAGE_SIZE);
  return {
    items: records.map(i => ({
      id: i.id,
      label: i.title || i.request_number || 'Untitled Improvement',
      secondary: [i.request_number, i.status, i.priority].filter(Boolean).join(' · '),
    })),
    hasMore: records.length === PAGE_SIZE,
  };
}

export async function resolveImprovementRequests(ids) {
  if (!ids?.length) return {};
  const records = await base44.entities.ImprovementRequest.filter(
    { id: { $in: ids } }, null, ids.length
  );
  const resolved = {};
  for (const i of records) {
    resolved[i.id] = {
      label: i.title || i.request_number || 'Untitled Improvement',
      secondary: [i.request_number, i.status, i.priority].filter(Boolean).join(' · '),
    };
  }
  return resolved;
}

// ═══════════════════════════════════════════════════════════════════════════
// ROLES (RoleRegistry — for approval/escalation selectors)
// ═══════════════════════════════════════════════════════════════════════════
export async function searchRoles(query, page, filters = {}) {
  const searchQ = buildSearchQuery(query, ['role_id', 'role_name', 'role_key', 'department']);
  const dbQuery = { ...searchQ };
  if (filters.excludeArchived !== false) dbQuery.status = 'Active';

  const records = await base44.entities.RoleRegistry.filter(dbQuery, 'sort_order', PAGE_SIZE);
  return {
    items: records.map(r => ({
      id: r.id,
      label: r.role_name || r.role_key || 'Unknown Role',
      secondary: [r.role_id, r.department, r.permission_level].filter(Boolean).join(' · '),
      role: r,
    })),
    hasMore: records.length === PAGE_SIZE,
  };
}

export async function resolveRoles(ids) {
  if (!ids?.length) return {};
  const records = await base44.entities.RoleRegistry.filter(
    { id: { $in: ids } }, null, ids.length
  );
  const resolved = {};
  for (const r of records) {
    resolved[r.id] = {
      label: r.role_name || r.role_key || 'Unknown Role',
      secondary: [r.role_id, r.department, r.permission_level].filter(Boolean).join(' · '),
    };
  }
  return resolved;
}

// ═══════════════════════════════════════════════════════════════════════════
// TASK TEMPLATES (for template selection in task creation)
// ═══════════════════════════════════════════════════════════════════════════
export async function searchTemplates(query, page, filters = {}) {
  const searchQ = buildSearchQuery(query, ['template_name', 'template_key', 'description']);
  const dbQuery = {
    ...searchQ,
    data_classification: { $ne: 'archived' },
  };
  // Only show Published/Approved for production use; Draft for authorized preview
  if (filters.includeDrafts) {
    dbQuery.status = { $in: ['Draft', 'In Review', 'Approved', 'Published'] };
  } else {
    dbQuery.status = { $in: ['Approved', 'Published'] };
  }
  // Optional category filter (free-text TaskTemplate.category — not a registry)
  if (filters.category) dbQuery.category = filters.category;

  const records = await base44.entities.TaskTemplate.filter(dbQuery, '-updated_date', PAGE_SIZE);
  return {
    items: records.map(t => ({
      id: t.id,
      label: `${t.template_name} (${t.template_number})`,
      secondary: `${t.department_name_snapshot || ''} — ${t.status} · v${t.version || 1}`,
      template: t,
    })),
    hasMore: records.length === PAGE_SIZE,
  };
}

export async function resolveTemplates(ids) {
  if (!ids?.length) return {};
  const records = await base44.entities.TaskTemplate.filter(
    { id: { $in: ids } }, null, ids.length
  );
  const resolved = {};
  for (const t of records) {
    resolved[t.id] = {
      label: `${t.template_name} (${t.template_number})`,
      secondary: `${t.department_name_snapshot || ''} — ${t.status} · v${t.version || 1}`,
    };
  }
  return resolved;
}

/**
 * Distinct template categories for the category-filter dropdown.
 * Uses the free-text TaskTemplate.category field (NOT the MasterClassification registry).
 * Returns a sorted string[] of distinct categories from active (non-archived) templates.
 */
export async function fetchTemplateCategories(includeDrafts = false) {
  const dbQuery = {
    data_classification: { $ne: 'archived' },
    status: includeDrafts
      ? { $in: ['Draft', 'In Review', 'Approved', 'Published'] }
      : { $in: ['Approved', 'Published'] },
  };
  const records = await base44.entities.TaskTemplate.filter(dbQuery, 'category', 200);
  const seen = new Set();
  const cats = [];
  for (const t of records) {
    if (t.category && !seen.has(t.category)) {
      seen.add(t.category);
      cats.push(t.category);
    }
  }
  return cats.sort();
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPLOYEES BY ROLE (for approval role — show eligible approvers)
// ═══════════════════════════════════════════════════════════════════════════
export async function searchEmployeesByRole(query, page, filters = {}) {
  const searchQ = buildSearchQuery(query, [
    'first_name', 'last_name', 'preferred_name', 'email', 'login_email', 'employee_id',
  ]);
  const dbQuery = { ...searchQ, employment_status: 'Active' };
  if (filters.roleId) dbQuery.primary_role = filters.roleId;
  if (filters.roleKey) dbQuery.primary_role = { $regex: filters.roleKey, $options: 'i' };

  const records = await base44.entities.EmployeeRegistry.filter(dbQuery, '-created_date', PAGE_SIZE);
  return {
    items: records.map(e => ({
      id: e.id,
      label: `${e.preferred_name || e.first_name} ${e.last_name}`,
      secondary: `${e.employee_id} · ${e.primary_role || '—'} · ${e.department || '—'}`,
      employee: e,
    })),
    hasMore: records.length === PAGE_SIZE,
  };
}

export async function resolveEmployeesByRole(ids) {
  return resolveEmployees(ids);
}