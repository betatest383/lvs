export const RESOURCE_STATUSES = [
  'Draft',
  'Pending Classification',
  'Pending Review',
  'Approved',
  'Published',
  'Rejected',
  'Archived',
];

export const RESOURCE_STATUS_CONFIG = {
  'Draft': { label: 'Draft', badge: 'bg-slate-100 text-slate-700 border-slate-300', dot: 'bg-slate-400' },
  'Pending Classification': { label: 'Pending Classification', badge: 'bg-blue-100 text-blue-700 border-blue-300', dot: 'bg-blue-500' },
  'Pending Review': { label: 'Pending Review', badge: 'bg-amber-100 text-amber-700 border-amber-300', dot: 'bg-amber-500' },
  'Approved': { label: 'Approved', badge: 'bg-emerald-100 text-emerald-700 border-emerald-300', dot: 'bg-emerald-500' },
  'Published': { label: 'Published', badge: 'bg-green-100 text-green-700 border-green-300', dot: 'bg-green-500' },
  'Rejected': { label: 'Rejected', badge: 'bg-red-100 text-red-700 border-red-300', dot: 'bg-red-500' },
  'Archived': { label: 'Archived', badge: 'bg-gray-100 text-gray-500 border-gray-300', dot: 'bg-gray-400' },
};

export const RESOURCE_TYPES = [
  'Manual',
  'Brochure',
  'Image',
  'Parts Diagram',
  'Video',
  'Spec Sheet',
  'Warranty Document',
  'Installation Guide',
  'Service Guide',
  'Other',
];

export const RESOURCE_TYPE_ICONS = {
  'Manual': 'BookOpen',
  'Brochure': 'FileText',
  'Image': 'Image',
  'Parts Diagram': 'Schematic',
  'Video': 'Video',
  'Spec Sheet': 'ClipboardList',
  'Warranty Document': 'ShieldCheck',
  'Installation Guide': 'Wrench',
  'Service Guide': 'Settings',
  'Other': 'File',
};

export const SOURCE_PROVIDERS = [
  { value: 'manual_upload', label: 'Manual Upload', description: 'File uploaded manually by a user', isFuture: false },
  { value: 'hda', label: 'HDA Image Processor', description: 'HDA scanned and imported', isFuture: true },
  { value: 'manufacturer_api', label: 'Manufacturer API', description: 'Imported via manufacturer API', isFuture: true },
  { value: 'distributor_api', label: 'Distributor API', description: 'Imported via distributor API', isFuture: true },
  { value: 'ftp', label: 'FTP', description: 'Imported from FTP server', isFuture: true },
  { value: 'servicetitan', label: 'ServiceTitan', description: 'Imported from ServiceTitan', isFuture: true },
  { value: 'csv', label: 'CSV Import', description: 'Bulk imported from CSV', isFuture: true },
  { value: 'xml', label: 'XML Import', description: 'Bulk imported from XML', isFuture: true },
  { value: 'ai_crawler', label: 'AI Crawler', description: 'AI web crawler found and imported', isFuture: true },
];

export const SOURCE_PROVIDER_LABELS = SOURCE_PROVIDERS.reduce((acc, p) => {
  acc[p.value] = p.label;
  return acc;
}, {});

export const FUEL_TYPES = ['', 'Gas', 'Wood', 'Pellet', 'Coal', 'Oil', 'Electric', 'Multi-Fuel'];

export const APPLIANCE_TYPES = [
  '',
  'Fireplace',
  'Stove',
  'Insert',
  'Liner',
  'Chimney Cap',
  'Chimney System',
  'Boiler',
  'Furnace',
  'Water Heater',
  'Other',
];

export const MANUFACTURER_SUGGESTIONS = [
  'Majestic',
  'Napoleon',
  'Regency',
  'Osburn',
  'DuraVent',
  'Copperfield',
  'Olympia',
  'National Chimney',
  'New England Chimney',
  'Ray Murray',
];

export const VALID_TRANSITIONS = {
  'Draft': ['Pending Classification', 'Pending Review', 'Archived'],
  'Pending Classification': ['Pending Review', 'Draft', 'Archived'],
  'Pending Review': ['Approved', 'Rejected', 'Draft'],
  'Approved': ['Published', 'Pending Review', 'Archived'],
  'Published': ['Archived'],
  'Rejected': ['Draft', 'Archived'],
  'Archived': ['Draft'],
};

export const RESOURCE_NAV_ITEMS = [
  { label: 'Dashboard', path: '/resources', icon: 'LayoutDashboard' },
  { label: 'Resource Library', path: '/resources/library', icon: 'Library' },
  { label: 'Upload', path: '/resources/upload', icon: 'Upload' },
  { label: 'Approval Queue', path: '/resources/approvals', icon: 'CheckSquare' },
];

export function canUploadResource(user) {
  if (!user) return false;
  return ['admin', 'owner', 'warehouse_manager', 'warehouse_associate'].includes(user.role);
}

export function canClassifyResource(user) {
  if (!user) return false;
  return ['admin', 'owner', 'warehouse_manager'].includes(user.role);
}

export function canReviewResource(user) {
  if (!user) return false;
  return ['admin', 'owner'].includes(user.role);
}

export function canPublishResource(user) {
  if (!user) return false;
  return ['admin', 'owner'].includes(user.role);
}

export function canArchiveResource(user) {
  if (!user) return false;
  return ['admin', 'owner'].includes(user.role);
}

export function canManageResource(user, resource) {
  if (!user) return false;
  if (['admin', 'owner'].includes(user.role)) return true;
  if (['warehouse_manager', 'warehouse_associate'].includes(user.role)) {
    return ['Draft', 'Pending Classification', 'Pending Review'].includes(resource?.status);
  }
  return false;
}

export function canViewResource(user, resource) {
  if (!user) return false;
  if (['admin', 'owner'].includes(user.role)) return true;
  if (['warehouse_manager', 'warehouse_associate'].includes(user.role)) return true;
  return resource?.status === 'Published';
}

export function getStatusBadgeClass(status) {
  return RESOURCE_STATUS_CONFIG[status]?.badge || 'bg-slate-100 text-slate-700 border-slate-300';
}

export function getStatusDotClass(status) {
  return RESOURCE_STATUS_CONFIG[status]?.dot || 'bg-slate-400';
}

export function getStatusLabel(status) {
  return RESOURCE_STATUS_CONFIG[status]?.label || status;
}

export function getSourceProviderLabel(value) {
  return SOURCE_PROVIDER_LABELS[value] || value;
}

export function formatFileSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function parseAuditHistory(auditJson) {
  if (!auditJson) return [];
  try {
    return JSON.parse(auditJson);
  } catch (e) {
    return [];
  }
}

export function parseClassificationData(classificationJson) {
  if (!classificationJson) return null;
  try {
    return JSON.parse(classificationJson);
  } catch (e) {
    return null;
  }
}