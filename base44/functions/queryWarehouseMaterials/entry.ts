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

// Reactivation is a separate, restricted permission — NOT implied by '*' wildcard
// or warehouse.location.create. Warehouse Managers can create locations but
// cannot reactivate inactive ones.
const REACTIVATION_ALLOWED_ROLES = new Set([
  'admin',
  'owner',
  'director_of_operations',
  'operations_manager',
]);

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

function computeInventoryStatus(item) {
  if (!item.is_active || item.status === 'Inactive' || item.status === 'Discontinued') return 'inactive';
  if (!item.is_stocked_inventory_item) return 'not_stocked';
  if (!item.bin_location_id && !item.default_bin_location_id) return 'stocked_unassigned';
  return 'stocked_assigned';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roleKey = await resolveUserRole(base44, user);
    if (!hasCapability(roleKey, 'warehouse.setup.view')) {
      return Response.json({ error: 'You do not have permission to view warehouse materials.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      page = 1,
      page_size = 50,
      search = '',
      stocked_filter = 'stocked_only', // stocked_only, not_stocked, all
      assigned_filter = 'all', // all, assigned, unassigned
      location_id = '',
      category_id = '',
      manufacturer_id = '',
      inventory_type = '',
    } = body;

    // ─── Build filter query ───
    const filter = {};

    if (inventory_type) filter.inventory_type = inventory_type;
    if (category_id) filter.category_id = category_id;
    if (manufacturer_id) filter.manufacturer_id = manufacturer_id;
    if (location_id) filter.warehouse_location_id = location_id;

    // Stocked filter
    if (stocked_filter === 'stocked_only') {
      filter.is_stocked_inventory_item = true;
    } else if (stocked_filter === 'not_stocked') {
      filter.is_stocked_inventory_item = { $ne: true };
    }

    // Server-side search via $regex (works across the full catalog, not just one page)
    if (search) {
      filter.$or = [
        { sku: { $regex: search, $options: 'i' } },
        { item_name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } },
      ];
    }

    // ─── Fetch paginated results ───
    const skip = (page - 1) * page_size;
    let materials = await base44.asServiceRole.entities.InventoryMaster.filter(
      filter,
      'item_name',
      page_size,
      skip
    );

    // ─── Apply assigned filter ───
    if (assigned_filter === 'assigned') {
      materials = materials.filter(m => m.bin_location_id || m.default_bin_location_id);
    } else if (assigned_filter === 'unassigned') {
      materials = materials.filter(m => !m.bin_location_id && !m.default_bin_location_id);
    }

    // ─── Compute inventory_status for each item ───
    materials = materials.map(m => ({
      ...m,
      inventory_status: computeInventoryStatus(m),
    }));

    // ─── Compute totals via paginated server-side count loop ───
    // The SDK caps list/filter at 500 records per call, so we paginate
    // through all records in batches, counting without loading all into memory.
    let totalRecords = 0;
    let totalActive = 0;
    let stockedCount = 0;
    let stockedAssignedCount = 0;
    let notStockedCount = 0;
    {
      let skip = 0;
      const batchSize = 500;
      while (true) {
        const batch = await base44.asServiceRole.entities.InventoryMaster.filter(
          {},
          '-created_date',
          batchSize,
          skip
        );
        for (const m of batch) {
          const isActive = m.is_active !== false && m.status !== 'Inactive' && m.status !== 'Discontinued';
          if (isActive) {
            totalActive++;
            if (m.is_stocked_inventory_item === true) {
              stockedCount++;
              if (m.bin_location_id || m.default_bin_location_id) stockedAssignedCount++;
            } else {
              notStockedCount++;
            }
          }
        }
        totalRecords += batch.length;
        if (batch.length < batchSize) break;
        skip += batchSize;
        if (skip > 20000) break; // safety valve
      }
    }
    const stockedUnassignedCount = stockedCount - stockedAssignedCount;

    // ─── Determine if there are more results ───
    const hasMore = materials.length === page_size;

    return Response.json({
      success: true,
      materials,
      page,
      page_size,
      has_more: hasMore,
      totals: {
        catalog_total: totalRecords,
        total_active: totalActive,
        stocked: stockedCount,
        stocked_assigned: stockedAssignedCount,
        stocked_unassigned: stockedUnassignedCount,
        not_stocked: notStockedCount,
        ready_to_count: stockedAssignedCount,
      },
      permissions: {
        can_assign: hasCapability(roleKey, 'warehouse.material.assign'),
        can_count: hasCapability(roleKey, 'warehouse.inventory.count'),
        can_manage: hasCapability(roleKey, 'warehouse.setup.manage'),
        can_use_ai: hasCapability(roleKey, 'warehouse.ai.use'),
        can_create_location: hasCapability(roleKey, 'warehouse.location.create'),
        can_create_bin: hasCapability(roleKey, 'warehouse.bin.create'),
        can_reactivate_warehouse: REACTIVATION_ALLOWED_ROLES.has(roleKey),
        role: roleKey,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});