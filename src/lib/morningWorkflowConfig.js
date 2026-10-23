import {
  Undo2, PackageCheck, Trash2, ClipboardCheck, Wrench,
  Truck, LayoutDashboard, ShieldCheck, Play,
} from 'lucide-react';

export const WORKFLOW_STEPS = [
  {
    id: 'previous_day_closeout',
    number: 1,
    title: 'Previous Day Closeout',
    purpose: "Return unused materials and temporary equipment from yesterday's work.",
    icon: Undo2,
    required: true,
    checkIds: ['previous_returns'],
    checks: [
      { id: 'return_materials', label: 'Return unused job-specific materials' },
      { id: 'return_specialty_equipment', label: 'Return temporary / specialty equipment' },
    ],
    autoDisplay: true,
    actions: [
      { id: 'view_returns', label: 'View Returns', link: '/warehouse/material-returns', variant: 'outline' },
      { id: 'return_items', label: 'Return Items', link: '/warehouse/material-returns/new', variant: 'default' },
      { id: 'request_override', label: 'Request Override', type: 'override', variant: 'ghost' },
    ],
  },
  {
    id: 'consumable_verification',
    number: 2,
    title: 'Consumable Verification',
    purpose: 'Verify replenished consumables are loaded. No need to count every item.',
    icon: PackageCheck,
    required: true,
    checkIds: ['consumables'],
    checks: [
      { id: 'verify_replenished_items', label: 'Verify replenished consumables' },
    ],
    autoDisplay: true,
    actions: [
      { id: 'request_warehouse', label: 'Request Warehouse', link: '/consumables/new', variant: 'default' },
      { id: 'override', label: 'Override', type: 'override', variant: 'ghost' },
    ],
  },
  {
    id: 'truck_cleanup',
    number: 3,
    title: 'Truck Cleanup',
    purpose: 'Quick cleanup — remove trash, organize shelves, secure equipment.',
    icon: Trash2,
    required: true,
    checkIds: ['truck_cleaned', 'truck_organized'],
    checks: [
      { id: 'remove_trash', label: 'Remove trash' },
      { id: 'organize_shelves', label: 'Organize shelves / storage' },
      { id: 'secure_equipment', label: 'Secure loose equipment' },
    ],
    optionalPhoto: true,
  },
  {
    id: 'material_pickup',
    number: 4,
    title: 'Material Pickup Verification',
    purpose: "Verify warehouse-staged materials are correct and loaded. You don't pull inventory.",
    icon: ClipboardCheck,
    required: true,
    checkIds: ['material_transfer', 'materials_loaded'],
    checks: [
      { id: 'verify_correct_items', label: 'Correct items staged' },
      { id: 'verify_correct_quantities', label: 'Correct quantities loaded' },
      { id: 'confirm_load_complete', label: 'Load complete' },
    ],
    autoDisplay: true,
    actions: [
      { id: 'report_shortage', label: 'Report Shortage', variant: 'outline' },
      { id: 'report_wrong_item', label: 'Report Wrong Item', variant: 'outline' },
    ],
  },
  {
    id: 'equipment_verification',
    number: 5,
    title: 'Equipment Verification',
    purpose: 'Verify warehouse-staged equipment is present. Standard package + today\'s specials.',
    icon: Wrench,
    required: true,
    checkIds: ['daily_equipment', 'todays_job_equipment'],
    checks: [
      { id: 'verify_equipment_package', label: 'Standard Equipment Package present' },
      { id: 'verify_specialty_tools', label: "Today's special equipment present" },
    ],
    autoDisplay: true,
    actions: [
      { id: 'report_missing', label: 'Report Missing', link: '/tech/equipment', variant: 'outline' },
      { id: 'request_warehouse_equip', label: 'Request Warehouse', link: '/consumables/new', variant: 'ghost' },
    ],
  },
  {
    id: 'truck_inspection',
    number: 6,
    title: 'Daily Vehicle Safety Check',
    purpose: 'Quick safety verification — 30 to 60 seconds.',
    icon: Truck,
    required: true,
    checkIds: ['truck_inspection'],
    checks: [
      { id: 'safety_fuel', label: 'Fuel adequate for today' },
      { id: 'safety_dashboard_lights', label: 'No dashboard warning lights' },
      { id: 'safety_tires', label: 'No visible tire damage' },
      { id: 'safety_mirrors_windshield', label: 'Mirrors / windshield acceptable' },
      { id: 'safety_fire_extinguisher', label: 'Fire extinguisher present' },
      { id: 'safety_first_aid', label: 'First aid kit present' },
    ],
  },
  {
    id: 'dashboard_review',
    number: 7,
    title: 'Morning Briefing',
    purpose: "Review today's schedule, customer details, and special instructions.",
    icon: LayoutDashboard,
    required: true,
    checkIds: ['dashboard_review'],
    checks: [
      { id: 'review_schedule', label: "Reviewed today's schedule" },
      { id: 'review_special_instructions', label: 'Reviewed special instructions & special equipment' },
    ],
    autoDisplay: true,
  },
  {
    id: 'dispatch_ready',
    number: 8,
    title: 'Dispatch Ready',
    purpose: 'All required steps complete — ready for dispatch.',
    icon: ShieldCheck,
    required: true,
    checkIds: [],
    checks: [],
    autoComputed: true,
  },
  {
    id: 'start_my_day',
    number: 9,
    title: 'Start My Day',
    purpose: 'Begin customer service with confidence.',
    icon: Play,
    required: true,
    checkIds: [],
    checks: [],
    isStartStep: true,
  },
];

