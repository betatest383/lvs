import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLocation } from 'react-router-dom';
import {
  Bug, ShieldCheck, RefreshCw, LogOut, ChevronDown, ChevronUp,
  Users, Truck, Wrench, CheckSquare, Bell, Sunrise, GraduationCap,
  Award, FileText, Eye, EyeOff, AlertTriangle, CheckCircle2, Calendar, Package,
} from 'lucide-react';
import moment from 'moment';

function DataSourceRow({ label, connected, error, testMode }) {
  return (
    <div className="flex items-center justify-between text-xs py-1">
      <span className="text-muted-foreground">{label}</span>
      {connected ? (
        <Badge className="bg-green-100 text-green-700 gap-1">
          <CheckCircle2 className="w-3 h-3" /> {testMode ? 'Connected' : '✓'}
        </Badge>
      ) : (
        <Badge className="bg-amber-100 text-amber-700 gap-1" title={error || 'Failed to load'}>
          <AlertTriangle className="w-3 h-3" /> Missing Link
        </Badge>
      )}
    </div>
  );
}

function DevField({ label, value, mono }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start justify-between gap-2 text-xs py-0.5">
      <span className="text-muted-foreground flex-shrink-0">{label}:</span>
      <span className={`text-right ${mono ? 'font-mono text-[11px]' : 'font-medium'}`}>{String(value)}</span>
    </div>
  );
}

const QUICK_LINKS = [
  { label: 'Employee Registry', to: '/lvcos/employees', icon: Users },
  { label: 'Truck Profile', to: '/tech/truck', icon: Truck },
  { label: 'Equipment', to: '/tech/equipment', icon: Wrench },
  { label: 'Enterprise Tasks', to: '/tasks/my-tasks', icon: CheckSquare },
  { label: 'Notifications', to: '/notifications/my', icon: Bell },
  { label: 'WH-105 Record', to: '/tech/readiness', icon: Sunrise },
  { label: 'Training', to: '/tech/hr', icon: GraduationCap },
  { label: 'Certifications', to: '/lvcos/certifications', icon: Award },
];

