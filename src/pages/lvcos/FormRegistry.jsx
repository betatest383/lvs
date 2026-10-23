import RegistryTablePage from '@/components/lvcos/RegistryTablePage';

const STATUS_COLORS = {
  Planned: 'bg-gray-100 text-gray-700',
  Draft: 'bg-gray-100 text-gray-700',
  Active: 'bg-green-100 text-green-700',
  Retired: 'bg-red-100 text-red-700',
};

export default function FormRegistry() {
  return (
    <RegistryTablePage config={{
      entityName: 'FormRegistry',
      title: 'Forms Registry',
      description: 'Master catalog of all forms supporting LVC OS processes',
      idField: 'form_id',
      searchFields: ['form_id', 'title', 'department', 'description'],
      newItemLabel: 'New Form',
      saveLabel: 'Save Form',
      defaultData: { status: 'Draft' },
      columns: [
        { key: 'form_id', label: 'Form ID', mono: true },
        { key: 'title', label: 'Title' },
        { key: 'status', label: 'Status', badge: STATUS_COLORS },
        { key: 'department', label: 'Department', hideOnMobile: true },
        { key: 'owner', label: 'Owner', hideOnDesktop: true },
      ],
      filterConfig: [
        { key: 'department', label: 'Department', type: 'text' },
        { key: 'status', label: 'Status', type: 'select', options: ['Planned', 'Draft', 'Active', 'Retired'] },
      ],
      formSections: [
        { title: 'General Information', fields: [
          { key: 'form_id', label: 'Form ID', type: 'text', required: true, placeholder: 'e.g. FRM-001' },
          { key: 'title', label: 'Title', type: 'text', required: true },
          { key: 'department', label: 'Department', type: 'text', placeholder: 'e.g. Warehouse' },
          { key: 'description', label: 'Description', type: 'textarea' },
          { key: 'purpose', label: 'Purpose', type: 'textarea' },
        ]},
        { title: 'Ownership & Status', fields: [
          { key: 'owner', label: 'Owner', type: 'text' },
          { key: 'status', label: 'Status', type: 'select', options: ['Planned', 'Draft', 'Active', 'Retired'] },
          { key: 'base44_module', label: 'Base44 Module', type: 'text', placeholder: 'e.g. Warehouse' },
          { key: 'trainual_url', label: 'Trainual URL', type: 'text' },
        ]},
        { title: 'Relationships', fields: [
          { key: 'related_sop_ids', label: 'Related SOP IDs (comma-separated)', type: 'text_list', placeholder: 'e.g. WH-101' },
        ]},
      ],
    }} />
  );
}