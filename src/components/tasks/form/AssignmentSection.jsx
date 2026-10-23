import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import RegistrySearchCombobox from '@/components/shared/RegistrySearchCombobox';
import EmployeePicker from '@/components/shared/EmployeePicker';
import { searchEmployees, resolveEmployees, searchRoles, resolveRoles } from '@/lib/taskSearchFunctions';
import { DEPARTMENTS } from '@/lib/enterpriseTaskConstants';

const ASSIGNMENT_MODES = [
  { value: 'specific_employee', label: 'Specific Employee' },
  { value: 'multiple_employees', label: 'Multiple Employees' },
  { value: 'role_queue', label: 'Role Queue' },
  { value: 'department_queue', label: 'Department Queue' },
  { value: 'eligibility_engine', label: 'Eligibility Engine' },
  { value: 'manager_selects', label: 'Manager Selects' },
];

export default function AssignmentSection({ data, updateField }) {
  const handleEmployeeSelect = (selection) => {
    if (!selection) {
      updateField('assigned_employee_registry_id', '');
      updateField('assigned_to', '');
      updateField('assigned_to_email', '');
      updateField('assigned_to_linked_user_id', '');
      updateField('assigned_role', '');
      return;
    }
    updateField('assigned_employee_registry_id', selection.employee_registry_id);
    updateField('assigned_to', selection.employee_name);
    updateField('assigned_to_email', selection.employee_email);
    updateField('assigned_to_linked_user_id', selection.linked_user_id);
    updateField('assigned_role', selection.primary_role);
    updateField('assigned_department', selection.department || data.assigned_department);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Assignment Mode</Label>
        <Select value={data.assignment_mode || 'specific_employee'} onValueChange={v => updateField('assignment_mode', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ASSIGNMENT_MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {(data.assignment_mode === 'specific_employee' || !data.assignment_mode) && (
        <div className="space-y-1.5">
          <Label className="text-xs">Primary Assigned Employee</Label>
          <EmployeePicker
            value={data.assigned_employee_registry_id}
            onChange={handleEmployeeSelect}
            label=""
            allowInactiveToggle={false}
          />
        </div>
      )}

      {data.assignment_mode === 'multiple_employees' && (
        <div className="space-y-1.5">
          <Label className="text-xs">Assigned Employees</Label>
          <RegistrySearchCombobox
            multi
            value={data.assigned_employee_ids || []}
            onChange={(ids) => updateField('assigned_employee_ids', ids)}
            searchFn={searchEmployees}
            resolveFn={resolveEmployees}
            placeholder="Search employees…"
          />
        </div>
      )}

      {data.assignment_mode === 'role_queue' && (
        <div className="space-y-1.5">
          <Label className="text-xs">Assigned Role</Label>
          <RegistrySearchCombobox
            value={data.assigned_role_id || ''}
            onChange={(id) => updateField('assigned_role_id', id)}
            searchFn={searchRoles}
            resolveFn={resolveRoles}
            placeholder="Search roles…"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Assigned Department</Label>
        <Select value={data.assigned_department || ''} onValueChange={v => updateField('assigned_department', v)}>
          <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
          <SelectContent>
            {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Required Employee Count</Label>
        <input
          type="number"
          min="1"
          value={data.required_employee_count || 1}
          onChange={e => updateField('required_employee_count', parseInt(e.target.value) || 1)}
          className="w-full rounded-md border border-input px-3 py-1.5 text-sm"
        />
      </div>
    </div>
  );
}