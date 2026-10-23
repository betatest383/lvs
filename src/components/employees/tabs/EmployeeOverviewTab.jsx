import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EMPLOYMENT_STATUS_COLORS, EMPLOYMENT_TYPE_COLORS } from '@/lib/employeeRegistryConstants';
import { CheckCircle2, XCircle, TrendingUp, Award, Package, AlertTriangle } from 'lucide-react';

const InfoRow = ({ label, value }) => (
  <div className="flex justify-between items-start gap-2 py-1.5 border-b last:border-0">
    <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
    <span className="text-sm font-medium text-right">{value || '—'}</span>
  </div>
);

export default function EmployeeOverviewTab({ employee, stats }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-blue-100 text-blue-600"><TrendingUp className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{stats.trainingPct}%</p><p className="text-xs text-muted-foreground">Training Done</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-purple-100 text-purple-600"><Award className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{stats.certPct}%</p><p className="text-xs text-muted-foreground">Cert Compliance</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-green-100 text-green-600"><Package className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">${(stats.equipmentValue || 0).toLocaleString()}</p><p className="text-xs text-muted-foreground">Equipment Value</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-amber-100 text-amber-600"><AlertTriangle className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{stats.openCorrectiveActions}</p><p className="text-xs text-muted-foreground">Open Corrective Actions</p>
        </CardContent></Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Profile</CardTitle></CardHeader>
          <CardContent>
            <InfoRow label="Employee ID" value={employee.employee_id} />
            <InfoRow label="Full Name" value={`${employee.first_name} ${employee.last_name}`} />
            <InfoRow label="Preferred Name" value={employee.preferred_name} />
            <InfoRow label="Email" value={employee.email} />
            <InfoRow label="Phone" value={employee.phone} />
            <InfoRow label="Department" value={employee.department} />
            <InfoRow label="Employment Status" value={<span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${EMPLOYMENT_STATUS_COLORS[employee.employment_status]}`}>{employee.employment_status}</span>} />
            <InfoRow label="Employment Type" value={<span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${EMPLOYMENT_TYPE_COLORS[employee.employment_type]}`}>{employee.employment_type}</span>} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Assignment & System</CardTitle></CardHeader>
          <CardContent>
            <InfoRow label="Primary Role" value={employee.primary_role} />
            <InfoRow label="Supervisor" value={employee.supervisor} />
            <InfoRow label="Assigned Truck" value={employee.assigned_truck} />
            <InfoRow label="Equipment Package" value={employee.assigned_equipment_package} />
            <InfoRow label="Hire Date" value={employee.hire_date} />
            <InfoRow label="Start Date" value={employee.start_date} />
            <InfoRow label="Base44 Role" value={employee.base44_user_role} />
            <InfoRow label="ServiceTitan ID" value={employee.servicetitan_employee_id} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}