export const WEEKLY_INSPECTION_STEPS = [
  { id: 'brakes', label: 'Brakes', description: 'Test brake function and parking brake.' },
  { id: 'tires', label: 'Tires', description: 'Check tread depth, pressure, and condition.' },
  { id: 'fluids', label: 'Fluids', description: 'Check oil, coolant, washer fluid, brake fluid.' },
  { id: 'ladder_racks', label: 'Ladder Racks', description: 'Inspect racks, straps, and mounting bolts.' },
  { id: 'backup_camera', label: 'Backup Camera', description: 'Verify camera function and display.' },
  { id: 'safety_equipment', label: 'Safety Equipment', description: 'Fire extinguisher, first aid, cones, triangles.' },
  { id: 'equipment_inventory', label: 'Equipment Inventory', description: 'Verify all assigned equipment present.' },
  { id: 'preventive_maintenance', label: 'Preventive Maintenance', description: 'Check scheduled PM items and service intervals.' },
];

const PASSING = ['complete', 'not_required', 'manager_override'];

export function computeStepStatus(step, workflowChecks, merged) {
  if (step.autoComputed) {
    const requiredSteps = WORKFLOW_STEPS.filter(s => s.required && !s.autoComputed && !s.isStartStep);
    return requiredSteps.every(s => computeStepStatus(s, workflowChecks, merged) === 'complete')
      ? 'complete' : 'waiting';
  }
  if (step.isStartStep) {
    return merged?.departed ? 'complete' : 'waiting';
  }
  const subChecksComplete = step.checks.length === 0 ||
    step.checks.every(c => (workflowChecks[c.id]?.status || 'waiting') === 'complete');
  const fieldsPassing = step.checkIds.every(id => PASSING.includes(merged?.[id]));
  if (!subChecksComplete) return 'waiting';
  if (!fieldsPassing) {
    const anyBlocked = step.checkIds.some(id => merged?.[id] === 'blocked');
    return anyBlocked ? 'blocked' : 'waiting';
  }
  return 'complete';
}

export function parseWorkflowChecks(record) {
  if (!record?.workflow_checks) return {};
  try {
    return JSON.parse(record.workflow_checks);
  } catch {
    return {};
  }
}

