// ═══════════════════════════════════════════════════════════════════════════
// Shared helpers for TaskTemplate management.
// Used by: base44/functions/manageTaskTemplate/entry.ts
//          base44/functions/importTaskTemplates/entry.ts
// Plain module — no Deno.serve, no default export. Imported by backend functions.
// ═══════════════════════════════════════════════════════════════════════════

export function normalizeRole(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw).trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

export async function resolveEmployee(base44, user) {
  const employees = await base44.asServiceRole.entities.EmployeeRegistry.filter({
    $or: [{ email: user.email }, { login_email: user.email }, { linked_user_id: user.id }],
  }, null, 5);
  const emp = employees[0];
  let roleKey = normalizeRole(user.role);
  if (emp?.primary_role && emp.primary_role.startsWith('ROLE-')) {
    try {
      const roles = await base44.asServiceRole.entities.RoleRegistry.filter({ role_id: emp.primary_role }, null, 1);
      if (roles[0]) roleKey = roles[0].role_key || normalizeRole(roles[0].role_name || '');
    } catch { /* ignore */ }
  }
  const employeeName = emp
    ? ((emp.preferred_name || emp.first_name || '') + ' ' + (emp.last_name || '')).trim()
    : (user.full_name || user.email);
  return { employee: emp, roleKey, employeeName, employeeId: emp?.id || '' };
}

export async function generateTemplateNumber(base44): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await base44.asServiceRole.entities.TaskTemplate.filter(
      { template_number: { $regex: '^TPL-' } }, '-template_number', 1
    );
    let next = 1;
    if (existing.length > 0 && existing[0].template_number) {
      const match = String(existing[0].template_number).match(/TPL-(\d+)/);
      if (match) next = parseInt(match[1], 10) + 1;
    }
    const candidate = 'TPL-' + String(next).padStart(6, '0');
    const collision = await base44.asServiceRole.entities.TaskTemplate.filter({ template_number: candidate }, null, 1);
    if (collision.length === 0) return candidate;
    await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
  }
  return 'TPL-' + String(Date.now()).slice(-6);
}

export function canManageTemplates(roleKey: string): boolean {
  return ['admin', 'owner', 'director_of_operations'].includes(roleKey);
}

export function canPublishTemplates(roleKey: string): boolean {
  return ['admin', 'owner'].includes(roleKey);
}