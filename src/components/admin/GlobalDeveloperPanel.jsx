import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useImpersonation } from '@/lib/ImpersonationContext';
import { useIdentityResolver } from '@/hooks/useIdentityResolver';
import {
  normalizeRole, isTechRole,
  getSidebarConfigLabel, getDashboardConfigLabel, getPermissionProfileLabel,
  resolveRoleFromRegistry, isTruckRequiredForRole,
} from '@/lib/roleUtils';
import { getRoleConfig } from '@/components/dashboard/roleConfig';
import { useRoleRegistry } from '@/hooks/useRoleRegistry';
import { useMyTasks } from '@/hooks/useMyTasks';
import { useMyNotifications } from '@/hooks/useMyNotifications';
import {
  Bug, X, ChevronDown, ChevronUp, RefreshCw, LogOut, Truck,
  CheckSquare, Bell, Calendar, ShieldCheck, AlertTriangle, CheckCircle2,
  Link2, UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useDeveloperMode } from '@/hooks/useDeveloperMode';
import { useDeveloperPanelCollision } from '@/hooks/useDeveloperPanelCollision';
import { Switch } from '@/components/ui/switch';

// Routes where the developer panel auto-collapses to a small tab
// to avoid interfering with technician workflows and form action buttons
const WORKFLOW_ROUTES = [
  '/tech/inspection',
  '/tech/exterior-inspection',
  '/tech/inspection-setup',
  '/tech/job-hub',
  '/tech/weekly-inspection',
  '/tech/readiness',
  '/tech/truck',
  '/forms',
];

function DevRow({ label, value, mono }) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs py-0.5">
      <span className="text-slate-400 flex-shrink-0">{label}</span>
      <span className={`text-right ${mono ? 'font-mono text-[11px] text-slate-300' : 'font-medium text-slate-100'}`}>
        {value === undefined || value === null || value === '' ? '—' : String(value)}
      </span>
    </div>
  );
}

function DebugSection({ title, icon: Icon, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg bg-slate-800/60 p-3 space-y-1">
      <button
        className="text-xs font-semibold text-slate-200 flex items-center gap-1.5 w-full"
        onClick={() => setOpen(!open)}
      >
        <Icon className="w-3.5 h-3.5 text-amber-400" /> {title}
        {open ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
      </button>
      {open && <div className="space-y-1 mt-1">{children}</div>}
    </div>
  );
}

function SourceStatus({ label, ok }) {
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className="text-slate-400">{label}</span>
      {ok ? (
        <Badge className="bg-green-900/60 text-green-300 gap-1 text-[10px]">
          <CheckCircle2 className="w-2.5 h-2.5" /> OK
        </Badge>
      ) : (
        <Badge className="bg-amber-900/60 text-amber-300 gap-1 text-[10px]">
          <AlertTriangle className="w-2.5 h-2.5" /> Missing
        </Badge>
      )}
    </div>
  );
}

