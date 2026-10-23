import {
  CalendarCheck, ClipboardList, PackageCheck, Wrench,
  Truck, Boxes, ShieldCheck,
} from 'lucide-react';

export const NIGHT_BEFORE_STEPS = [
  {
    id: 'schedule_review',
    number: 1,
    title: "Review Tomorrow's Schedule",
    purpose: "Review tomorrow's technicians, trucks, jobs, priorities, and requirements.",
    icon: CalendarCheck,
    required: true,
    statusField: 'schedule_review_status',
    checks: [
      { id: 'review_technicians', label: "Review tomorrow's technicians" },
      { id: 'review_trucks', label: 'Verify assigned trucks' },
      { id: 'review_jobs', label: 'Review scheduled jobs' },
      { id: 'review_priority', label: 'Review job priorities' },
      { id: 'review_instructions', label: 'Review special instructions' },
      { id: 'review_materials', label: 'Review required materials' },
      { id: 'review_consumables', label: 'Review required consumables' },
      { id: 'review_equipment', label: 'Review required equipment' },
      { id: 'review_customer_notes', label: 'Review customer notes' },
    ],
    autoDisplay: true,
  },
  {
    id: 'build_transfers',
    number: 2,
    title: 'Build Material Transfers',
    purpose: 'Generate and prepare transfer sheets for tomorrow.',
    icon: ClipboardList,
    required: true,
    statusField: 'material_transfers_status',
    checks: [
      { id: 'generate_transfers', label: 'Generate transfer sheets' },
      { id: 'pick_materials', label: 'Pick materials' },
      { id: 'verify_quantities', label: 'Verify quantities' },
      { id: 'stage_transfers', label: 'Stage for pickup' },
      { id: 'mark_ready_transfer', label: 'Mark ready for pickup' },
    ],
    autoDisplay: true,
    actions: [
      { id: 'new_transfer', label: 'New Transfer', link: '/warehouse/transfer-sheets', variant: 'default' },
    ],
  },
  {
    id: 'consumable_replenishment',
    number: 3,
    title: 'Consumable Replenishment',
    purpose: "Compare truck minimums against tomorrow's work and replenish.",
    icon: PackageCheck,
    required: true,
    statusField: 'consumable_replenishment_status',
    checks: [
      { id: 'compare_minimums', label: 'Compare truck minimums vs tomorrow' },
      { id: 'review_recommendations', label: 'Review replenishment recommendations' },
      { id: 'load_consumables', label: 'Load consumables' },
      { id: 'verify_consumables', label: 'Verify loaded' },
    ],
    autoDisplay: true,
    actions: [
      { id: 'new_replenishment', label: 'New Replenishment', link: '/consumables/new', variant: 'default' },
    ],
  },
  {
    id: 'equipment_verification',
    number: 4,
    title: 'Equipment Verification',
    purpose: 'Verify equipment packages, specialty, rental, and calibration equipment.',
    icon: Wrench,
    required: true,
    statusField: 'equipment_verification_status',
    checks: [
      { id: 'verify_package', label: 'Verify equipment package' },
      { id: 'verify_specialty', label: 'Verify specialty equipment' },
      { id: 'verify_rental', label: 'Verify rental equipment' },
      { id: 'verify_calibration', label: 'Verify calibration equipment' },
    ],
    actions: [
      { id: 'report_missing', label: 'Report Missing', link: '/equipment', variant: 'outline' },
    ],
  },
  {
    id: 'fleet_review',
    number: 5,
    title: 'Fleet Review',
    purpose: 'Verify truck availability, defects, inspection, fuel, and repairs.',
    icon: Truck,
    required: true,
    statusField: 'fleet_review_status',
    checks: [
      { id: 'verify_available', label: 'Truck available' },
      { id: 'check_defects', label: 'No critical defects' },
      { id: 'check_inspection', label: 'Inspection current' },
      { id: 'check_fuel', label: 'Fuel acceptable' },
      { id: 'check_repairs', label: 'No open repairs' },
      { id: 'check_dispatch_readiness', label: 'Dispatch readiness confirmed' },
    ],
    autoDisplay: true,
  },
  {
    id: 'staging',
    number: 6,
    title: 'Staging',
    purpose: 'Stage each truck with all required items for morning pickup.',
    icon: Boxes,
    required: true,
    statusField: 'staging_status',
    checks: [
      { id: 'stage_transfer', label: 'Completed material transfer staged' },
      { id: 'stage_consumables', label: 'Consumables staged' },
      { id: 'stage_equipment', label: 'Equipment staged' },
      { id: 'stage_specialty', label: 'Specialty tools staged' },
      { id: 'stage_paperwork', label: 'Paperwork staged (if applicable)' },
      { id: 'mark_ready_pickup', label: 'Mark ready for morning pickup' },
    ],
  },
  {
    id: 'warehouse_signoff',
    number: 7,
    title: 'Warehouse Sign-Off',
    purpose: 'Warehouse manager sign-off completing night before preparation.',
    icon: ShieldCheck,
    required: true,
    statusField: 'warehouse_signoff_status',
    checks: [],
    isSignOffStep: true,
  },
];

const PASSING = ['complete', 'not_required', 'manager_override'];

export function parseWorkflowChecks(record) {
  if (!record?.workflow_checks) return {};
  try {
    return JSON.parse(record.workflow_checks);
  } catch {
    return {};
  }
}

export function computeStepStatus(step, workflowChecks, record) {
  if (step.isSignOffStep) {
    return record?.signed_off ? 'complete' : 'waiting';
  }
  const subChecksComplete = step.checks.length === 0 ||
    step.checks.every(c => (workflowChecks[c.id]?.status || 'waiting') === 'complete');
  if (!subChecksComplete) return 'waiting';
  return 'complete';
}

export function computeOverallReadiness(workflowChecks, record) {
  const steps = NIGHT_BEFORE_STEPS.filter(s => s.required);
  const complete = steps.filter(s => computeStepStatus(s, workflowChecks, record) === 'complete');
  return Math.round((complete.length / steps.length) * 100);
}

export function computeOverallStatus(workflowChecks, record) {
  if (record?.signed_off) return 'complete';
  const steps = NIGHT_BEFORE_STEPS.filter(s => s.required);
  const allComplete = steps.every(s => computeStepStatus(s, workflowChecks, record) === 'complete');
  if (allComplete) return 'ready';
  const anyStarted = steps.some(s => computeStepStatus(s, workflowChecks, record) !== 'waiting');
  return anyStarted ? 'in_progress' : 'waiting';
}

export function computeNightBeforeAutoDisplay(stepId, data) {
  const {
    tomorrowJobs = [], trucks = [], transferSheets = [],
    consumableReqs = [], equipment = [],
  } = data;

  if (stepId === 'schedule_review') {
    const technicians = [...new Set(tomorrowJobs.map(j => j.technician_name || j.technician_email).filter(Boolean))];
    const jobTrucks = [...new Set(tomorrowJobs.map(j => j.truck_number).filter(Boolean))];
    const priorities = tomorrowJobs.map(j => j.priority).filter(Boolean);
    const hasUrgent = priorities.includes('urgent');
    return {
      jobs: tomorrowJobs,
      technicians,
      trucks: jobTrucks,
      hasUrgent,
      jobCount: tomorrowJobs.length,
    };
  }

  if (stepId === 'build_transfers') {
    return { transfers: transferSheets };
  }

  if (stepId === 'consumable_replenishment') {
    return { requests: consumableReqs };
  }

  if (stepId === 'fleet_review') {
    return { trucks };
  }

  return null;
}