import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

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
  // If role not recognized, try RoleRegistry lookup by role_key, role_name, or role_id
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

function normalize(str) {
  return String(str || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, data, record_id } = body;
    const roleKey = await resolveUserRole(base44, user);

    // ─── Action-specific capability check ───
    const requiredCapability = action === 'list' ? 'warehouse.setup.view' : 'warehouse.location.create';
    if (!hasCapability(roleKey, requiredCapability)) {
      const errorMsg = action === 'list'
        ? 'You do not have permission to view warehouse locations.'
        : 'You do not have permission to create or update warehouse locations.';
      console.log(`[BYPASS AUDIT] DENIED user=${user.email} role=${roleKey} action=manageWarehouseLocation_${action}`);
      return Response.json({ error: errorMsg }, { status: 403 });
    }

    const normalizedName = normalize(data.name);
    const normalizedCode = normalize(data.location_code || data.name);

    // ─── DUPLICATE CHECK (case-insensitive, trimmed) ───
    if (action === 'create') {
      const allLocs = await base44.asServiceRole.entities.WarehouseLocation.list('-created_date', 500);
      const dupCode = allLocs.find(l => normalize(l.location_code) === normalizedCode);
      if (dupCode) {
        return Response.json({
          error: 'This warehouse location code already exists.',
          field: 'location_code',
          value: data.location_code,
          existing_id: dupCode.id,
        }, { status: 409 });
      }

      const dupName = allLocs.find(l => normalize(l.name) === normalizedName);
      if (dupName) {
        return Response.json({
          error: 'This warehouse location name already exists.',
          field: 'name',
          value: data.name,
          existing_id: dupName.id,
        }, { status: 409 });
      }

      const created = await base44.asServiceRole.entities.WarehouseLocation.create({
        name: data.name.trim(),
        location_code: (data.location_code || '').trim() || data.name.trim().toUpperCase().replace(/\s+/g, '-'),
        location_type: data.location_type || 'warehouse',
        is_active: data.is_active !== false,
        notes: (data.notes || '').trim(),
      });
      console.log(`[BYPASS AUDIT] user=${user.email} role=${roleKey} action=manageWarehouseLocation CREATE id=${created.id}`);
      return Response.json({ success: true, location: created });

    } else if (action === 'update') {
      if (!record_id) return Response.json({ error: 'record_id is required for update' }, { status: 400 });

      // Check duplicates excluding current record (JS-based for case-insensitivity)
      const allLocsForUpdate = await base44.asServiceRole.entities.WarehouseLocation.list('-created_date', 500);
      if (data.location_code) {
        const normCode = normalize(data.location_code);
        const dupCode = allLocsForUpdate.find(l => l.id !== record_id && normalize(l.location_code) === normCode);
        if (dupCode) {
          return Response.json({ error: 'Duplicate location code', field: 'location_code', value: data.location_code }, { status: 409 });
        }
      }
      if (data.name) {
        const dupName = allLocsForUpdate.find(l => l.id !== record_id && normalize(l.name) === normalizedName);
        if (dupName) {
          return Response.json({ error: 'Duplicate location name', field: 'name', value: data.name }, { status: 409 });
        }
      }

      const updateData = {};
      if (data.name) updateData.name = data.name.trim();
      if (data.location_code) updateData.location_code = data.location_code.trim();
      if (data.location_type) updateData.location_type = data.location_type;
      if (data.is_active !== undefined) updateData.is_active = data.is_active;
      if (data.notes !== undefined) updateData.notes = data.notes.trim();

      const updated = await base44.asServiceRole.entities.WarehouseLocation.update(record_id, updateData);
      console.log(`[BYPASS AUDIT] user=${user.email} role=${roleKey} action=manageWarehouseLocation UPDATE id=${record_id}`);
      return Response.json({ success: true, location: updated });

    } else if (action === 'list') {
      const locations = await base44.asServiceRole.entities.WarehouseLocation.list('-created_date', 500);
      return Response.json({ success: true, locations });
    } else {
      return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});