export const WORK_ACTIVITIES = [
  'Tear down chimney',
  'Install liner',
  'Install cap',
  'Rebuild crown',
  'Waterproof chimney',
  'Set scaffold',
  'Remove scaffold',
  'Install chase cover',
  'Perform cleanup',
  'Repair flashing',
  'Repoint mortar joints',
  'Install damper',
  'Rebuild firebox',
  'Install insert',
  'Chimney sweep',
  'Camera inspection',
  'Smoke test',
  'Pressure wash',
  'Apply sealant',
  'Remove debris',
  'Install hearth',
  'Repair smoke chamber',
  'Waterproof exterior',
  'Install flashing',
];

export const EQUIPMENT_CATEGORIES = [
  {
    key: 'access_equipment',
    label: 'Access Equipment',
    items: ['Ladders', 'Scaffolding', 'Lift', 'Roof Access Equipment', 'Harness / Safety Line'],
  },
  {
    key: 'masonry_equipment',
    label: 'Masonry Equipment',
    items: ['Trowels', 'Mixer', 'Grinder', 'Chisel Set', 'Jointer', 'Masonry Saw'],
  },
  {
    key: 'liner_equipment',
    label: 'Liner Equipment',
    items: ['Liner Kit', 'Pull Cone', 'Rope', 'Winch', 'Liner Insulation'],
  },
  {
    key: 'fireplace_equipment',
    label: 'Fireplace / Insert Equipment',
    items: ['Insert Pulling Straps', 'Stove Pipe', 'Thimble', 'Firebrick', 'Refractory Cement'],
  },
  {
    key: 'cleaning_equipment',
    label: 'Cleaning Equipment',
    items: ['Roof Brush', 'Rod System', 'Vacuum', 'Drop Cloth', 'Ash Vacuum'],
  },
  {
    key: 'safety_equipment',
    label: 'Safety Equipment',
    items: ['Hard Hat', 'Safety Glasses', 'Gloves', 'Respirator', 'Fall Protection', 'High Vis Vest'],
  },
  {
    key: 'power_tools',
    label: 'Power Tools',
    items: ['Drill', 'Impact Driver', 'Circular Saw', 'Angle Grinder', 'Rotary Hammer'],
  },
  {
    key: 'vehicles',
    label: 'Vehicles / Trailers',
    items: ['Box Truck', 'Trailer', 'Extra Vehicle'],
  },
  {
    key: 'specialty_equipment',
    label: 'Specialty Equipment',
    items: ['Camera System', 'Thermometer', 'Manometer', 'Moisture Meter', 'Combustion Analyzer'],
  },
];

export const STAGING_TEMPLATES = {
  Scaffolding: [
    'Stage scaffold frames',
    'Stage planks',
    'Stage outriggers',
    'Stage safety rails',
  ],
  Lift: [
    'Confirm lift delivery location',
    'Confirm lift access path',
    'Stage cones / safety perimeter',
  ],
  'Extra Vehicle': [
    'Stage vehicle parking location',
    'Assign driver / responsible person',
  ],
};

export const ROOF_PITCH_OPTIONS = [
  { value: '0_12_to_6_12', label: '0/12 to 6/12' },
  { value: '6_12_to_12_12', label: '6/12 to 12/12' },
];

export function isScaffoldSelected(equipmentItems = []) {
  return equipmentItems.some(e => e === 'Scaffolding' || e.label === 'Scaffolding');
}

export function isLiftSelected(equipmentItems = []) {
  return equipmentItems.some(e => e === 'Lift' || e.label === 'Lift');
}

export function normalizeEquipmentItems(items) {
  if (!items) return [];
  if (Array.isArray(items) && items.every(i => typeof i === 'string')) return items;
  if (Array.isArray(items)) return items.map(i => (typeof i === 'string' ? i : i.label || i.name || ''));
  if (typeof items === 'string') {
    try { return JSON.parse(items); } catch { return []; }
  }
  return [];
}