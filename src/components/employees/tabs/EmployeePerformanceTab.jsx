import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';

const InfoRow = ({ label, value }) => (
  <div className="flex justify-between items-start gap-2 py-1.5 border-b last:border-0">
    <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
    <span className="text-sm font-medium text-right">{value || '—'}</span>
  </div>
);

export default function EmployeePerformanceTab({ employee, stats }) {
  const perfScore = stats.perfScore || 0;
  const auditScore = stats.auditScore || 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-green-100 text-green-600"><TrendingUp className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{perfScore}/100</p><p className="text-xs text-muted-foreground">Performance Score</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold">{auditScore}%</p><p className="text-xs text-muted-foreground">Audit Score</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold">{stats.openCorrectiveActions}</p><p className="text-xs text-muted-foreground">Open Corrective Actions</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold">{stats.trainingPct}%</p><p className="text-xs text-muted-foreground">Training Completion</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Performance Overview</CardTitle></CardHeader>
        <CardContent>
          <InfoRow label="Current Status" value={employee.employment_status} />
          <InfoRow label="Employment Type" value={employee.employment_type} />
          <InfoRow label="Hire Date" value={employee.hire_date} />
          <InfoRow label="Years of Service" value={employee.hire_date ? `${Math.floor((new Date() - new Date(employee.hire_date)) / (365.25 * 24 * 60 * 60 * 1000))} years` : '—'} />
          <InfoRow label="Primary Role" value={employee.primary_role} />
          <InfoRow label="Department" value={employee.department} />
        </CardContent>
      </Card>
    </div>
  );
}