export default function GlobalDeveloperPanel() {
  const { user: authUser, employee: linkedEmployee } = useAuth();
  const { isImpersonating, impersonatedEmployee, endImpersonation } = useImpersonation();
  const { resolutionChain } = useIdentityResolver();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [data, setData] = useState({
    truckProfile: null,
    equipmentPackage: null,
    tasks: [],
    notifications: [],
    todayJobs: [],
    truckResolution: null,
    tasksResolution: null,
    jobsResolution: null,
    notificationsResolution: null,
  });

  const emp = isImpersonating ? impersonatedEmployee : linkedEmployee;
  const { registry: roleRegistry } = useRoleRegistry();
  const rawRole = emp ? (emp.primary_role || authUser?.role || 'customer') : (authUser?.role || 'customer');
  const roleResolution = resolveRoleFromRegistry(rawRole, roleRegistry);
  const resolvedRole = roleResolution.canonicalRoleKey;
  const isTech = isTechRole(resolvedRole);
  const truckRequired = isTruckRequiredForRole(resolvedRole);
  const roleConfig = getRoleConfig(resolvedRole);

  // Developer Mode: environment-aware, admin-only
  // - Dev/preview: dev mode defaults ON → admins see the panel
  // - Production: dev mode defaults OFF → admin enables via ?dev_mode=true or toggle
  const { devModeEnabled, toggleDevMode, canAccessDevTools, isDevToolsVisible, isProduction } = useDeveloperMode();
  const bottomOffset = useDeveloperPanelCollision(open);

  // Auto-hide on technician workflow routes — show small tab instead of full button
  const isWorkflowRoute = WORKFLOW_ROUTES.some(route => location.pathname.startsWith(route));
  const showSmallTab = isWorkflowRoute && !open;

  // Repair: link auth user to EmployeeRegistry by email match
  const handleLinkAuthUser = async () => {
    if (!authUser || !emp) return;
    setLinking(true);
    try {
      const res = await base44.functions.invoke('linkUserToEmployee', {
        action: 'link',
        employee_id: emp.employee_id,
        user_id: authUser.id,
        user_email: authUser.email,
      });
      if (res.data?.success) {
        toast.success(`Linked ${authUser.email} to ${emp.employee_id}`);
        setTimeout(() => window.location.reload(), 800);
      } else {
        toast.error('Failed to link auth user');
      }
    } catch (err) {
      toast.error(`Link failed: ${err.message || 'Unknown error'}`);
    } finally {
      setLinking(false);
    }
  };

  const { filteredTasks: hookTasks, taskCount: hookTaskCount, inclusionReasons: hookInclusionReasons, totalFetched: hookTotalFetched, refetch: refetchTasks } = useMyTasks(emp);
  const { filteredNotifications: hookNotifications = [], notificationCount: hookNotifCount = 0, inclusionMap: hookNotifInclusionMap = {}, excludedUnexpectedMatches: hookExcludedNotifs = [], totalFetched: hookNotifTotalFetched = 0, refetch: refetchNotifs } = useMyNotifications(emp);

  const notificationsResolution = emp ? {
    lookup_keys: {
      recipient_employee_registry_id: emp.id,
      recipient_email: (emp.email || '').toLowerCase().trim(),
      recipient_role: resolvedRole,
      recipient_department: emp.department,
      recipient_user_id: emp.linked_user_id,
    },
    query_executed: 'Direct assignment (registry_id/email/user_id/name) → Role broadcast (only if no person-specific) → Dept broadcast (only if no person-specific or role) → Company broadcast (all blank)',
    total_fetched: hookNotifTotalFetched,
    matching_count: hookNotifCount,
    excluded_unexpected_count: hookExcludedNotifs.length,
    inclusion_map: hookNotifInclusionMap,
  } : null;

  const tasksResolution = emp ? {
    lookup_keys: {
      employee_id: emp.employee_id,
      employee_email: (emp.email || '').toLowerCase().trim(),
      employee_name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
      role: resolvedRole,
      department: emp.department,
      truck: emp.assigned_truck,
    },
    query_executed: 'assigned_to_email OR assigned_to (name/emp_id) OR related_employee OR role_broadcast OR dept_broadcast',
    total_tasks_fetched: hookTotalFetched,
    total_tasks_after_filter: hookTaskCount,
    inclusion_reasons: hookInclusionReasons,
  } : null;

  const fetchDebugData = useCallback(async () => {
    if (!emp) return;
    setRefreshing(true);
    const empEmail = (emp.email || '').toLowerCase().trim();
    const empName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
    const empId = emp.employee_id;
    const truckRef = emp.assigned_truck;

    const safe = async (fn) => { try { return await fn(); } catch { return null; } };

    // 1. Fetch truck profile by truck_id or truck_number
    let truckProfile = null;
    let truckResolution = {
      lookup_value: truckRef,
      lookup_field: 'assigned_truck',
      matched_by: null,
      matching_record_id: null,
      total_trucks_checked: 0,
      fallback_used: false,
      reason: null,
    };
    if (truckRef) {
      const trucks = await safe(() => base44.entities.TruckProfile.filter({}, '-updated_date', 200));
      truckResolution.total_trucks_checked = trucks?.length || 0;
      if (trucks && trucks.length > 0) {
        const match = trucks.find(t =>
          t.truck_id === truckRef || t.truck_number === truckRef ||
          t.truck_number === String(truckRef).replace(/^TRK-/, '')
        );
        if (match) {
          truckProfile = match;
          truckResolution.matched_by = match.truck_id === truckRef ? 'truck_id' : 'truck_number';
          truckResolution.matching_record_id = match.id;
        } else {
          truckResolution.reason = truckRequired
            ? `No TruckProfile matched "${truckRef}" by truck_id or truck_number`
            : null;
        }
      } else {
        truckResolution.reason = truckRequired ? 'No TruckProfile records found' : null;
      }
    } else if (!truckRequired) {
      truckResolution.reason = null;
      truckResolution.not_applicable = true;
    }

    // 2. Fetch equipment package
    let equipmentPackage = null;
    if (emp.assigned_equipment_package) {
      const pkgRef = emp.assigned_equipment_package;
      const pkgs = await safe(() => base44.entities.EquipmentPackage.filter({}, '-updated_date', 200));
      if (pkgs) {
        equipmentPackage = pkgs.find(p =>
          p.package_id === pkgRef || p.package_name === pkgRef
        ) || null;
      }
    }

    // 3. RoleRegistry is resolved via useRoleRegistry hook (roleResolution)

    refetchTasks();

    refetchNotifs();

    // 6. Fetch today's jobs
    let todayJobs = [];
    let jobsResolution = {
      lookup_keys: {
        employee_id: empId,
        employee_email: empEmail,
        employee_name: empName,
        servicetitan_technician_id: emp.servicetitan_employee_id,
      },
      query_executed: `technician_email="${empEmail}" OR technician_emails contains "${empEmail}"`,
      total_jobs_fetched: 0,
      matching_jobs_count: 0,
      matching_job_ids: [],
    };
    {
      const today = new Date().toISOString().split('T')[0];
      const allJobs = await safe(() => base44.entities.Job.filter({}, '-created_date', 200));
      if (allJobs) {
        jobsResolution.total_jobs_fetched = allJobs.length;
        const matched = allJobs.filter(j => {
          const tEmail = (j.technician_email || '').toLowerCase();
          const tEmails = j.technician_emails;
          const tName = (j.technician_name || '').toLowerCase();
          let match = tEmail === empEmail || tName === empName.toLowerCase();
          if (Array.isArray(tEmails)) {
            match = match || tEmails.some(e => (e || '').toLowerCase() === empEmail);
          }
          // Also check appointment date is today
          if (match && j.appointment_date) {
            const jobDate = String(j.appointment_date).split('T')[0];
            match = jobDate === today;
          }
          return match;
        });
        todayJobs = matched;
        jobsResolution.matching_jobs_count = matched.length;
        jobsResolution.matching_job_ids = matched.slice(0, 10).map(j => j.job_id || j.id);
      }
    }

    setData({
      truckProfile, equipmentPackage,
      todayJobs,
      truckResolution, jobsResolution,
    });
    setRefreshing(false);
  }, [emp, resolvedRole, truckRequired, roleRegistry, refetchTasks, refetchNotifs]);

  useEffect(() => {
    if (open && emp) {
      fetchDebugData();
    }
  }, [open, emp?.id, resolvedRole]);

  if (!canAccessDevTools || !isDevToolsVisible) return null;

  return (
    <>
      {/* Collapsed state: small tab on workflow routes, full button otherwise */}
      {!open && showSmallTab && (
        <button
          data-dev-panel="true"
          onClick={() => setOpen(true)}
          style={{ bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom, 0px))` }}
          className="fixed left-1/2 -translate-x-1/2 z-[9998] flex items-center gap-1 bg-amber-600/90 backdrop-blur-sm text-white text-[10px] font-medium px-3 py-1 rounded-md shadow-lg border border-amber-400/30 hover:bg-amber-600 transition-all"
          title="Developer Tools — expand"
        >
          <Bug className="w-3 h-3" />
          DEV
        </button>
      )}
      {!open && !showSmallTab && (
        <button
          data-dev-panel="true"
          onClick={() => setOpen(true)}
          style={{ bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom, 0px))` }}
          className="fixed left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm px-4 py-2.5 rounded-full shadow-2xl border-2 border-amber-300/50 transition-all hover:scale-105"
        >
          <Bug className="w-4 h-4" />
          Developer Panel
          {isImpersonating ? (
            <Badge className="bg-red-600 text-white text-[10px] ml-1">ACT AS</Badge>
          ) : (
            <Badge className="bg-blue-600 text-white text-[10px] ml-1">DIRECT LOGIN</Badge>
          )}
        </button>
      )}

      {/* Panel Overlay */}
      {open && (
        <div data-dev-panel="true" className="fixed bottom-0 left-1/2 -translate-x-1/2 z-[9999] w-full sm:w-[480px] max-h-[85vh] flex flex-col bg-slate-900 border-t-4 border-t-amber-500 rounded-t-xl shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-850 border-b border-slate-700 rounded-t-xl">
            <div className="flex items-center gap-2">
              <Bug className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-bold text-white">Developer Panel</span>
              {isImpersonating ? (
                <Badge className="bg-red-600 text-white text-[10px]">ACT AS USER</Badge>
              ) : (
                <Badge className="bg-blue-600 text-white text-[10px]">DIRECT LOGIN</Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost" size="sm"
                onClick={fetchDebugData}
                disabled={refreshing}
                className="h-7 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="ghost" size="sm"
                onClick={() => setOpen(false)}
                className="h-7 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost" size="sm"
                onClick={() => setOpen(false)}
                className="h-7 w-7 p-0 text-slate-300 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Identity Resolution Chain */}
            <DebugSection title={`Identity Resolution — ${resolutionChain?.mode || 'unknown'}`} icon={ShieldCheck}>
              <DevRow label="Auth User ID" value={resolutionChain?.auth_user_id} mono />
              <DevRow label="Auth Email" value={resolutionChain?.auth_email} mono />
              <DevRow label="Auth Full Name" value={resolutionChain?.auth_full_name} />
              <DevRow label="Auth Role" value={resolutionChain?.auth_role} />
              <div className="border-t border-slate-700 my-1" />
              <DevRow label="Employee Match Method" value={resolutionChain?.employee_match_method} />
              <DevRow label="Employee Record ID" value={resolutionChain?.employee_record_id} mono />
              <DevRow label="Employee ID" value={resolutionChain?.employee_id} mono />
              <DevRow label="Employee Email" value={resolutionChain?.employee_email} mono />
              <DevRow label="Employee Login Email" value={resolutionChain?.employee_login_email} mono />
              <DevRow label="Linked User ID" value={resolutionChain?.linked_user_id} mono />
              <DevRow label="Account Status" value={resolutionChain?.account_status} />
              <DevRow label="Invitation Status" value={resolutionChain?.invitation_status} />
              <div className="border-t border-slate-700 my-1" />
              <DevRow label="Primary Role (raw)" value={resolutionChain?.primary_role_raw} />
              <DevRow label="RoleRegistry Match" value={resolutionChain?.role_registry_match} />
              <DevRow label="RoleRegistry Matched" value={resolutionChain?.role_registry_matched ? 'Yes' : 'No'} />
              <DevRow label="Canonical Role Key" value={resolutionChain?.canonical_role_key} mono />
              <DevRow label="Department" value={resolutionChain?.department} />
              <DevRow label="Permission Profile" value={resolutionChain?.permission_profile} />
              <DevRow label="Dashboard Route" value={resolutionChain?.dashboard_route} />
              <DevRow label="Sidebar Config" value={resolutionChain?.sidebar_config} />
              <DevRow label="Landing Page" value={resolutionChain?.landing_page} mono />
              <DevRow label="Current Route" value={location.pathname} mono />
              <DevRow label="Fallback Used" value={resolutionChain?.fallback_used || 'None'} />
              <DevRow label="Cached Data Used" value={resolutionChain?.cached_data_used || 'None'} />
              {resolutionChain?.fallback_used === 'auth_user_role' && (
                <div className="mt-2 p-2 rounded bg-red-900/40 border border-red-700 text-red-200 text-[11px]">
                  ⚠ Fallback: EmployeeRegistry.primary_role is empty — using auth user.role. This may cause wrong dashboard/sidebar.
                </div>
              )}
              {emp && !emp.linked_user_id && !isImpersonating && authUser?.role === 'admin' && (
                <div className="mt-2 p-2 rounded bg-amber-900/40 border border-amber-700">
                  <p className="text-amber-200 text-[11px] font-medium mb-1.5">
                    ⚠ linked_user_id is empty — direct login may not resolve correctly.
                  </p>
                  <Button
                    size="sm"
                    onClick={handleLinkAuthUser}
                    disabled={linking}
                    className="h-7 text-[11px] gap-1 bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {linking ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                    Link Auth User to EmployeeRegistry
                  </Button>
                </div>
              )}
            </DebugSection>

            {/* Role & Routing Section */}
            <DebugSection title="Role & Routing Resolution" icon={Bug}>
              <DevRow label="Role ID" value={roleResolution.roleId} mono />
              <DevRow label="Role Name" value={roleResolution.roleName} />
              <DevRow label="Canonical Role Key" value={resolvedRole} mono />
              <DevRow label="Dashboard Selected" value={emp?.default_dashboard || roleConfig.dashboard} />
              <DevRow label="Dashboard Route Matched" value={getDashboardConfigLabel(resolvedRole)} />
              <DevRow label="Sidebar Route Matched" value={getSidebarConfigLabel(resolvedRole)} />
              <DevRow label="Landing Page" value={emp?.default_landing_page || roleConfig.landingPage} mono />
              <DevRow label="Permission Profile" value={getPermissionProfileLabel(resolvedRole)} />
              <DevRow label="Current Route" value={location.pathname} mono />
              <DevRow label="Is Tech Role" value={isTech ? 'Yes' : 'No'} />
              <DevRow label="Truck Required" value={truckRequired ? 'Yes' : 'No'} />
            </DebugSection>

            {/* Assignment Section */}
            <DebugSection title="Assignment & Fleet" icon={Truck}>
              <DevRow label="Assigned Truck (raw)" value={emp?.assigned_truck} mono />
              <DevRow label="Resolved Truck ID" value={data.truckProfile?.truck_id} mono />
              <DevRow label="Resolved Truck Number" value={data.truckProfile?.truck_number} />
              <DevRow label="Resolved Truck Status" value={data.truckProfile?.status} />
              <DevRow label="Equipment Package (raw)" value={emp?.assigned_equipment_package} mono />
              <DevRow label="Resolved Package Name" value={data.equipmentPackage?.package_name} />
              <DevRow label="User Linked" value={emp?.user_linked ? 'Yes' : 'No'} />
              <DevRow label="Linked User ID" value={emp?.linked_user_id} mono />
              <DevRow label="Account Status" value={emp?.account_status} />
              <DevRow label="Invitation Status" value={emp?.invitation_status} />
            </DebugSection>

            {/* Truck Resolution Debug */}
            <DebugSection title="Truck Resolution Debug" icon={Truck}>
              {data.truckResolution && (
                <div className="text-[11px] font-mono space-y-1 pl-2 text-slate-300">
                  <DevRow label="Lookup Value" value={data.truckResolution.lookup_value} mono />
                  <DevRow label="Lookup Field" value={data.truckResolution.lookup_field} mono />
                  <DevRow label="Matched By" value={data.truckResolution.matched_by || 'No Match'} />
                  <DevRow label="Matching Record ID" value={data.truckResolution.matching_record_id} mono />
                  <DevRow label="Trucks Checked" value={data.truckResolution.total_trucks_checked} />
                  <DevRow label="Fallback Used" value={data.truckResolution.fallback_used ? 'Yes' : 'No'} />
                  {data.truckResolution.not_applicable && (
                    <div className="text-blue-400 font-medium pt-1">ℹ Not Applicable — {resolvedRole} does not require a truck assignment</div>
                  )}
                  {data.truckResolution.reason && (
                    <div className="text-red-400 font-medium pt-1">⚠ {data.truckResolution.reason}</div>
                  )}
                </div>
              )}
            </DebugSection>

            {/* Today's Jobs Resolution Debug */}
            <DebugSection title="Today's Jobs Resolution Debug" icon={Calendar}>
              {data.jobsResolution && (
                <div className="text-[11px] font-mono space-y-1 pl-2 text-slate-300">
                  <DevRow label="Employee ID" value={data.jobsResolution.lookup_keys?.employee_id} mono />
                  <DevRow label="Employee Email" value={data.jobsResolution.lookup_keys?.employee_email} mono />
                  <DevRow label="Employee Name" value={data.jobsResolution.lookup_keys?.employee_name} />
                  <DevRow label="ST Tech ID" value={data.jobsResolution.lookup_keys?.servicetitan_technician_id} mono />
                  <DevRow label="Query" value={data.jobsResolution.query_executed} />
                  <DevRow label="Total Jobs Fetched" value={data.jobsResolution.total_jobs_fetched} />
                  <DevRow label="Matching Jobs" value={data.jobsResolution.matching_jobs_count} />
                  {data.jobsResolution.matching_job_ids?.length > 0 && (
                    <DevRow label="Matching IDs" value={data.jobsResolution.matching_job_ids.join(', ')} mono />
                  )}
                </div>
              )}
            </DebugSection>

            {/* Task Filter Debug */}
            <DebugSection title="Task Filter Debug" icon={CheckSquare}>
              {tasksResolution && (
                <div className="text-[11px] font-mono space-y-1 pl-2 text-slate-300">
                  <DevRow label="Employee ID" value={tasksResolution.lookup_keys?.employee_id} mono />
                  <DevRow label="Employee Email" value={tasksResolution.lookup_keys?.employee_email} mono />
                  <DevRow label="Employee Name" value={tasksResolution.lookup_keys?.employee_name} />
                  <DevRow label="Role (normalized)" value={tasksResolution.lookup_keys?.role} />
                  <DevRow label="Department" value={tasksResolution.lookup_keys?.department} />
                  <DevRow label="Assigned Truck" value={tasksResolution.lookup_keys?.truck} />
                  <DevRow label="Query" value={tasksResolution.query_executed} />
                  <DevRow label="Tasks Fetched" value={tasksResolution.total_tasks_fetched} />
                  <DevRow label="Tasks After Filter" value={tasksResolution.total_tasks_after_filter} />
                  {Object.keys(tasksResolution.inclusion_reasons).length > 0 && (
                    <div className="pt-1 border-t border-slate-700">
                      <p className="text-slate-400">Inclusion reasons:</p>
                      {Object.entries(tasksResolution.inclusion_reasons).map(([id, reason]) => (
                        <div key={id}>
                          <span className="text-slate-400">{id}:</span>{' '}
                          <span className="text-green-400">{reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </DebugSection>

            {/* Notification Filter Debug */}
            <DebugSection title="Notification Filter Debug" icon={Bell}>
              {notificationsResolution && (
                <div className="text-[11px] font-mono space-y-1 pl-2 text-slate-300">
                  <DevRow label="Registry ID" value={notificationsResolution.lookup_keys?.recipient_employee_registry_id} mono />
                  <DevRow label="Recipient Email" value={notificationsResolution.lookup_keys?.recipient_email} mono />
                  <DevRow label="Recipient Role" value={notificationsResolution.lookup_keys?.recipient_role} />
                  <DevRow label="Recipient Dept" value={notificationsResolution.lookup_keys?.recipient_department} />
                  <DevRow label="Recipient User ID" value={notificationsResolution.lookup_keys?.recipient_user_id} mono />
                  <DevRow label="Query" value={notificationsResolution.query_executed} />
                  <DevRow label="Total Fetched" value={notificationsResolution.total_fetched} />
                  <DevRow label="Matching Count" value={notificationsResolution.matching_count} />
                  {hookExcludedNotifs.length > 0 && (
                    <div className="pt-1">
                      <span className="text-red-400 font-medium">⚠ {hookExcludedNotifs.length} Excluded Unexpected Match(es)</span>
                    </div>
                  )}
                  {hookNotifications.length > 0 && (
                    <div className="pt-2 border-t border-slate-700 space-y-2">
                      <p className="text-slate-400 font-medium">Included Notifications ({hookNotifications.length}):</p>
                      {hookNotifications.map(n => {
                        const inc = n._inclusion || hookNotifInclusionMap[n.notification_id || n.id];
                        return (
                          <div key={n.id} className="rounded p-1.5 border border-slate-700 bg-slate-900/40">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-amber-300 font-medium">{n.notification_id || n.id}</span>
                              {inc?.badge && <span className="text-[10px] px-1 rounded bg-slate-700 text-slate-200">{inc.badge}</span>}
                            </div>
                            <p className="text-slate-200 truncate">{n.title}</p>
                            <p className="text-green-400">{inc?.reason || '—'}</p>
                            {inc?.detail && <p className="text-slate-400 text-[10px]">{inc.detail}</p>}
                            <div className="mt-1 space-y-0.5 text-[10px] text-slate-500">
                              <div>reg_id: <span className="text-slate-300">{n.recipient_employee_registry_id || '—'}</span></div>
                              <div>email: <span className="text-slate-300">{n.recipient_email || '—'}</span></div>
                              <div>role: <span className="text-slate-300">{n.recipient_role || '—'}</span></div>
                              <div>dept: <span className="text-slate-300">{n.recipient_department || '—'}</span></div>
                              <div>user_id: <span className="text-slate-300">{n.recipient_user_id || '—'}</span></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {hookExcludedNotifs.length > 0 && (
                    <div className="pt-2 border-t border-slate-700 space-y-2">
                      <p className="text-red-400 font-medium">Excluded Unexpected Matches ({hookExcludedNotifs.length}):</p>
                      {hookExcludedNotifs.map(n => {
                        const inc = n._inclusion;
                        return (
                          <div key={n.id} className="rounded p-1.5 border border-red-800 bg-red-950/30">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-red-300 font-medium">{n.notification_id || n.id}</span>
                              <span className="text-[10px] px-1 rounded bg-red-700 text-white">EXCLUDED</span>
                            </div>
                            <p className="text-slate-200 truncate">{n.title}</p>
                            <p className="text-red-400 text-[10px]">{inc?.detail || '—'}</p>
                            <div className="mt-1 space-y-0.5 text-[10px] text-slate-500">
                              <div>reg_id: <span className="text-slate-300">{n.recipient_employee_registry_id || '—'}</span></div>
                              <div>email: <span className="text-slate-300">{n.recipient_email || '—'}</span></div>
                              <div>role: <span className="text-slate-300">{n.recipient_role || '—'}</span></div>
                              <div>dept: <span className="text-slate-300">{n.recipient_department || '—'}</span></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </DebugSection>

            {/* Data Sources */}
            <DebugSection title="Data Source Status" icon={CheckCircle2}>
              <SourceStatus label="EmployeeRegistry" ok={!!emp} />
              <SourceStatus label="TruckProfile resolved" ok={!!data.truckProfile || !truckRequired} />
              <SourceStatus label="EquipmentPackage resolved" ok={!!data.equipmentPackage} />
              <SourceStatus label="RoleRegistry matched" ok={!!roleResolution.record} />
              <SourceStatus label="Tasks matched" ok={hookTasks.length > 0} />
              <SourceStatus label="Notifications matched" ok={hookNotifications.length > 0} />
              <SourceStatus label="Today's jobs matched" ok={data.todayJobs.length > 0} />
            </DebugSection>

            {/* Developer Mode Toggle */}
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700">
              <div className="flex items-center gap-2">
                <Bug className="w-3.5 h-3.5 text-amber-400" />
                <div>
                  <p className="text-xs font-semibold text-slate-200">Developer Mode</p>
                  <p className="text-[10px] text-slate-400">
                    {isProduction ? 'Production environment' : 'Dev / Preview environment'}
                  </p>
                </div>
                <Badge className={devModeEnabled ? 'bg-green-600 text-white text-[10px]' : 'bg-slate-600 text-white text-[10px]'}>
                  {devModeEnabled ? 'ON' : 'OFF'}
                </Badge>
              </div>
              <Switch checked={devModeEnabled} onCheckedChange={toggleDevMode} />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700">
              <Button
                variant="destructive" size="sm"
                onClick={async () => { await endImpersonation(); setOpen(false); }}
                className="h-8 text-xs"
              >
                <LogOut className="w-3.5 h-3.5 mr-1" /> End Act As User
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}