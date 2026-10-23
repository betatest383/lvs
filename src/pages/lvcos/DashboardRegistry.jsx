import RegistryTablePage from '@/components/lvcos/RegistryTablePage';

const STATUS_COLORS = {
  Planned: 'bg-gray-100 text-gray-700',
  'In Development': 'bg-blue-100 text-blue-700',
  Live: 'bg-green-100 text-green-700',
  Retired: 'bg-red-100 text-red-700',
};

export default function DashboardRegistry() {
  return (
    <RegistryTablePage config={{
      entityName: 'DashboardRegistry',
      title: 'Dashboard Registry',
      description: 'Master catalog of all dashboards supporting LVC OS processes',
      idField: 'dashboard_id',
      searchFields: ['dashboard_id', 'title', 'department', 'description'],
      newItemLabel: 'New Dashboard',
      saveLabel: 'Save Dashboard',
      defaultData: { status: 'Planned' },
      columns: [
        { key: 'dashboard_id', label: 'Dashboard ID', mono: true },
        { key: 'title', label: 'Title' },
        { key: 'status', label: 'Status', badge: STATUS_COLORS },
        { key: 'department', label: 'Department', hideOnMobile: true },
        { key: 'owner', label: 'Owner', hideOnDesktop: true },
      ],
      filterConfig: [
        { key: 'department', label: 'Department', type: 'text' },
        { key: 'status', label: 'Status', type: 'select', options: ['Planned', 'In Development', 'Live', 'Retired'] },
      ],
      formSections: [
        { title: 'General Information', fields: [
          { key: 'dashboard_id', label: 'Dashboard ID', type: 'text', required: true, placeholder: 'e.g. DSH-WH-001' },
          { key: 'title', label: 'Title', type: 'text', required: true },
          { key: 'department', label: 'Department', type: 'text', placeholder: 'e.g. Warehouse' },
          { key: 'description', label: 'Description', type: 'textarea' },
          { key: 'audience', label: 'Audience', type: 'text', placeholder: 'e.g. Warehouse Manager' },
        ]},
        { title: 'Configuration', fields: [
          { key: 'data_sources', label: 'Data Sources (comma-separated)', type: 'text_list', placeholder: 'e.g. MaterialTransferSheet, HardwareChecklist' },
          { key: 'refresh_frequency', label: 'Refresh Frequency', type: 'text', placeholder: 'e.g. Real-time, Daily' },
          { key: 'owner', label: 'Owner', type: 'text' },
          { key: 'status', label: 'Status', type: 'select', options: ['Planned', 'In Development', 'Live', 'Retired'] },
        ]},
        { title: 'Base44', fields: [
          { key: 'base44_module', label: 'Base44 Module', type: 'text', placeholder: 'e.g. Warehouse' },
          { key: 'url', label: 'URL', type: 'text', placeholder: 'https://...' },
        ]},
        { title: 'Relationships', fields: [
          { key: 'related_sop_ids', label: 'Related SOP IDs (comma-separated)', type: 'text_list', placeholder: 'e.g. WH-101' },
        ]},
      ],
    }} />
  );
}