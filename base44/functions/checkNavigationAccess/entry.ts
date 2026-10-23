import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const PROTECTED_ROUTES = ['/', '/admin/role-portal-manager', '/profile'];

function normalizeRoleName(raw) {
  if (!raw) return '';
  return String(raw).trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Step 1: Authenticate the caller — NEVER trust a caller-supplied role
    const authUser = await base44.auth.me();
    if (!authUser) return Response.json({ allowed: false, reason: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { route, action, user_email, _test_user_email } = body;
    const requestedAction = action || 'view';

    // Resolve the user email to evaluate:
    // - _test_user_email: admin-only testing override (simulates another user's identity)
    // - user_email: passed from another authenticated backend function (inter-function call)
    // - authUser.email: the authenticated user's own email (default)
    // The ROLE is NEVER accepted from the caller — it is always resolved internally.
    let effectiveEmail;
    let isTestMode = false;

    if (_test_user_email && (authUser.role === 'admin' || authUser.role === 'owner')) {
      effectiveEmail = _test_user_email;
      isTestMode = true;
    } else if (user_email) {
      effectiveEmail = user_email;
    } else {
      effectiveEmail = authUser.email;
    }

    const authenticatedUserId = isTestMode ? '(test-simulation)' : authUser.id;

    // Step 2: Resolve the linked Employee record by email
    const employees = await base44.asServiceRole.entities.EmployeeRegistry.filter({
      $or: [
        { email: effectiveEmail },
        { login_email: effectiveEmail }
      ]
    });
    const employee = employees[0];

    if (!employee) {
      // No employee record — admin/owner bypass, otherwise deny
      if (authUser.role === 'admin' || authUser.role === 'owner') {
        return Response.json({
          authenticated_user_id: authenticatedUserId,
          canonical_role_key: authUser.role,
          requested_resource: route,
          requested_action: requestedAction,
          allowed: true,
          permission_source: 'admin_bypass',
          reason: 'Admin/Owner bypass (no employee record)'
        });
      }
      await logAuthEvent(base44, {
        user_id: authenticatedUserId, user_email: effectiveEmail,
        canonical_role_key: null, route, action: requestedAction,
        allowed: false, permission_source: 'no_employee_record',
        reason: 'No employee record found for authenticated user'
      });
      return Response.json({
        authenticated_user_id: authenticatedUserId,
        canonical_role_key: null,
        requested_resource: route,
        requested_action: requestedAction,
        allowed: false,
        permission_source: 'no_employee_record',
        reason: 'No employee record found for authenticated user'
      });
    }

    // Step 3: Resolve the canonical role key from RoleRegistry
    let canonicalRoleKey = null;
    let portalAccessMode = 'inherited';
    let roleRegistryId = null;

    if (employee.primary_role) {
      const roleRecords = await base44.asServiceRole.entities.RoleRegistry.filter({
        $or: [
          { role_key: employee.primary_role },
          { role_name: employee.primary_role },
          { role_id: employee.primary_role }
        ]
      });
      const roleRecord = roleRecords[0];
      if (roleRecord) {
        // Normalize role_key: if not explicitly set, derive from role_name (e.g. "Warehouse Manager" → "warehouse_manager")
        canonicalRoleKey = roleRecord.role_key || normalizeRoleName(roleRecord.role_name);
        portalAccessMode = roleRecord.portal_access_mode || 'inherited';
        roleRegistryId = roleRecord.id;
      }
    }

    if (!canonicalRoleKey) {
      if (authUser.role === 'admin' || authUser.role === 'owner') {
        return Response.json({
          authenticated_user_id: authenticatedUserId,
          canonical_role_key: authUser.role,
          requested_resource: route,
          requested_action: requestedAction,
          allowed: true,
          permission_source: 'admin_bypass',
          reason: 'Admin/Owner bypass (role unresolved from employee record)'
        });
      }
      await logAuthEvent(base44, {
        user_id: authenticatedUserId, user_email: effectiveEmail,
        canonical_role_key: null, route, action: requestedAction,
        allowed: false, permission_source: 'unresolved_role',
        reason: 'Could not resolve canonical role from employee record',
        employee_id: employee.id
      });
      return Response.json({
        authenticated_user_id: authenticatedUserId,
        canonical_role_key: null,
        requested_resource: route,
        requested_action: requestedAction,
        allowed: false,
        permission_source: 'unresolved_role',
        reason: 'Could not resolve canonical role from employee record'
      });
    }

    // Step 4: Admin/Owner canonical roles always have full access (cannot be locked out)
    if (canonicalRoleKey === 'admin' || canonicalRoleKey === 'owner') {
      return Response.json({
        authenticated_user_id: authenticatedUserId,
        canonical_role_key: canonicalRoleKey,
        requested_resource: route,
        requested_action: requestedAction,
        allowed: true,
        permission_source: 'admin_bypass',
        reason: 'Admin/Owner bypass'
      });
    }

    // Protected routes are always accessible
    if (PROTECTED_ROUTES.includes(route)) {
      return Response.json({
        authenticated_user_id: authenticatedUserId,
        canonical_role_key: canonicalRoleKey,
        requested_resource: route,
        requested_action: requestedAction,
        allowed: true,
        permission_source: 'protected_route',
        reason: 'Protected route'
      });
    }

    // Step 5: Get the latest published portal configuration for this canonical role
    const records = await base44.asServiceRole.entities.NavigationVisibilityOverride.filter({
      role: canonicalRoleKey,
      status: 'published',
      is_active: true,
    }, '-published_at', 1);

    const published = records[0];
    let overrides = [];
    if (published?.overrides_json) {
      try { overrides = JSON.parse(published.overrides_json); } catch {}
    }

    const routeOverride = overrides.find(o => o.route === route);

    // Step 6: Evaluate access based on portal_access_mode + visibility + action permissions
    let allowed = false;
    let reason = '';
    let permissionSource = '';

    if (portalAccessMode === 'explicit_allowlist') {
      // Deny by default — only explicitly 'visible' routes are accessible
      if (routeOverride?.visibility === 'visible') {
        // Check action-level permission
        if (routeOverride.actions && typeof routeOverride.actions === 'object') {
          allowed = routeOverride.actions[requestedAction] === true;
          reason = allowed
            ? 'Action permitted by explicit allowlist'
            : `Action '${requestedAction}' not permitted for route ${route}`;
          permissionSource = 'explicit_allowlist_action_check';
        } else {
          // No action restrictions defined — allow all actions for this route
          allowed = true;
          reason = 'Allowed (explicit allowlist, no action restrictions)';
          permissionSource = 'explicit_allowlist';
        }
      } else {
        allowed = false;
        reason = `Route ${route} not in explicit allowlist for role ${canonicalRoleKey}`;
        permissionSource = 'explicit_allowlist_denied';
      }
    } else {
      // Inherited mode: allow unless explicitly disabled
      if (routeOverride?.visibility === 'access_disabled') {
        allowed = false;
        reason = `Access Disabled for route ${route}`;
        permissionSource = 'inherited_disabled';
      } else if (routeOverride?.visibility === 'coming_soon') {
        allowed = false;
        reason = `Coming Soon — access blocked for route ${route}`;
        permissionSource = 'inherited_coming_soon';
      } else {
        // Check action-level permission if defined
        if (routeOverride?.actions && typeof routeOverride.actions === 'object') {
          allowed = routeOverride.actions[requestedAction] === true;
          reason = allowed
            ? 'Action permitted (inherited)'
            : `Action '${requestedAction}' not permitted for route ${route}`;
          permissionSource = 'inherited_action_check';
        } else {
          allowed = true;
          reason = 'Allowed (inherited)';
          permissionSource = 'inherited';
        }
      }
    }

    // Step 7: Log to authorization audit (full details preserved, not exposed in response)
    await logAuthEvent(base44, {
      user_id: authenticatedUserId,
      user_email: effectiveEmail,
      canonical_role_key: canonicalRoleKey,
      role_registry_id: roleRegistryId,
      employee_id: employee.id,
      route,
      action: requestedAction,
      allowed,
      permission_source: permissionSource,
      reason,
      portal_access_mode: portalAccessMode,
      portal_config_id: published?.id,
      is_test: isTestMode,
      timestamp: new Date().toISOString()
    });

    // Return sanitized response — no employee ID, role registry ID, or portal config ID
    return Response.json({
      authenticated_user_id: authenticatedUserId,
      canonical_role_key: canonicalRoleKey,
      requested_resource: route,
      requested_action: requestedAction,
      allowed,
      permission_source: permissionSource,
      reason
    });
  } catch (error) {
    return Response.json({ allowed: false, reason: error.message });
  }
});

// Module-level helper — logs authorization events to AutomationRunLog
async function logAuthEvent(base44, details) {
  try {
    await base44.asServiceRole.entities.AutomationRunLog.create({
      log_id: `NAV-AUTH-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      log_type: 'event',
      source_module: 'navigation_access_control',
      trigger_event: 'access_check',
      related_record_id: details.route,
      status: details.allowed ? 'success' : 'failed',
      conditions_met: details.allowed,
      execution_trace_json: JSON.stringify(details),
      triggered_by: details.user_email || 'unknown',
    });
  } catch {}
}