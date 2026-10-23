import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Enterprise User Identity Resolution Service
 *
 * Called on every login. Searches EmployeeRegistry by:
 *   1. linked_user_id
 *   2. login_email
 *   3. email
 *
 * If found by login_email or email but linked_user_id is missing,
 * auto-links the user to that employee record.
 *
 * If found: updates login metadata, returns the employee record.
 * If not found: returns { linked: false } so the frontend can show
 * "Account Pending Administrator Assignment" or redirect admins to
 * the Link User wizard.
 *
 * Returns resolution_debug with the full identity chain for the
 * Developer Panel.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const now = new Date().toISOString();
    let matchMethod = 'none';
    let employees = null;

    // 1. Search by linked_user_id
    employees = await base44.asServiceRole.entities.EmployeeRegistry.filter(
      { linked_user_id: user.id }, '-updated_date', 1
    );
    if (employees && employees.length > 0) {
      matchMethod = 'linked_user_id';
    }

    // 2. Search by login_email
    if (!employees || employees.length === 0) {
      employees = await base44.asServiceRole.entities.EmployeeRegistry.filter(
        { login_email: user.email }, '-updated_date', 1
      );
      if (employees && employees.length > 0) {
        matchMethod = 'login_email';
      }
    }

    // 3. Search by email
    if (!employees || employees.length === 0) {
      employees = await base44.asServiceRole.entities.EmployeeRegistry.filter(
        { email: user.email }, '-updated_date', 1
      );
      if (employees && employees.length > 0) {
        matchMethod = 'email';
      }
    }

    if (employees && employees.length > 0) {
      const emp = employees[0];

      // Don't reactivate disabled accounts
      if (emp.account_status === 'Disabled') {
        return Response.json({
          linked: true,
          disabled: true,
          employee: emp,
          user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
          resolution_debug: {
            auth_user_id: user.id,
            auth_email: user.email,
            match_method: matchMethod,
            employee_record_id: emp.id,
            employee_id: emp.employee_id,
            linked_user_id: emp.linked_user_id,
            auto_linked: false,
            account_status: emp.account_status,
            note: 'Account is disabled — no auto-link or status update performed.',
          },
        });
      }

      // Auto-link if linked_user_id is missing but we matched by email
      const needsAutoLink = !emp.linked_user_id && (matchMethod === 'login_email' || matchMethod === 'email');

      const updateData = {
        last_login: now,
        last_activity: now,
        account_status: 'Active' as const,
      };

      if (needsAutoLink) {
        updateData.linked_user_id = user.id;
        updateData.login_email = user.email;
        updateData.user_linked = true;
        updateData.link_date = now;
        updateData.invitation_status = 'Linked';
      } else {
        // Always keep these in sync
        updateData.linked_user_id = user.id;
        updateData.login_email = user.email;
        updateData.user_linked = true;
      }

      await base44.asServiceRole.entities.EmployeeRegistry.update(emp.id, updateData);

      const updatedEmp = { ...emp, ...updateData };

      return Response.json({
        linked: true,
        disabled: false,
        employee: updatedEmp,
        user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
        resolution_debug: {
          auth_user_id: user.id,
          auth_email: user.email,
          match_method: matchMethod,
          employee_record_id: emp.id,
          employee_id: emp.employee_id,
          linked_user_id: updatedEmp.linked_user_id,
          auto_linked: needsAutoLink,
          account_status: updatedEmp.account_status,
          note: needsAutoLink
            ? 'Auto-linked: linked_user_id was missing, matched by email, now linked.'
            : 'Normal resolution: linked_user_id matched or already set.',
        },
      });
    }

    // No employee record found
    return Response.json({
      linked: false,
      disabled: false,
      employee: null,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
      resolution_debug: {
        auth_user_id: user.id,
        auth_email: user.email,
        match_method: 'none',
        employee_record_id: null,
        employee_id: null,
        linked_user_id: null,
        auto_linked: false,
        account_status: null,
        note: 'No EmployeeRegistry record found by linked_user_id, login_email, or email.',
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});