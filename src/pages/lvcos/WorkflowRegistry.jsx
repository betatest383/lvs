import RegistryTablePage from '@/components/lvcos/RegistryTablePage';

const STATUS_COLORS = {
  Planned: 'bg-gray-100 text-gray-700',
  'In Development': 'bg-blue-100 text-blue-700',
  Testing: 'bg-amber-100 text-amber-700',
  Live: 'bg-green-100 text-green-700',
};

export default function WorkflowRegistry() {
  return (
    <RegistryTablePage config={{
      entityName: 'WorkflowRegistry',
      manageFunction: 'manageWorkflow',
      title: 'Workflow Registry',
      description: 'Master catalog of all workflows supporting LVC OS processes',
      idField: 'workflow_id',
      searchFields: ['workflow_id', 'title', 'department', 'description'],
      newItemLabel: 'New Workflow',
      saveLabel: 'Save Workflow',
      defaultData: { status: 'Planned' },
      columns: [
        { key: 'workflow_id', label: 'Workflow ID', mono: true },
        { key: 'title', label: 'Title' },
        { key: 'status', label: 'Status', badge: STATUS_COLORS },
        { key: 'department', label: 'Department', hideOnMobile: true },
        { key: 'owner', label: 'Owner', hideOnDesktop: true },
      ],
      filterConfig: [
        { key: 'department', label: 'Department', type: 'text' },
        { key: 'status', label: 'Status', type: 'select', options: ['Planned', 'In Development', 'Testing', 'Live'] },
      ],
      formSections: [
        { title: 'General Information', fields: [
          { key: 'workflow_id', label: 'Workflow ID', type: 'text', required: true, placeholder: 'e.g. WF-WH-001' },
          { key: 'title', label: 'Title', type: 'text', required: true },
          { key: 'department', label: 'Department', type: 'text', placeholder: 'e.g. Warehouse' },
          { key: 'description', label: 'Description', type: 'textarea' },
        ]},
        { title: 'Workflow Details', fields: [
          { key: 'trigger', label: 'Trigger', type: 'text', placeholder: 'e.g. Technician submits material request' },
          { key: 'steps', label: 'Steps', type: 'textarea', placeholder: 'Describe the workflow steps' },
          { key: 'owner', label: 'Owner', type: 'text' },
          { key: 'status', label: 'Status', type: 'select', options: ['Planned', 'In Development', 'Testing', 'Live'] },
          { key: 'automation_required', label: 'Automation Required', type: 'boolean' },
        ]},
        { title: 'Base44', fields: [
          { key: 'base44_module', label: 'Base44 Module', type: 'text', placeholder: 'e.g. Warehouse' },
          { key: 'trainual_url', label: 'Trainual URL', type: 'text' },
        ]},
        { title: 'Relationships', fields: [
          { key: 'related_sop_ids', label: 'Related SOP IDs (comma-separated)', type: 'text_list', placeholder: 'e.g. WH-101' },
          { key: 'related_form_ids', label: 'Related Form IDs (comma-separated)', type: 'text_list', placeholder: 'e.g. FRM-001' },
        ]},
      ],
    }} />
  );
}