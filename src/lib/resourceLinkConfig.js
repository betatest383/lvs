/**
 * Configuration for ProductResource relationship types.
 * Used by RelatedRecordsPanel, SearchableEntityPicker, and LinkedResourcesPanel.
 */

export const RELATIONSHIP_TYPES = [
  {
    key: 'manufacturer',
    label: 'Manufacturer',
    linkField: 'linked_manufacturer_id',
    isArray: false,
    entityName: 'Manufacturer',
    iconName: 'Factory',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    key: 'inventory',
    label: 'Inventory Master',
    linkField: 'linked_inventory_ids',
    isArray: true,
    entityName: 'InventoryMaster',
    iconName: 'Package',
    color: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  {
    key: 'service',
    label: 'Service Catalog',
    linkField: 'linked_service_ids',
    isArray: true,
    entityName: 'ServiceCatalog',
    iconName: 'Wrench',
    color: 'bg-green-50 text-green-700 border-green-200',
  },
  {
    key: 'repair_template',
    label: 'Repair Templates',
    linkField: 'linked_repair_template_ids',
    isArray: true,
    entityName: 'RepairRecommendationTemplate',
    iconName: 'ClipboardList',
    color: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  {
    key: 'training',
    label: 'Training Registry',
    linkField: 'linked_training_ids',
    isArray: true,
    entityName: 'TrainingRegistry',
    iconName: 'GraduationCap',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  {
    key: 'sop',
    label: 'SOP Registry',
    linkField: 'linked_sop_ids',
    isArray: true,
    entityName: 'SopRegistry',
    iconName: 'FileText',
    color: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  {
    key: 'inspection_question',
    label: 'Inspection Questions',
    linkField: 'linked_inspection_question_ids',
    isArray: true,
    entityName: 'InspectionQuestion',
    iconName: 'HelpCircle',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
  },
];

export const RELATIONSHIP_BY_KEY = RELATIONSHIP_TYPES.reduce((acc, r) => {
  acc[r.key] = r;
  return acc;
}, {});

export const RELATIONSHIP_BY_ENTITY = RELATIONSHIP_TYPES.reduce((acc, r) => {
  acc[r.entityName] = r;
  return acc;
}, {});