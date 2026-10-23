import {
  Clock, Sunrise, Truck, ArrowLeftRight, Undo2, Wrench,
  Settings, Send, PackageX, ClipboardCheck, Sparkles, Package,
} from 'lucide-react';

/**
 * Day-Start Workflow Steps
 * The daily job sequence for technicians:
 * Clock In → Morning Workflow WH-105 → Truck Readiness → Material Transfer Receive
 * → Return Previous Job Materials WH-201 (if needed) → Equipment / Consumables Check
 * → Setup Workflow → Dispatch to First Job
 */
export const DAY_START_STEPS = [
  {
    id: 'clock_in',
    number: 1,
    label: 'Clock In',
    icon: Clock,
    required: true,
    blocksDispatch: false,
    navigates: false,
  },
  {
    id: 'morning_workflow',
    number: 2,
    label: 'Morning Workflow WH-105',
    icon: Sunrise,
    required: true,
    blocksDispatch: true,
    navigates: true,
    link: '/tech/readiness',
    linkLabel: 'Open Morning Workflow',
  },
  {
    id: 'truck_readiness',
    number: 3,
    label: 'Truck Readiness',
    icon: Truck,
    required: true,
    blocksDispatch: true,
    navigates: true,
    link: '/tech/readiness',
    linkLabel: 'Open Truck Readiness',
  },
  {
    id: 'material_transfer',
    number: 4,
    label: 'Material Transfer Receive',
    icon: ArrowLeftRight,
    required: true,
    blocksDispatch: false,
    navigates: true,
    link: '/warehouse/transfer-sheets',
    linkLabel: 'View Transfer Sheets',
  },
  {
    id: 'return_materials',
    number: 5,
    label: 'Return Materials WH-201',
    icon: Undo2,
    required: false,
    conditional: true,
    blocksDispatch: false,
    navigates: true,
    link: '/warehouse/material-returns/new',
    linkLabel: 'New Material Return',
  },
  {
    id: 'equipment_check',
    number: 6,
    label: 'Equipment / Consumables',
    icon: Wrench,
    required: true,
    blocksDispatch: false,
    navigates: true,
    link: '/tech/equipment',
    linkLabel: 'Check Equipment',
  },
  {
    id: 'setup',
    number: 7,
    label: 'Setup Workflow',
    icon: Settings,
    required: false,
    requiresJob: true,
    blocksDispatch: false,
    navigates: true,
    link: '/tech/inspection-setup',
    linkLabel: 'Open Setup',
  },
  {
    id: 'dispatch',
    number: 8,
    label: 'Dispatch to First Job',
    icon: Send,
    required: true,
    blocksDispatch: false,
    navigates: false,
    isDispatch: true,
  },
];

/**
 * Steps that block dispatch until complete (or manager override).
 */
export const DISPATCH_BLOCKING_STEPS = DAY_START_STEPS.filter(s => s.blocksDispatch);

/**
 * No-Job Available Actions
 * Shown when the technician has no scheduled job today.
 */
export const NO_JOB_ACTIONS = [
  {
    id: 'return_materials',
    label: 'Return Leftover Materials',
    description: 'Return unused job-specific materials from previous jobs',
    icon: PackageX,
    link: '/warehouse/material-returns/new',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    id: 'return_equipment',
    label: 'Return Equipment',
    description: 'Return temporary or specialty equipment',
    icon: Undo2,
    link: '/warehouse/material-returns/new',
    color: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  {
    id: 'consumable_request',
    label: 'Submit Consumable Request',
    description: 'Request restocking of consumable supplies',
    icon: Package,
    link: '/consumables/new',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    id: 'truck_cleanup',
    label: 'Clean / Organize Truck',
    description: 'Remove trash, organize shelves, secure equipment',
    icon: Sparkles,
    link: '/tech/truck',
    color: 'bg-green-50 text-green-700 border-green-200',
  },
  {
    id: 'warehouse_support',
    label: 'Warehouse Support Task',
    description: 'Assist warehouse with tasks, staging, or cleanup',
    icon: ClipboardCheck,
    link: '/warehouse',
    color: 'bg-gray-50 text-gray-700 border-gray-200',
  },
];

export const OVERRIDE_REASONS = [
  'Truck inspection in progress — will complete en route',
  'Equipment verification deferred — warehouse staging delay',
  'Material transfer pending — warehouse not ready',
  'Morning workflow partially complete — manager approval',
  'Other (specify in notes)',
];

/**
 * Get the status of a step from the checklist results.
 */
export function getStepStatus(stepId, checklist = {}) {
  return checklist[stepId]?.status || 'not_started';
}

/**
 * Check if all dispatch-blocking steps are complete.
 */
export function isDispatchReady(checklist = {}, managerOverrideUsed = false) {
  if (managerOverrideUsed) return true;
  return DISPATCH_BLOCKING_STEPS.every(step =>
    ['complete', 'not_required', 'manager_override'].includes(getStepStatus(step.id, checklist))
  );
}

/**
 * Get the next actionable step in the sequence.
 */
export function getNextStep(checklist = {}, hasJob = true) {
  for (const step of DAY_START_STEPS) {
    if (step.isDispatch) continue;
    if (step.requiresJob && !hasJob) continue;
    if (step.conditional && !hasJob) continue;
    const status = getStepStatus(step.id, checklist);
    if (!['complete', 'not_required', 'manager_override'].includes(status)) {
      return step;
    }
  }
  // If all prior steps are done, the next step is dispatch (if has job)
  if (hasJob) {
    return DAY_START_STEPS.find(s => s.isDispatch);
  }
  return null;
}

/**
 * Calculate overall progress percentage.
 */
export function getProgressPercentage(checklist = {}, hasJob = true) {
  const applicableSteps = DAY_START_STEPS.filter(s => {
    if (s.isDispatch) return hasJob;
    if (s.requiresJob && !hasJob) return false;
    if (s.conditional && !hasJob) return false;
    return true;
  });
  const completed = applicableSteps.filter(s =>
    ['complete', 'not_required', 'manager_override'].includes(getStepStatus(s.id, checklist))
  );
  return Math.round((completed.length / applicableSteps.length) * 100);
}

/**
 * Format elapsed time from a start timestamp to now (or end timestamp).
 */
export function formatElapsedTime(startISO, endISO) {
  if (!startISO) return '00:00:00';
  const start = new Date(startISO).getTime();
  const end = endISO ? new Date(endISO).getTime() : Date.now();
  const diff = Math.max(0, end - start);
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}