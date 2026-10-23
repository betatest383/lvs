import RegistryTablePage from '@/components/lvcos/RegistryTablePage';

const STATUS_COLORS = {
  Planned: 'bg-gray-100 text-gray-700',
  Active: 'bg-green-100 text-green-700',
  'Under Review': 'bg-amber-100 text-amber-700',
  Retired: 'bg-red-100 text-red-700',
};

export default function BusinessProcessRegistry() {
  return (
    <RegistryTablePage config={{
      entityName: 'BusinessProcess',
      manageFunction: 'manageBusinessProcess',
      title: 'Business Process Registry',
      description: 'How the business runs — high-level processes that group SOPs, workflows, forms, and KPIs',
      idField: 'process_id',
      searchFields: ['process_id', 'title', 'department', 'owner', 'description'],
      newItemLabel: 'New Business Process',
      saveLabel: 'Save Process',
      defaultData: { status: 'Planned' },
      columns: [
        { key: 'process_id', label: 'Process ID', mono: true },
        { key: 'title', label: 'Business Process' },
        { key: 'owner', label: 'Owner', hideOnMobile: true },
        { key: 'department', label: 'Department', hideOnMobile: true },
        { key: 'status', label: 'Status', badge: STATUS_COLORS },
      ],
      filterConfig: [
        { key: 'department', label: 'Department', type: 'text' },
        { key: 'status', label: 'Status', type: 'select', options: ['Planned', 'Active', 'Under Review', 'Retired'] },
      ],
      formSections: [
        { title: 'General Information', fields: [
          { key: 'process_id', label: 'Process ID', type: 'text', required: true, placeholder: 'e.g. BP-001' },
          { key: 'title', label: 'Business Process', type: 'text', required: true, placeholder: 'e.g. Morning Warehouse Operations' },
          { key: 'department', label: 'Department', type: 'text', placeholder: 'e.g. Warehouse' },
          { key: 'owner', label: 'Owner', type: 'text', placeholder: 'e.g. Warehouse Manager' },
          { key: 'status', label: 'Status', type: 'select', options: ['Planned', 'Active', 'Under Review', 'Retired'] },
        ]},
        { title: 'Process Details', fields: [
          { key: 'description', label: 'Description', type: 'textarea' },
          { key: 'trigger', label: 'Trigger', type: 'text', placeholder: 'What starts this process' },
          { key: 'frequency', label: 'Frequency', type: 'text', placeholder: 'e.g. Daily, Weekly, As-needed' },
          { key: 'participants', label: 'Participants (comma-separated)', type: 'text_list', placeholder: 'e.g. Warehouse Associate, Warehouse Manager' },
        ]},
        { title: 'Relationships', fields: [
          { key: 'related_sop_ids', label: 'Related SOP IDs (comma-separated)', type: 'text_list', placeholder: 'e.g. WH-101' },
          { key: 'related_workflow_ids', label: 'Related Workflow IDs (comma-separated)', type: 'text_list', placeholder: 'e.g. WF-WH-001' },
          { key: 'related_form_ids', label: 'Related Form IDs (comma-separated)', type: 'text_list', placeholder: 'e.g. FRM-WH-001' },
          { key: 'related_kpi_ids', label: 'Related KPI IDs (comma-separated)', type: 'text_list', placeholder: 'e.g. KPI-WH-001' },
        ]},
        { title: 'Base44', fields: [
          { key: 'base44_module', label: 'Base44 Module', type: 'text', placeholder: 'e.g. Warehouse' },
          { key: 'notes', label: 'Notes', type: 'textarea' },
        ]},
      ],
    }} />
  );
}