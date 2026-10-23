export const VEHICLE_CLASSES = [
  'Pickup Truck',
  'Cargo Van',
  'Dump Truck',
  'Flatbed',
  'Trailer',
  'Box Truck',
  'Utility Trailer',
  'Equipment Trailer',
  'Other',
];

export const COMMON_SKILLS = [
  'Masonry',
  'Roofing',
  'Chimney Repair',
  'Tuckpointing',
  'Crown Repair',
  'Flashing',
  'Waterproofing',
  'Lining Installation',
  'Cap Replacement',
  'Demolition',
  'Heavy Equipment Operation',
];

export const FLEET_PURPOSES = [
  'Debris removal',
  'Brick delivery',
  'Equipment transport',
  'Additional crew transportation',
  'Large material delivery',
];

export const WEATHER_SENSITIVITY_OPTIONS = [
  { value: 'none', label: 'None — Indoor work' },
  { value: 'low', label: 'Low — Light rain OK' },
  { value: 'medium', label: 'Medium — No heavy rain' },
  { value: 'high', label: 'High — Dry weather only' },
];

export const FLEET_REQUEST_STATUS_STYLE = {
  'Pending Assignment': 'bg-amber-100 text-amber-700',
  'Reserved': 'bg-blue-100 text-blue-700',
  'Assigned': 'bg-green-100 text-green-700',
  'Unavailable': 'bg-red-100 text-red-700',
};

export const SCAFFOLD_STATUS_STYLE = {
  not_required: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-100 text-amber-700',
  attached: 'bg-green-100 text-green-700',
};