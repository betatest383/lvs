import RegistryTablePage from '@/components/lvcos/RegistryTablePage';

const STATUS_COLORS = {
  Planned: 'bg-gray-100 text-gray-700',
  Tracking: 'bg-blue-100 text-blue-700',
  Active: 'bg-green-100 text-green-700',
  Retired: 'bg-red-100 text-red-700',
};

export default function KpiRegistryPage() {
  return (
    <RegistryTablePage config={{
      entityName: 'KpiRegistry',
      title: 'KPI Registry',
      description: 'Master catalog of all KPIs supporting LVC OS processes',
      idField: 'kpi_id',
      searchFields: ['kpi_id', 'title', 'department', 'description'],
      newItemLabel: 'New KPI',
      saveLabel: 'Save KPI',
      defaultData: { status: 'Planned' },
      columns: [
        { key: 'kpi_id', label: 'KPI ID', mono: true },
        { key: 'title', label: 'Title' },
        { key: 'status', label: 'Status', badge: STATUS_COLORS },
        { key: 'department', label: 'Department', hideOnMobile: true },
        { key: 'owner', label: 'Owner', hideOnDesktop: true },
      ],
      filterConfig: [
        { key: 'department', label: 'Department', type: 'text' },
        { key: 'status', label: 'Status', type: 'select', options: ['Planned', 'Tracking', 'Active', 'Retired'] },
      ],
      formSections: [
        { title: 'General Information', fields: [
          { key: 'kpi_id', label: 'KPI ID', type: 'text', required: true, placeholder: 'e.g. KPI-WH-001' },
          { key: 'title', label: 'Title', type: 'text', required: true },
          { key: 'department', label: 'Department', type: 'text', placeholder: 'e.g. Warehouse' },
          { key: 'description', label: 'Description', type: 'textarea' },
        ]},
        { title: 'Measurement', fields: [
          { key: 'measurement', label: 'Measurement', type: 'text', placeholder: 'How this KPI is measured' },
          { key: 'target', label: 'Target', type: 'text', placeholder: 'e.g. < 15 minutes' },
          { key: 'frequency', label: 'Frequency', type: 'text', placeholder: 'e.g. Daily, Weekly' },
          { key: 'owner', label: 'Owner', type: 'text' },
          { key: 'status', label: 'Status', type: 'select', options: ['Planned', 'Tracking', 'Active', 'Retired'] },
        ]},
        { title: 'Base44', fields: [
          { key: 'base44_module', label: 'Base44 Module', type: 'text', placeholder: 'e.g. Warehouse' },
        ]},
        { title: 'Relationships', fields: [
          { key: 'related_dashboard_id', label: 'Related Dashboard ID', type: 'text', placeholder: 'e.g. DSH-WH-001' },
          { key: 'related_sop_ids', label: 'Related SOP IDs (comma-separated)', type: 'text_list', placeholder: 'e.g. WH-101' },
        ]},
      ],
    }} />
  );
}