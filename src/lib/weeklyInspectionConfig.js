export const WEEKLY_INSPECTION_CHECKS = [
  {
    id: 'brakes',
    field: 'brakes_status',
    label: 'Brakes',
    description: 'Test brake function and parking brake.',
  },
  {
    id: 'tires',
    field: 'tires_status',
    label: 'Tires',
    description: 'Check tread depth, pressure, and condition.',
  },
  {
    id: 'fluids',
    field: 'fluids_status',
    label: 'Fluids',
    description: 'Check oil, coolant, washer fluid, brake fluid.',
  },
  {
    id: 'ladder_racks',
    field: 'ladder_racks_status',
    label: 'Ladder Racks',
    description: 'Inspect racks, straps, and mounting bolts.',
  },
  {
    id: 'backup_camera',
    field: 'backup_camera_status',
    label: 'Backup Camera',
    description: 'Verify camera function and display.',
  },
  {
    id: 'safety_equipment',
    field: 'safety_equipment_status',
    label: 'Safety Equipment',
    description: 'Fire extinguisher, first aid, cones, triangles.',
  },
  {
    id: 'equipment_inventory',
    field: 'equipment_inventory_status',
    label: 'Equipment Inventory',
    description: 'Verify all assigned equipment present.',
  },
  {
    id: 'preventive_maintenance',
    field: 'preventive_maintenance_status',
    label: 'Preventive Maintenance',
    description: 'Check scheduled PM items and service intervals.',
  },
];

export const PASSING_STATUSES = ['complete', 'not_required', 'manager_override'];

export const WEEKLY_INSPECTION_INTERVAL_DAYS = 7;

export function computeWeeklyReadiness(record) {
  if (!record) return 0;
  const passCount = WEEKLY_INSPECTION_CHECKS.filter(c =>
    PASSING_STATUSES.includes(record[c.field])
  ).length;
  return Math.round((passCount / WEEKLY_INSPECTION_CHECKS.length) * 100);
}

export function computeWeeklyOverallStatus(record) {
  if (!record) return 'waiting';
  if (record.completed) return 'complete';
  const allPass = WEEKLY_INSPECTION_CHECKS.every(c =>
    PASSING_STATUSES.includes(record[c.field])
  );
  if (allPass) return 'complete';
  const anyBlocked = WEEKLY_INSPECTION_CHECKS.some(c => record[c.field] === 'blocked');
  if (anyBlocked) return 'blocked';
  const anyProgress = WEEKLY_INSPECTION_CHECKS.some(c =>
    ['complete', 'in_progress'].includes(record[c.field])
  );
  return anyProgress ? 'in_progress' : 'waiting';
}

export function getMondayOfWeek(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toLocaleDateString('en-CA');
}

export function isWeeklyInspectionOverdue(lastInspectionDate) {
  if (!lastInspectionDate) return true;
  const last = new Date(lastInspectionDate + 'T00:00:00');
  const today = new Date(new Date().toLocaleDateString('en-CA') + 'T00:00:00');
  const diffDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));
  return diffDays > WEEKLY_INSPECTION_INTERVAL_DAYS;
}