export default function DeveloperInfoPanel({
  actualUser,
  employee,
  isImpersonating,
  effectiveEmail,
  effectiveName,
  effectiveRole,
  effectiveDepartment,
  effectiveEmployeeId,
  effectiveTruck,
  equipmentPackage,
  resolvedTruck,
  resolvedEquipmentPackage,
  lastLogin,
  todayJobsCount,
  todayJobsQuery,
  truckResolutionInfo,
  jobsResolutionInfo,
  tasksResolutionInfo,
  wh105RecordId,
  wh105Status,
  taskCount,
  unreadNotificationCount,
  dataSources,
  onRefresh,
  onEndImpersonation,
  testMode,
  onToggleTestMode,
  impersonationStartedAt,
  resolvedRole,
  sidebarConfigUsed,
  dashboardConfigUsed,
  permissionProfileUsed,
  equipmentPackageResolutionInfo,
}) {
  const [expanded, setExpanded] = useState(true);
  const location = useLocation();
  const [lastRefresh, setLastRefresh] = useState(new Date().toISOString());

  useEffect(() => {
    setLastRefresh(new Date().toISOString());
  }, [dataSources, taskCount, unreadNotificationCount, wh105Status]);

  if (!isImpersonating) return null;

  const sources = [
    { label: 'Employee Registry', connected: dataSources?.employeeRegistry },
    { label: 'Role Registry', connected: dataSources?.roleRegistry },
    { label: 'Equipment Management', connected: dataSources?.equipment },
    { label: 'Equipment Package', connected: dataSources?.equipmentPackage },
    { label: 'Fleet Management', connected: dataSources?.fleet },
    { label: 'Enterprise Tasks', connected: dataSources?.tasks },
    { label: 'Enterprise Notifications', connected: dataSources?.notifications },
    { label: 'WH-105', connected: dataSources?.wh105 },
    { label: 'Training Registry', connected: dataSources?.training },
    { label: 'Certification Registry', connected: dataSources?.certifications },
    { label: 'Policy Registry', connected: dataSources?.policies },
  ];

  return (
    <Card className="border-2 border-amber-300 shadow-md">
      <CardHeader className="pb-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bug className="w-4 h-4 text-amber-600" />
            Developer Information
            <Badge className="bg-amber-500 text-white text-[10px]">ADMIN ONLY</Badge>
          </CardTitle>
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleTestMode}
              className="h-7 text-xs"
            >
              {testMode ? <EyeOff className="w-3.5 h-3.5 mr-1" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
              {testMode ? 'Hide IDs' : 'Test Mode'}
            </Button>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          {/* Identity Section */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide pb-1 border-b">Identity</p>
              <DevField label="Actual User" value={actualUser?.full_name} />
              <DevField label="Actual Email" value={actualUser?.email} mono />
              <DevField label="Impersonated Employee" value={effectiveName} />
              <DevField label="Employee ID" value={effectiveEmployeeId} mono={testMode} />
              <DevField label="Role (raw)" value={effectiveRole} />
              <DevField label="Resolved Role" value={resolvedRole} mono />
              <DevField label="Sidebar Config Used" value={sidebarConfigUsed} />
              <DevField label="Dashboard Config Used" value={dashboardConfigUsed} />
              <DevField label="Permission Profile Used" value={permissionProfileUsed} />
              <DevField label="Department" value={effectiveDepartment} />
              {testMode && <DevField label="Linked User ID" value={employee?.linked_user_id} mono />}
              {testMode && <DevField label="Auth Email" value={effectiveEmail} mono />}
              {testMode && <DevField label="Registry Record ID" value={employee?.id} mono />}
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide pb-1 border-b">Assignment & Lookup</p>
              <DevField label="Raw assigned_truck" value={employee?.assigned_truck} mono={testMode} />
              <DevField label="Resolved Truck ID" value={resolvedTruck?.truck_id || '—'} mono={testMode} />
              <DevField label="Resolved Truck Number" value={resolvedTruck?.truck_number || '—'} />
              <DevField label="Resolved Truck Status" value={resolvedTruck?.status || '—'} />
              <DevField label="Raw assigned_equipment_package" value={employee?.assigned_equipment_package || equipmentPackage} mono={testMode} />
              <DevField label="Resolved Package ID" value={resolvedEquipmentPackage?.package_id || '—'} mono={testMode} />
              <DevField label="Resolved Package Name" value={resolvedEquipmentPackage?.package_name || '—'} />
              <DevField label="Raw last_login" value={lastLogin} mono={testMode} />
              <DevField label="Last Login (formatted)" value={lastLogin ? moment(lastLogin).format('MMM D, h:mm A') : '—'} />
              <DevField label="Today's Jobs Count" value={todayJobsCount} />
              <DevField label="Current Dashboard" value={employee?.default_dashboard} />
              <DevField label="WH-105 Record ID" value={wh105RecordId} mono={testMode} />
              <DevField label="WH-105 Status" value={wh105Status} />
              <DevField label="Today's Tasks" value={taskCount} />
              <DevField label="Unread Notifications" value={unreadNotificationCount} />
            </div>
          </div>

          {/* Session / Route Section */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide pb-1 border-b">Session</p>
              <DevField label="Current Route" value={location.pathname} mono={testMode} />
              <DevField label="Impersonation Started" value={impersonationStartedAt ? moment(impersonationStartedAt).format('MMM D, h:mm:ss A') : '—'} />
              {testMode && <DevField label="Last Refresh" value={moment(lastRefresh).format('h:mm:ss A')} />}
              {testMode && <DevField label="Session ID" value={employee?.id?.slice(-8)} mono />}
              <DevField
                label="Data Source"
                value={isImpersonating ? 'Impersonated EmployeeRegistry' : 'Authenticated User'}
              />
            </div>

            {/* Data Source Validation */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide pb-1 border-b">Data Sources</p>
              <div className="rounded-lg bg-muted/40 p-2">
                {sources.map(s => (
                  <DataSourceRow key={s.label} {...s} testMode={testMode} />
                ))}
              </div>
            </div>
          </div>

          {/* Today's Jobs Debug */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide pb-1 border-b">Today's Jobs Query Debug</p>
            <div className="rounded-lg bg-muted/40 p-2 space-y-1">
              {todayJobsQuery ? (
                <>
                  <DevField label="Filter" value={todayJobsQuery.filter} mono />
                  <DevField label="Date Filter" value={todayJobsQuery.date_filter} mono />
                  <DevField label="Status Filter" value={todayJobsQuery.status_filter} />
                  <DevField label="Total Jobs Fetched" value={todayJobsQuery.total_jobs_fetched} />
                  <DevField label="Result Count" value={todayJobsCount} />
                </>
              ) : (
                <p className="text-xs text-muted-foreground py-1">No query data available</p>
              )}
            </div>
          </div>

          {/* Relationship Resolution Debug */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide pb-1 border-b">Relationship Resolution Debug</p>

            {/* Truck Resolution Chain */}
            <div className="rounded-lg bg-muted/40 p-3 space-y-1">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                <Truck className="w-3.5 h-3.5" /> Assigned Truck Resolution
              </p>
              <div className="text-[11px] font-mono space-y-1 pl-4">
                <div>
                  <span className="text-muted-foreground">EmployeeRegistry.assigned_truck:</span>{' '}
                  <span className="font-medium">{truckResolutionInfo?.lookup_value || '(empty)'}</span>
                </div>
                <div className="text-muted-foreground">↓</div>
                <div>
                  <span className="text-muted-foreground">Lookup field used:</span>{' '}
                  <span className="font-medium">{truckResolutionInfo?.lookup_field || '—'}</span>
                </div>
                <div className="text-muted-foreground">↓</div>
                <div>
                  <span className="text-muted-foreground">TruckProfile field searched:</span>{' '}
                  <span className="font-medium">truck_id, truck_number</span>
                </div>
                <div className="text-muted-foreground">↓</div>
                <div>
                  <span className="text-muted-foreground">Matched by:</span>{' '}
                  <span className={`font-medium ${truckResolutionInfo?.matched_by ? 'text-green-600' : 'text-red-600'}`}>
                    {truckResolutionInfo?.matched_by || 'No Match'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Matching record ID:</span>{' '}
                  <span className="font-medium">{truckResolutionInfo?.matching_record_id || 'No Match'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Trucks checked:</span>{' '}
                  <span className="font-medium">{truckResolutionInfo?.total_trucks_checked ?? '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Fallback used:</span>{' '}
                  <span className="font-medium">{truckResolutionInfo?.fallback_used ? 'Yes (VehicleAssignment)' : 'No'}</span>
                </div>
                {truckResolutionInfo?.reason && (
                  <div className="text-red-600 font-medium pt-1 border-t mt-1">
                    ⚠ {truckResolutionInfo.reason}
                  </div>
                )}
              </div>
            </div>

            {/* Equipment Package Resolution Chain */}
            <div className="rounded-lg bg-muted/40 p-3 space-y-1">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                <Package className="w-3.5 h-3.5" /> Equipment Package Resolution
              </p>
              <div className="text-[11px] font-mono space-y-1 pl-4">
                <div>
                  <span className="text-muted-foreground">Resolution chain:</span>{' '}
                  <span className="font-medium block mt-0.5">{equipmentPackageResolutionInfo?.resolution_chain || '—'}</span>
                </div>
                <div className="text-muted-foreground">↓</div>
                <div>
                  <span className="text-muted-foreground">Truck ID:</span>{' '}
                  <span className="font-medium">{equipmentPackageResolutionInfo?.truck_id || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Truck Number:</span>{' '}
                  <span className="font-medium">{equipmentPackageResolutionInfo?.truck_number || '—'}</span>
                </div>
                <div className="text-muted-foreground">↓</div>
                <div>
                  <span className="text-muted-foreground">Raw assigned_equipment_package_id:</span>{' '}
                  <span className="font-medium">{equipmentPackageResolutionInfo?.raw_assigned_equipment_package_id || '(empty)'}</span>
                </div>
                <div className="text-muted-foreground">↓</div>
                <div>
                  <span className="text-muted-foreground">Resolved Package ID:</span>{' '}
                  <span className={`font-medium ${equipmentPackageResolutionInfo?.resolved_package_id ? 'text-green-600' : 'text-red-600'}`}>
                    {equipmentPackageResolutionInfo?.resolved_package_id || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Resolved Package Name:</span>{' '}
                  <span className={`font-medium ${equipmentPackageResolutionInfo?.resolved_package_name ? 'text-green-600' : 'text-red-600'}`}>
                    {equipmentPackageResolutionInfo?.resolved_package_name || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Assignment Source:</span>{' '}
                  <span className="font-medium">{equipmentPackageResolutionInfo?.assignment_source || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Lookup Status:</span>{' '}
                  <span className={`font-medium ${equipmentPackageResolutionInfo?.lookup_status === 'Resolved' ? 'text-green-600' : 'text-red-600'}`}>
                    {equipmentPackageResolutionInfo?.lookup_status || '—'}
                  </span>
                </div>
                {equipmentPackageResolutionInfo?.assignment_timestamp && (
                  <div>
                    <span className="text-muted-foreground">Assigned:</span>{' '}
                    <span className="font-medium">{moment(equipmentPackageResolutionInfo.assignment_timestamp).format('MMM D, h:mm A')}</span>
                  </div>
                )}
                {equipmentPackageResolutionInfo?.assigned_by && (
                  <div>
                    <span className="text-muted-foreground">Assigned By:</span>{' '}
                    <span className="font-medium">{equipmentPackageResolutionInfo.assigned_by}</span>
                  </div>
                )}
                {equipmentPackageResolutionInfo?.legacy_employee_package_id && equipmentPackageResolutionInfo.legacy_employee_package_id !== '(empty)' && (
                  <div className="pt-1 border-t mt-1">
                    <span className="text-muted-foreground">Legacy EmployeeRegistry ID:</span>{' '}
                    <span className="font-medium">{equipmentPackageResolutionInfo.legacy_employee_package_id}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Today's Jobs Resolution Chain */}
            <div className="rounded-lg bg-muted/40 p-3 space-y-1">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Today's Jobs Resolution
              </p>
              <div className="text-[11px] font-mono space-y-1 pl-4">
                <div>
                  <span className="text-muted-foreground">Employee ID:</span>{' '}
                  <span className="font-medium">{jobsResolutionInfo?.lookup_keys?.employee_id || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Employee Email:</span>{' '}
                  <span className="font-medium">{jobsResolutionInfo?.lookup_keys?.employee_email || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Employee Name:</span>{' '}
                  <span className="font-medium">{jobsResolutionInfo?.lookup_keys?.employee_name || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">ServiceTitan Technician ID:</span>{' '}
                  <span className="font-medium">{jobsResolutionInfo?.lookup_keys?.servicetitan_technician_id || '—'}</span>
                </div>
                <div className="text-muted-foreground">↓</div>
                <div>
                  <span className="text-muted-foreground">Query executed:</span>{' '}
                  <span className="font-medium block mt-0.5">{jobsResolutionInfo?.query_executed || '—'}</span>
                </div>
                <div className="text-muted-foreground">↓</div>
                <div>
                  <span className="text-muted-foreground">Matching jobs:</span>{' '}
                  <span className={`font-medium ${jobsResolutionInfo?.matching_jobs_count > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {jobsResolutionInfo?.matching_jobs_count ?? 0}
                  </span>
                  <span className="text-muted-foreground"> / {jobsResolutionInfo?.total_jobs_fetched ?? '—'} fetched</span>
                </div>
                {jobsResolutionInfo?.matching_job_ids?.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Matching IDs:</span>{' '}
                    <span className="font-medium">{jobsResolutionInfo.matching_job_ids.join(', ')}</span>
                  </div>
                )}
                {jobsResolutionInfo?.reason && (
                  <div className="text-red-600 font-medium pt-1 border-t mt-1">
                    ⚠ {jobsResolutionInfo.reason}
                  </div>
                )}
              </div>
            </div>

            {/* My Tasks Resolution Chain */}
            <div className="rounded-lg bg-muted/40 p-3 space-y-1">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                <CheckSquare className="w-3.5 h-3.5" /> My Tasks Resolution
              </p>
              <div className="text-[11px] font-mono space-y-1 pl-4">
                <div>
                  <span className="text-muted-foreground">Employee ID:</span>{' '}
                  <span className="font-medium">{tasksResolutionInfo?.lookup_keys?.employee_id || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Employee Email:</span>{' '}
                  <span className="font-medium">{tasksResolutionInfo?.lookup_keys?.employee_email || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Role (normalized):</span>{' '}
                  <span className="font-medium">{tasksResolutionInfo?.lookup_keys?.role || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Department:</span>{' '}
                  <span className="font-medium">{tasksResolutionInfo?.lookup_keys?.department || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Assigned Truck:</span>{' '}
                  <span className="font-medium">{tasksResolutionInfo?.lookup_keys?.truck || '—'}</span>
                </div>
                <div className="text-muted-foreground">↓</div>
                <div>
                  <span className="text-muted-foreground">Query:</span>{' '}
                  <span className="font-medium block mt-0.5">{tasksResolutionInfo?.query_executed || '—'}</span>
                </div>
                <div className="text-muted-foreground">↓</div>
                <div>
                  <span className="text-muted-foreground">Tasks fetched:</span>{' '}
                  <span className="font-medium">{tasksResolutionInfo?.total_tasks_fetched ?? '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Tasks after filter:</span>{' '}
                  <span className={`font-medium ${tasksResolutionInfo?.total_tasks_after_filter > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {tasksResolutionInfo?.total_tasks_after_filter ?? 0}
                  </span>
                </div>
                {tasksResolutionInfo?.total_tasks_after_filter > 0 && (
                  <div className="pt-1 border-t mt-1 space-y-0.5">
                    <span className="text-muted-foreground">Inclusion reasons:</span>
                    {Object.entries(tasksResolutionInfo.inclusion_reasons).map(([taskId, reason]) => (
                      <div key={taskId} className="pl-2">
                        <span className="text-muted-foreground">{taskId}:</span>{' '}
                        <span className="font-medium text-green-700">{reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Lookup Keys Summary */}
            <div className="rounded-lg bg-muted/40 p-3 space-y-1">
              <p className="text-xs font-semibold text-foreground">All Lookup Keys In Use</p>
              <div className="text-[11px] font-mono space-y-0.5">
                <div><span className="text-muted-foreground">Truck →</span> assigned_truck (value: "{truckResolutionInfo?.lookup_value || ''}")</div>
                <div><span className="text-muted-foreground">Equipment Package →</span> TruckProfile.assigned_equipment_package_id (value: "{equipmentPackageResolutionInfo?.raw_assigned_equipment_package_id || ''}")</div>
                <div><span className="text-muted-foreground">Jobs →</span> technician_email, technician_emails[] (value: "{jobsResolutionInfo?.lookup_keys?.employee_email || ''}")</div>
                <div><span className="text-muted-foreground">Equipment →</span> assigned_employee_email, assigned_employee, assigned_truck</div>
                <div><span className="text-muted-foreground">Tasks →</span> assigned_to_email, assigned_to (name/ID), related_employee, related_truck, role-broadcast (no assignee), dept-broadcast (no assignee+no role)</div>
                <div><span className="text-muted-foreground">Notifications →</span> recipient_email, recipient_role, recipient_department</div>
                <div><span className="text-muted-foreground">WH-105 →</span> technician_email + date</div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div>
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide pb-1 border-b mb-2">Quick Actions</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_LINKS.map(link => (
                <Link key={link.to} to={link.to}>
                  <Button variant="outline" size="sm" className="h-7 text-xs">
                    <link.icon className="w-3.5 h-3.5 mr-1" /> {link.label}
                  </Button>
                </Link>
              ))}
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onRefresh}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh All Data
              </Button>
              <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={onEndImpersonation}>
                <LogOut className="w-3.5 h-3.5 mr-1" /> Return To My Account
              </Button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}