export function computeAutoDisplayData(stepId, data) {
  const {
    transferSheets = [], materialReturns = [], consumableReqs = [],
    equipment = [], todayJobs = [], myTasks = [], myNotifications = [],
  } = data;

  if (stepId === 'previous_day_closeout') {
    const outstandingTransfers = transferSheets.filter(t =>
      !['Completed', 'Closed', 'Cancelled', 'Returned', 'Picked Up', 'Loaded'].includes(t.status)
    );
    const outstandingEquipmentReturns = equipment.filter(e =>
      e.assignment_type === 'temporary' && !e.actual_return_datetime
    );
    const outstandingConsumableReturns = consumableReqs.filter(r =>
      !['Completed', 'Received', 'Delivered', 'Fulfilled'].includes(r.status)
    );
    const outstandingWarehouseRequests = materialReturns.filter(r =>
      !['Completed', 'Closed', 'Cancelled'].includes(r.status)
    );
    return {
      outstandingTransfers,
      outstandingEquipmentReturns,
      outstandingConsumableReturns,
      outstandingWarehouseRequests,
      hasOutstanding: outstandingTransfers.length > 0 || outstandingEquipmentReturns.length > 0 ||
        outstandingConsumableReturns.length > 0 || outstandingWarehouseRequests.length > 0,
    };
  }

  if (stepId === 'consumable_verification') {
    // Show only items that were replenished overnight or are below minimum
    const today = new Date().toLocaleDateString('en-CA');
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
    const replenishedOvernight = consumableReqs.filter(r => {
      const reqDate = (r.submitted_time || r.created_date || '').split('T')[0];
      return (reqDate === today || reqDate === yesterday) &&
        ['Ready for Pickup', 'Completed', 'Submitted', 'Pulling'].includes(r.status);
    });
    // Parse items from replenishment requests
    const replenishedItems = [];
    replenishedOvernight.forEach(req => {
      try {
        const items = JSON.parse(req.items || '[]');
        items.forEach(item => {
          replenishedItems.push({
            ...item,
            request_id: req.request_id || req.id,
            status: req.status,
          });
        });
      } catch { /* */ }
    });
    return {
      replenishedItems,
      hasShortages: replenishedItems.length > 0,
    };
  }

  if (stepId === 'material_pickup') {
    // Show today's staged transfer sheets with line items
    const stagedTransfers = transferSheets.filter(t =>
      ['Staged', 'Ready for Pickup', 'Loaded'].includes(t.status) ||
      !['Completed', 'Closed', 'Cancelled', 'Returned'].includes(t.status)
    );
    // Parse line items from each transfer
    const stagedItems = [];
    stagedTransfers.forEach(transfer => {
      try {
        const items = JSON.parse(transfer.line_items || '[]');
        items.forEach(li => {
          stagedItems.push({
            ...li,
            transfer_id: transfer.transfer_id || transfer.id,
            transfer_record_id: transfer.id,
            job_number: transfer.job_number || '',
            customer_name: transfer.customer_name || '',
            status: transfer.status,
            verified: li.verified === true,
          });
        });
      } catch { /* */ }
    });
    return {
      stagedTransfers,
      stagedItems,
      hasStaged: stagedItems.length > 0,
    };
  }

  if (stepId === 'equipment_verification') {
    const standardEquipment = equipment.filter(e =>
      e.required_daily_operations && e.is_active !== false
    );
    const todaysSpecialEquipment = equipment.filter(e =>
      e.required_todays_job && e.is_active !== false
    );
    return {
      standardEquipment,
      todaysSpecialEquipment,
      standardAllPresent: standardEquipment.length > 0 &&
        standardEquipment.every(e => !['missing', 'damaged', 'out_for_repair'].includes(e.status)),
      specialAllPresent: todaysSpecialEquipment.length === 0 ||
        todaysSpecialEquipment.every(e => e.assigned_employee_email || e.assigned_employee),
    };
  }

  if (stepId === 'dashboard_review') {
    const firstJob = todayJobs[0] || null;
    const openTasks = myTasks.filter(t => !['Completed', 'Cancelled'].includes(t.status));
    const criticalNotifications = myNotifications.filter(n =>
      ['Critical', 'High'].includes(n.priority) && n.status !== 'Cancelled' && !n.is_archived
    );
    const customerNotes = todayJobs.map(j => j.notes).filter(Boolean);
    return {
      todayJobs,
      firstJob,
      openTasks,
      criticalNotifications,
      customerNotes,
    };
  }

  return null;
}