import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Enterprise Impersonation Service — Start
 *
 * Creates an audit log entry when an admin begins impersonating an employee.
 * Admin-only: verifies user.role === 'admin'.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json();
    const { employee_id, reason, write_actions_allowed, session_id } = body;

    if (!employee_id || !reason) {
      return Response.json({ error: 'employee_id and reason are required' }, { status: 400 });
    }

    // Look up the employee
    const emps = await base44.asServiceRole.entities.EmployeeRegistry.filter(
      { employee_id }, '-created_date', 1
    );
    if (!emps || emps.length === 0) {
      return Response.json({ error: 'Employee not found' }, { status: 404 });
    }
    const emp = emps[0];

    if (emp.account_status === 'Disabled') {
      return Response.json({ error: 'Cannot impersonate a disabled account' }, { status: 400 });
    }

    // Generate log_id
    const allLogs = await base44.asServiceRole.entities.ImpersonationLog.list('-created_date', 1);
    const maxNum = allLogs && allLogs.length > 0
      ? Math.max(0, parseInt(allLogs[0].log_id?.replace('IMP-', '') || '0', 10))
      : 0;
    const newLogNum = String(maxNum + 1).padStart(6, '0');

    const now = new Date().toISOString();

    // Extract IP from headers
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '';

    const log = await base44.asServiceRole.entities.ImpersonationLog.create({
      log_id: `IMP-${newLogNum}`,
      admin_user_id: user.id,
      admin_name: user.full_name || user.email,
      admin_email: user.email,
      impersonated_employee_id: emp.employee_id,
      impersonated_employee_name: `${emp.first_name} ${emp.last_name}`.trim(),
      impersonated_employee_email: emp.email || emp.login_email || '',
      impersonated_role: emp.primary_role || '',
      impersonated_department: emp.department || '',
      start_time: now,
      reason,
      status: 'active',
      ip_address: ip,
      session_id: session_id || '',
      write_actions_allowed: !!write_actions_allowed,
      actions_performed: '[]',
    });

    return Response.json({
      success: true,
      log_id: log.log_id,
      employee: {
        employee_id: emp.employee_id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        email: emp.email || emp.login_email || '',
        primary_role: emp.primary_role || '',
        department: emp.department || '',
        default_dashboard: emp.default_dashboard || '',
        default_landing_page: emp.default_landing_page || '',
        account_status: emp.account_status || 'Active',
        linked_user_id: emp.linked_user_id || '',
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});