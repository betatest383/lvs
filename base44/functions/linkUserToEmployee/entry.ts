import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Enterprise User Linking Service — Admin Only
 *
 * Actions:
 *   link    — Link an existing EmployeeRegistry record to a Base44 user
 *   create  — Create a new EmployeeRegistry record and link it to a Base44 user
 *   unlink  — Remove the user link from an EmployeeRegistry record
 *   disable — Set account_status to 'Disabled'
 *   enable  — Set account_status to 'Active'
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json();
    const { action } = body;
    const now = new Date().toISOString();

    switch (action) {
      case 'link': {
        const { employee_id, user_id, user_email } = body;
        if (!employee_id || !user_id) {
          return Response.json({ error: 'employee_id and user_id are required' }, { status: 400 });
        }

        const emps = await base44.asServiceRole.entities.EmployeeRegistry.filter(
          { employee_id }, '-updated_date', 1
        );
        if (!emps || emps.length === 0) {
          return Response.json({ error: 'Employee not found' }, { status: 404 });
        }
        const emp = emps[0];

        // Check if user_id is already linked to a different employee
        const existing = await base44.asServiceRole.entities.EmployeeRegistry.filter(
          { linked_user_id: user_id }, '-updated_date', 5
        );
        if (existing && existing.length > 0) {
          for (const ex of existing) {
            if (ex.id !== emp.id) {
              await base44.asServiceRole.entities.EmployeeRegistry.update(ex.id, {
                linked_user_id: '',
                login_email: '',
                user_linked: false,
              });
            }
          }
        }

        await base44.asServiceRole.entities.EmployeeRegistry.update(emp.id, {
          linked_user_id: user_id,
          login_email: user_email || '',
          user_linked: true,
          link_date: now,
          account_status: 'Active',
        });

        return Response.json({ success: true, employee_id: emp.employee_id });
      }

      case 'create': {
        const { user_id, user_email, first_name, last_name, primary_role, department, default_dashboard, default_landing_page } = body;
        if (!user_id || !user_email) {
          return Response.json({ error: 'user_id and user_email are required' }, { status: 400 });
        }

        // Check if user is already linked
        const existing = await base44.asServiceRole.entities.EmployeeRegistry.filter(
          { linked_user_id: user_id }, '-updated_date', 1
        );
        if (existing && existing.length > 0) {
          return Response.json({ error: 'User is already linked to an employee', employee_id: existing[0].employee_id }, { status: 409 });
        }

        // Generate employee_id
        const allEmps = await base44.asServiceRole.entities.EmployeeRegistry.list('-created_date', 1);
        const maxNum = allEmps && allEmps.length > 0
          ? Math.max(11, parseInt(allEmps[0].employee_id?.replace('EMP-', '') || '11', 10))
          : 11;
        const newEmpNum = String(maxNum + 1).padStart(3, '0');

        const newEmp = await base44.asServiceRole.entities.EmployeeRegistry.create({
          employee_id: `EMP-${newEmpNum}`,
          first_name: first_name || '',
          last_name: last_name || '',
          email: user_email,
          login_email: user_email,
          linked_user_id: user_id,
          primary_role: primary_role || '',
          department: department || '',
          user_linked: true,
          link_date: now,
          last_login: now,
          account_status: 'Active',
          employment_status: 'Active',
          employment_type: 'Full Time',
          base44_user_role: 'user',
          default_dashboard: default_dashboard || '',
          default_landing_page: default_landing_page || '',
        });

        return Response.json({ success: true, employee_id: newEmp.employee_id, id: newEmp.id });
      }

      case 'unlink': {
        const { employee_id } = body;
        if (!employee_id) return Response.json({ error: 'employee_id required' }, { status: 400 });

        const emps = await base44.asServiceRole.entities.EmployeeRegistry.filter(
          { employee_id }, '-updated_date', 1
        );
        if (!emps || emps.length === 0) {
          return Response.json({ error: 'Employee not found' }, { status: 404 });
        }

        await base44.asServiceRole.entities.EmployeeRegistry.update(emps[0].id, {
          linked_user_id: '',
          login_email: '',
          user_linked: false,
        });

        return Response.json({ success: true });
      }

      case 'disable': {
        const { employee_id } = body;
        if (!employee_id) return Response.json({ error: 'employee_id required' }, { status: 400 });

        const emps = await base44.asServiceRole.entities.EmployeeRegistry.filter(
          { employee_id }, '-updated_date', 1
        );
        if (!emps || emps.length === 0) {
          return Response.json({ error: 'Employee not found' }, { status: 404 });
        }

        await base44.asServiceRole.entities.EmployeeRegistry.update(emps[0].id, {
          account_status: 'Disabled',
        });

        return Response.json({ success: true });
      }

      case 'enable': {
        const { employee_id } = body;
        if (!employee_id) return Response.json({ error: 'employee_id required' }, { status: 400 });

        const emps = await base44.asServiceRole.entities.EmployeeRegistry.filter(
          { employee_id }, '-updated_date', 1
        );
        if (!emps || emps.length === 0) {
          return Response.json({ error: 'Employee not found' }, { status: 404 });
        }

        await base44.asServiceRole.entities.EmployeeRegistry.update(emps[0].id, {
          account_status: 'Active',
        });

        return Response.json({ success: true });
      }

      default:
        return Response.json({ error: `Invalid action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});