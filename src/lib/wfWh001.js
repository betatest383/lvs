import {
  ClipboardList,
  ArrowLeftRight,
  Package,
  Boxes,
  CheckSquare,
  Forklift,
  Truck,
  UserCheck,
  Send,
} from 'lucide-react';

/**
 * WF-WH-001 Morning Material Request — 9-stage workflow definition.
 * Each stage: { key, label, icon, timestampField }
 *
 * The Forklift Load stage is conditional — only shown when forklift_required is true.
 */
export const WF_WH_001_STAGES = [
  { key: 'hw_checklist', label: 'Hardware Checklist Submitted', icon: ClipboardList, timestampField: 'ts_hardware_checklist_submitted' },
  { key: 'transfer_sheet', label: 'Material Transfer Sheet Submitted', icon: ArrowLeftRight, timestampField: 'ts_transfer_sheet_submitted' },
  { key: 'hw_pulling', label: 'Hardware Pulling Started', icon: Package, timestampField: 'ts_pulling_started' },
  { key: 'inv_pulling', label: 'Inventory Pulling Started', icon: Boxes, timestampField: null },
  { key: 'materials_staged', label: 'Materials Staged', icon: CheckSquare, timestampField: 'ts_materials_staged' },
  { key: 'forklift_load', label: 'Forklift Load Required', icon: Forklift, timestampField: null, conditional: true },
  { key: 'truck_loaded', label: 'Truck Loaded', icon: Truck, timestampField: 'ts_truck_loaded' },
  { key: 'tech_confirmed', label: 'Technician Confirmed Receipt', icon: UserCheck, timestampField: 'ts_technician_confirmed' },
  { key: 'truck_released', label: 'Truck Released', icon: Send, timestampField: 'ts_truck_released' },
];

/**
 * Returns the effective stages for a given workflow record,
 * inserting the forklift stage only when forklift_required is true.
 */
export function getEffectiveStages(record) {
  if (record?.forklift_required) return WF_WH_001_STAGES;
  return WF_WH_001_STAGES.filter(s => !s.conditional);
}

/**
 * Status string for a stage key.
 */
export function getStageStatus(stageKey) {
  const stage = WF_WH_001_STAGES.find(s => s.key === stageKey);
  return stage ? stage.label : '';
}

/**
 * Validates whether a stage transition is allowed.
 * Returns { allowed: boolean, error?: string }
 */
export function validateTransition(record, targetStageKey) {
  // Rule: Truck cannot be marked Loaded unless a Material Transfer Sheet is attached
  if (targetStageKey === 'truck_loaded') {
    if (!record.material_transfer_sheet_id) {
      return { allowed: false, error: 'Truck cannot be loaded until a Material Transfer Sheet is attached.' };
    }
  }

  // Rule: Truck cannot be marked Released unless Technician Confirmed Receipt is complete
  if (targetStageKey === 'truck_released') {
    if (!record.ts_technician_confirmed) {
      return { allowed: false, error: 'Truck cannot be released until the technician confirms receipt.' };
    }
  }

  return { allowed: true };
}

/**
 * Calculates total loading time in minutes from pulling start to truck release.
 */
export function calculateLoadingTime(record) {
  if (!record.ts_pulling_started || !record.ts_truck_released) return null;
  const start = new Date(record.ts_pulling_started).getTime();
  const end = new Date(record.ts_truck_released).getTime();
  return Math.round((end - start) / 60000);
}