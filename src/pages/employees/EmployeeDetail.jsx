import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeft, Pencil, UserCog } from 'lucide-react';
import EmployeeFormDialog from '@/components/lvcos/EmployeeFormDialog';
import ActAsUserDialog from '@/components/admin/ActAsUserDialog';
import PortalAccessSection from '@/components/employees/PortalAccessSection';
import { useAuth } from '@/lib/AuthContext';
import { EMPLOYMENT_STATUS_COLORS, EMPLOYMENT_TYPE_COLORS } from '@/lib/employeeRegistryConstants';
import { toast } from 'sonner';

import EmployeeOverviewTab from '@/components/employees/tabs/EmployeeOverviewTab';
import EmployeeRolesTab from '@/components/employees/tabs/EmployeeRolesTab';
import EmployeeTrainingTab from '@/components/employees/tabs/EmployeeTrainingTab';
import EmployeeCertificationsTab from '@/components/employees/tabs/EmployeeCertificationsTab';
import EmployeeEquipmentTab from '@/components/employees/tabs/EmployeeEquipmentTab';
import EmployeeFleetTab from '@/components/employees/tabs/EmployeeFleetTab';
import EmployeeSOPsTab from '@/components/employees/tabs/EmployeeSOPsTab';
import EmployeePoliciesTab from '@/components/employees/tabs/EmployeePoliciesTab';
import EmployeeAuditsTab from '@/components/employees/tabs/EmployeeAuditsTab';
import EmployeeCorrectiveActionsTab from '@/components/employees/tabs/EmployeeCorrectiveActionsTab';
import EmployeePerformanceTab from '@/components/employees/tabs/EmployeePerformanceTab';
import EmployeeCareerPathTab from '@/components/employees/tabs/EmployeeCareerPathTab';
import EmployeeDocumentsTab from '@/components/employees/tabs/EmployeeDocumentsTab';
import EmployeeActivityTab from '@/components/employees/tabs/EmployeeActivityTab';
import EmployeeOnboardingTab from '@/components/employees/tabs/EmployeeOnboardingTab';
import EmployeeAssignmentsTab from '@/components/employees/tabs/EmployeeAssignmentsTab';

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [actAsOpen, setActAsOpen] = useState(false);
  const [equipmentValue, setEquipmentValue] = useState(0);
  const [auditScore, setAuditScore] = useState(0);
  const [openCorrectiveActions, setOpenCorrectiveActions] = useState(0);
  const [trainingPct, setTrainingPct] = useState(0);
  const [certPct, setCertPct] = useState(0);

  useEffect(() => {
    base44.entities.EmployeeRegistry.get(id)
      .then(setEmployee)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;
  if (!employee) return <div className="text-center py-12 text-muted-foreground">Employee not found.</div>;

  const stats = { equipmentValue, auditScore, openCorrectiveActions, trainingPct, certPct, perfScore: Math.round((trainingPct + certPct + (auditScore > 0 ? auditScore : 100)) / (auditScore > 0 ? 3 : 2)) };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/lvcos/employees/registry')}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
        <div className="flex gap-2">
          {authUser?.role === 'admin' && employee?.employment_status !== 'Terminated' && (
            <Button size="sm" variant="outline" onClick={() => setActAsOpen(true)}>
              <UserCog className="w-3.5 h-3.5 mr-1" /> Act As
            </Button>
          )}
          <Button size="sm" onClick={() => setEditOpen(true)}><Pencil className="w-3.5 h-3.5 mr-1" /> Edit</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{employee.first_name} {employee.last_name}</h1>
                <span className="font-mono text-xs text-muted-foreground">{employee.employee_id}</span>
              </div>
              {employee.preferred_name && <p className="text-sm text-muted-foreground">"{employee.preferred_name}"</p>}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {employee.employment_status && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${EMPLOYMENT_STATUS_COLORS[employee.employment_status]}`}>{employee.employment_status}</span>}
                {employee.employment_type && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${EMPLOYMENT_TYPE_COLORS[employee.employment_type]}`}>{employee.employment_type}</span>}
                {employee.department && <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 font-medium">{employee.department}</span>}
                {employee.primary_role && <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{employee.primary_role}</span>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
          <TabsTrigger value="certifications">Certs</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
          <TabsTrigger value="fleet">Fleet</TabsTrigger>
          <TabsTrigger value="sops">SOPs</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="audits">Audits</TabsTrigger>
          <TabsTrigger value="corrective_actions">Corrective</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="career_path">Career Path</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="activity_timeline">Activity</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><EmployeeOverviewTab employee={employee} stats={stats} /></TabsContent>
        <TabsContent value="roles"><EmployeeRolesTab employee={employee} /></TabsContent>
        <TabsContent value="training"><EmployeeTrainingTab employee={employee} /></TabsContent>
        <TabsContent value="certifications"><EmployeeCertificationsTab employee={employee} /></TabsContent>
        <TabsContent value="equipment"><EmployeeEquipmentTab employee={employee} onValueCalculated={setEquipmentValue} /></TabsContent>
        <TabsContent value="fleet"><EmployeeFleetTab employee={employee} /></TabsContent>
        <TabsContent value="sops"><EmployeeSOPsTab employee={employee} /></TabsContent>
        <TabsContent value="policies"><EmployeePoliciesTab employee={employee} /></TabsContent>
        <TabsContent value="audits"><EmployeeAuditsTab employee={employee} /></TabsContent>
        <TabsContent value="corrective_actions"><EmployeeCorrectiveActionsTab employee={employee} /></TabsContent>
        <TabsContent value="performance"><EmployeePerformanceTab employee={employee} stats={stats} /></TabsContent>
        <TabsContent value="career_path"><EmployeeCareerPathTab employee={employee} /></TabsContent>
        <TabsContent value="documents"><EmployeeDocumentsTab employee={employee} /></TabsContent>
        <TabsContent value="activity_timeline"><EmployeeActivityTab employee={employee} /></TabsContent>
        <TabsContent value="onboarding"><EmployeeOnboardingTab employee={employee} /></TabsContent>
        <TabsContent value="assignments"><EmployeeAssignmentsTab employee={employee} authUser={authUser} /></TabsContent>
      </Tabs>

      <PortalAccessSection
        employee={employee}
        onEmployeeUpdated={(updated) => setEmployee({ ...employee, ...updated })}
      />

      <EmployeeFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initialData={employee}
        onSave={async (data) => {
          await base44.entities.EmployeeRegistry.update(employee.id, data);
          toast.success('Employee updated');
          setEmployee({ ...employee, ...data });
          setEditOpen(false);
        }}
      />

      {actAsOpen && (
        <ActAsUserDialog
          open={actAsOpen}
          onClose={() => setActAsOpen(false)}
          preselectedEmployeeId={employee.employee_id}
        />
      )}
    </div>
  );
}