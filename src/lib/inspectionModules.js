/**
 * Inspection Module Constants
 * Central definitions for the modular inspection architecture.
 * An inspection flows: Inspection Setup → Selected Modules → Summary → Repair Engine → Estimate Engine
 */

export const INSPECTION_MODULES = [
  { key: 'inspection_setup', label: 'Inspection Setup', short: 'Setup', icon: 'ClipboardCheck', color: 'bg-violet-100 text-violet-700', accent: 'bg-violet-500' },
  { key: 'interior', label: 'Interior Inspection', short: 'Interior', icon: 'Home', color: 'bg-amber-100 text-amber-700', accent: 'bg-amber-400' },
  { key: 'exterior', label: 'Exterior Inspection', short: 'Exterior', icon: 'TreePine', color: 'bg-sky-100 text-sky-700', accent: 'bg-sky-500' },
  { key: 'attic', label: 'Attic Inspection', short: 'Attic', icon: 'Warehouse', color: 'bg-orange-100 text-orange-700', accent: 'bg-orange-500' },
  { key: 'roof', label: 'Roof Inspection', short: 'Roof', icon: 'CloudSun', color: 'bg-teal-100 text-teal-700', accent: 'bg-teal-500' },
  { key: 'crawl_space', label: 'Crawl Space Inspection', short: 'Crawl Space', icon: 'ArrowDownToLine', color: 'bg-stone-100 text-stone-700', accent: 'bg-stone-500' },
  { key: 'appliance', label: 'Appliance Inspection', short: 'Appliance', icon: 'Flame', color: 'bg-red-100 text-red-700', accent: 'bg-red-500' },
  { key: 'masonry', label: 'Masonry Inspection', short: 'Masonry', icon: 'Layers', color: 'bg-amber-100 text-amber-800', accent: 'bg-amber-600' },
  { key: 'commercial', label: 'Commercial Inspection', short: 'Commercial', icon: 'Building2', color: 'bg-indigo-100 text-indigo-700', accent: 'bg-indigo-500' },
  { key: 'other', label: 'Other Inspection', short: 'Other', icon: 'MoreHorizontal', color: 'bg-gray-100 text-gray-700', accent: 'bg-gray-500' },
];

export const MODULE_KEYS = INSPECTION_MODULES.map(m => m.key);

// Modules that a technician can select during Inspection Setup (excludes 'inspection_setup' itself)
export const SELECTABLE_MODULES = INSPECTION_MODULES.filter(m => m.key !== 'inspection_setup');

export const MODULE_LABELS = Object.fromEntries(INSPECTION_MODULES.map(m => [m.key, m.label]));
export const MODULE_SHORT_LABELS = Object.fromEntries(INSPECTION_MODULES.map(m => [m.key, m.short]));
export const MODULE_COLORS = Object.fromEntries(INSPECTION_MODULES.map(m => [m.key, m.color]));
export const MODULE_ACCENTS = Object.fromEntries(INSPECTION_MODULES.map(m => [m.key, m.accent]));

export const INSPECTION_LEVELS = [
  { value: 'level_1', label: 'Level 1', description: 'Visual inspection of accessible areas' },
  { value: 'level_2', label: 'Level 2', description: 'Level 1 + accessible areas of chimney structure and attic' },
  { value: 'level_3', label: 'Level 3', description: 'Level 2 + concealed areas (may require demolition)' },
];

export const MODULE_STATUS_STYLES = {
  pending: { label: 'Pending', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  complete: { label: 'Complete', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  locked: { label: 'Locked', color: 'bg-zinc-100 text-zinc-500', dot: 'bg-zinc-400' },
  not_selected: { label: 'Not Selected', color: 'bg-slate-50 text-slate-400', dot: 'bg-slate-300' },
};

/**
 * Get the ordered inspection flow for a given set of selected modules.
 * Always starts with Inspection Setup, then selected modules in order, then Complete.
 */
export function getInspectionFlow(selectedModules = []) {
  const flow = [{ key: 'inspection_setup', label: 'Inspection Setup', required: true }];
  for (const mod of SELECTABLE_MODULES) {
    if (selectedModules.includes(mod.key)) {
      flow.push({ key: mod.key, label: mod.label, required: false });
    }
  }
  flow.push({ key: 'complete', label: 'Inspection Complete', required: true });
  return flow;
}

/**
 * Compute module progress from an InspectionSetup record.
 */
export function computeModuleProgress(setup) {
  if (!setup) return { setup: 'pending', overall: 0 };
  const progress = setup.module_progress ? JSON.parse(setup.module_progress) : {};
  const selected = setup.selected_modules || [];
  let completedCount = setup.status === 'complete' ? 1 : 0;
  const result = { setup: setup.status === 'complete' ? 'complete' : 'in_progress' };
  for (const mod of selected) {
    const st = progress[mod] || 'pending';
    result[mod] = st;
    if (st === 'complete') completedCount++;
  }
  const totalModules = 1 + selected.length;
  result.overall = Math.round((completedCount / totalModules) * 100);
  return result;
}