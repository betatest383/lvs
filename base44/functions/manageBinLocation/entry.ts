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
    const requiredCapability = action === 'list' ? 'warehouse.setup.view' : 'warehouse.bin.create';
    if (!hasCapability(roleKey, requiredCapability)) {
      const errorMsg = action === 'list'
        ? 'You do not have permission to view bin locations.'
        : 'You do not have permission to create or update bin locations.';
      console.log(`[BYPASS AUDIT] DENIED user=${user.email} role=${roleKey} action=manageBinLocation_${action}`);
      return Response.json({ error: errorMsg }, { status: 403 });
    }

    // ─── VALIDATE warehouse location exists ───
    if (action === 'create' || (action === 'update' && data.warehouse_location_id)) {
      const locId = data.warehouse_location_id;
      if (!locId) {
        return Response.json({ error: 'warehouse_location_id is required' }, { status: 400 });
      }
      let loc;
      try {
        loc = await base44.asServiceRole.entities.WarehouseLocation.get(locId);
      } catch {
        return Response.json({ error: 'Warehouse location not found', warehouse_location_id: locId }, { status: 404 });
      }
      if (!loc) {
        return Response.json({ error: 'Warehouse location not found', warehouse_location_id: locId }, { status: 404 });
      }
      data.warehouse_location_name = loc.name;
    }

    // ─── VALIDATE aisle/rack/shelf/bin ───
    if (action === 'create') {
      if (!data.aisle && !data.rack && !data.shelf && !data.bin) {
        return Response.json({ error: 'At least one bin component (aisle, rack, shelf, or bin) is required' }, { status: 400 });
      }
    }

    const binCode = data.bin_code;

    // ─── DUPLICATE CHECK (case-insensitive) ───
    if (action === 'create') {
      const normCode = normalize(binCode);
      const allBins = await base44.asServiceRole.entities.BinLocation.list('-created_date', 500);
      const dup = allBins.find(b => normalize(b.bin_code) === normCode);
      if (dup) {
        return Response.json({
          error: `Bin ${binCode} already exists.`,
          field: 'bin_code',
          value: binCode,
          existing_id: dup.id,
        }, { status: 409 });
      }

      const created = await base44.asServiceRole.entities.BinLocation.create({
        name: binCode,
        bin_code: binCode,
        warehouse_location_id: data.warehouse_location_id,
        warehouse_location_name: data.warehouse_location_name,
        zone: data.zone || String(data.rack || ''),
        aisle: data.aisle || '',
        shelf: data.shelf || '',
        is_active: data.is_active !== false,
        notes: (data.notes || '').trim(),
      });
      console.log(`[BYPASS AUDIT] user=${user.email} role=${roleKey} action=manageBinLocation CREATE id=${created.id} code=${binCode}`);
      return Response.json({ success: true, bin: created });

    } else if (action === 'update') {
      if (!record_id) return Response.json({ error: 'record_id is required for update' }, { status: 400 });

      if (binCode) {
        const allBinsForUpdate = await base44.asServiceRole.entities.BinLocation.list('-created_date', 500);
        const dup = allBinsForUpdate.find(b => b.id !== record_id && normalize(b.bin_code) === normCode);
        if (dup) {
          return Response.json({ error: 'Duplicate bin code', field: 'bin_code', value: binCode }, { status: 409 });
        }
      }

      const updateData = {};
      if (binCode) { updateData.bin_code = binCode; updateData.name = binCode; }
      if (data.warehouse_location_id) updateData.warehouse_location_id = data.warehouse_location_id;
      if (data.warehouse_location_name) updateData.warehouse_location_name = data.warehouse_location_name;
      if (data.zone !== undefined) updateData.zone = data.zone;
      if (data.aisle !== undefined) updateData.aisle = data.aisle;
      if (data.shelf !== undefined) updateData.shelf = data.shelf;
      if (data.is_active !== undefined) updateData.is_active = data.is_active;
      if (data.notes !== undefined) updateData.notes = data.notes.trim();

      const updated = await base44.asServiceRole.entities.BinLocation.update(record_id, updateData);
      console.log(`[BYPASS AUDIT] user=${user.email} role=${roleKey} action=manageBinLocation UPDATE id=${record_id}`);
      return Response.json({ success: true, bin: updated });

    } else if (action === 'list') {
      const bins = await base44.asServiceRole.entities.BinLocation.list('-created_date', 500);
      return Response.json({ success: true, bins });
    } else {
      return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});