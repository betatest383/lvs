import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { normalizeRole, isTruckRequiredForRole, resolveRoleFromRegistry } from '@/lib/roleUtils';
import { useRoleRegistry } from '@/hooks/useRoleRegistry';
import {
  User, Briefcase, Building2, Truck, Package, Calendar,
  Sunrise, Clock, Activity, ChevronRight, ChevronDown,
  Code, RefreshCw, Link2, Phone, ListChecks, Users, Layers,
  AlertTriangle, LayoutDashboard,
} from 'lucide-react';
import moment from 'moment';

const STATUS_STYLES = {
  Active: 'bg-green-100 text-green-700',
  Inactive: 'bg-slate-100 text-slate-600',
  'On Leave': 'bg-amber-100 text-amber-700',
  Terminated: 'bg-red-100 text-red-700',
  Pending: 'bg-blue-100 text-blue-700',
  Disabled: 'bg-red-100 text-red-700',
  Suspended: 'bg-orange-100 text-orange-700',
  Sent: 'bg-blue-100 text-blue-700',
  Accepted: 'bg-green-100 text-green-700',
  Linked: 'bg-green-100 text-green-700',
  Expired: 'bg-slate-100 text-slate-600',
};

/** Default icon set for known role-specific field labels. */
const FIELD_ICONS = {
  'Queue': ListChecks,
  'Dispatch Queue': ListChecks,
  'Extension': Phone,
  'Warehouse Location': Building2,
  'Team Size': Users,
  'Active Crews': Layers,
  'Executive Alerts': AlertTriangle,
  'Company Dashboard': LayoutDashboard,
  "Today's Jobs": Calendar,
  'Morning Readiness': Sunrise,
};

function InfoCell({ icon: Icon, label, value, onClick, linkTo }) {
  const content = (
    <div className={`flex items-center gap-2 ${onClick || linkTo ? 'cursor-pointer hover:bg-muted/60 rounded-lg p-1.5 -m-1.5 transition-colors' : ''}`}>
      <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm font-medium truncate">{value || '—'}</p>
      </div>
      {(onClick || linkTo) && <ChevronRight className="w-3 h-3 text-muted-foreground ml-auto flex-shrink-0" />}
    </div>
  );

  if (linkTo) {
    return <Link to={linkTo}>{content}</Link>;
  }
  if (onClick) {
    return <div onClick={onClick}>{content}</div>;
  }
  return content;
}

/**
 * Shared Employee Identity Header — the single identity header for all LVC OS
 * employee portals. EmployeeRegistry is the source of truth.
 *
 * Standard fields (always visible):
 *   Employee Name, Employee ID, Primary Role, Department, Employment Status,
 *   Last Login, Assigned Truck (or "Not Applicable"), Equipment Package
 *   (or "None Assigned"), Current Date/Time
 *
 * Role-specific fields: pass `roleSpecificFields` — an array of
 *   { label, value, linkTo?, icon? }
 *
 * Display rules:
 *   - Inapplicable fields show "Not Applicable"
 *   - Missing values show "None Assigned"
 *
 * Links:
 *   Employee Name → employeeDetailLink
 *   Truck → truckLink
 *   Equipment Package → equipmentPackageLink
 *
 * Developer Mode (collapsible, shown when showDeveloperMode=true):
 *   Raw Employee ID, Role ID, Canonical Role Key, Registry Record ID,
 *   Last Refresh, Lookup Status
 */
export default function EmployeeIdentityHeader({
  employee,
  user,
  isImpersonating,
  effectiveName,
  effectiveRole,
  effectiveEmployeeId,
  effectiveDepartment,
  effectiveTruck,
  equipmentPackage,
  lastLogin,
  accountStatus,
  resolvedTruck,
  resolvedEquipmentPackage,
  todayJobsCount,
  readinessStatus,
  roleSpecificFields = [],
  truckLink,
  equipmentPackageLink,
  employeeDetailLink,
  jobsLink,
  readinessLink,
  onOpenProfile,
  showDeveloperMode = false,
}) {
  const { registry: roleRegistry } = useRoleRegistry();
  const [liveEmployee, setLiveEmployee] = useState(employee);
  const [lastRefresh, setLastRefresh] = useState(moment().toISOString());
  const [devOpen, setDevOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (employee?.id) {
      base44.entities.EmployeeRegistry.get(employee.id)
        .then(fetched => {
          if (!cancelled && fetched) {
            setLiveEmployee(fetched);
            setLastRefresh(moment().toISOString());
          }
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [employee?.id]);

  const emp = liveEmployee || employee;

  const displayName = emp
    ? `${emp.preferred_name || emp.first_name} ${emp.last_name}`.trim()
    : effectiveName || 'Unknown Employee';
  const employmentStatus = emp?.employment_status || accountStatus || 'Active';
  const statusBadge = emp?.account_status || employmentStatus;

  const assignedTruck = emp?.assigned_truck || effectiveTruck || '';
  const assignedPackage = emp?.assigned_equipment_package || equipmentPackage || '';
  const empLastLogin = emp?.last_login || lastLogin || '';

  const canonicalRole = normalizeRole(
    resolveRoleFromRegistry(effectiveRole || emp?.primary_role, roleRegistry).canonicalRoleKey
  );
  const truckRequired = isTruckRequiredForRole(canonicalRole);

  const truckDisplay = !truckRequired
    ? 'Not Applicable'
    : assignedTruck || 'None Assigned';

  const packageDisplay = resolvedEquipmentPackage?.package_name || resolvedEquipmentPackage?.package_id || assignedPackage || 'None Assigned';

  // Merge standard + role-specific into a single grid
  const allFields = useMemo(() => {
    const fields = [
      { icon: User, label: 'Employee ID', value: effectiveEmployeeId || emp?.employee_id },
      { icon: Briefcase, label: 'Primary Role', value: effectiveRole },
      { icon: Building2, label: 'Department', value: effectiveDepartment || emp?.department },
      { icon: Activity, label: 'Status', value: statusBadge },
      { icon: Clock, label: 'Last Login', value: empLastLogin ? moment(empLastLogin).format('MMM D, h:mm A') : 'Never Logged In' },
      { icon: Truck, label: 'Assigned Truck', value: truckDisplay, linkTo: truckRequired ? truckLink : undefined },
      { icon: Package, label: 'Equipment Package', value: packageDisplay, linkTo: equipmentPackageLink },
    ];

    // Optional resolved values (tech)
    if (resolvedTruck && truckRequired) {
      fields.push({
        icon: Truck,
        label: 'Resolved Truck',
        value: `${resolvedTruck.truck_number || resolvedTruck.truck_id || '—'}`,
        linkTo: truckLink,
      });
    }
    if (resolvedEquipmentPackage) {
      fields.push({
        icon: Package,
        label: 'Resolved Package',
        value: resolvedEquipmentPackage.package_name || resolvedEquipmentPackage.package_id || '—',
        linkTo: equipmentPackageLink,
      });
    }
    if (todayJobsCount !== undefined && todayJobsCount !== null) {
      fields.push({ icon: Calendar, label: "Today's Jobs", value: todayJobsCount, linkTo: jobsLink });
    }
    if (readinessStatus) {
      fields.push({
        icon: Sunrise,
        label: 'Morning Readiness',
        value: readinessStatus.charAt(0).toUpperCase() + readinessStatus.slice(1),
        linkTo: readinessLink,
      });
    }

    // Role-specific fields from caller
    roleSpecificFields.forEach(rf => {
      if (!rf) return;
      fields.push({
        icon: rf.icon || FIELD_ICONS[rf.label] || Briefcase,
        label: rf.label,
        value: rf.value ?? 'None Assigned',
        linkTo: rf.linkTo,
      });
    });

    return fields;
  }, [
    effectiveEmployeeId, emp, effectiveRole, effectiveDepartment,
    statusBadge, empLastLogin, truckDisplay, packageDisplay, truckRequired,
    resolvedTruck, resolvedEquipmentPackage, todayJobsCount, readinessStatus,
    roleSpecificFields, truckLink, equipmentPackageLink, jobsLink, readinessLink,
  ]);

  return (
    <Card className={`border-0 shadow-sm ${isImpersonating ? 'ring-2 ring-amber-400' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* Employee photo / avatar */}
            {emp?.photo_url ? (
              <img
                src={emp.photo_url}
                alt={displayName}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-800 to-slate-600 flex items-center justify-center text-white font-bold text-lg">
                {displayName?.charAt(0) || 'U'}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Employee Name → Employee Detail */}
                {employeeDetailLink ? (
                  <Link to={employeeDetailLink}>
                    <h2 className="text-lg font-bold hover:text-accent transition-colors">
                      {displayName}
                    </h2>
                  </Link>
                ) : (
                  <h2
                    className="text-lg font-bold cursor-pointer hover:text-accent transition-colors"
                    onClick={onOpenProfile}
                  >
                    {displayName}
                  </h2>
                )}
                <Badge className={STATUS_STYLES[statusBadge] || STATUS_STYLES.Active}>
                  {statusBadge}
                </Badge>
                {isImpersonating && (
                  <Badge className="bg-amber-500 text-white">
                    <User className="w-3 h-3 mr-1" /> Acting As
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{effectiveRole || '—'}</p>
            </div>
          </div>
          {/* Current Date / Time */}
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{moment().format('dddd')}</p>
            <p className="text-sm font-semibold">{moment().format('MMM D, YYYY')}</p>
            <p className="text-xs text-muted-foreground font-mono">{moment().format('h:mm A')}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 pt-2 border-t">
          {allFields.map((f, i) => (
            <InfoCell
              key={i}
              icon={f.icon}
              label={f.label}
              value={f.value}
              linkTo={f.linkTo}
            />
          ))}
        </div>

        {/* Developer Mode */}
        {showDeveloperMode && (
          <div className="mt-3 pt-3 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDevOpen(!devOpen)}
              className="w-full justify-between text-xs text-muted-foreground hover:text-foreground"
            >
              <span className="flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5" /> Developer Mode
              </span>
              {devOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </Button>
            {devOpen && (
              <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs bg-muted/40 rounded-lg p-3">
                <DevRow label="Raw Employee ID" value={emp?.employee_id || effectiveEmployeeId} mono />
                <DevRow label="Role ID" value={resolveRoleFromRegistry(effectiveRole || emp?.primary_role, roleRegistry).roleId || '—'} mono />
                <DevRow label="Canonical Role Key" value={canonicalRole || '—'} mono />
                <DevRow label="Registry Record ID" value={emp?.id || '—'} mono />
                <DevRow label="Last Refresh" value={moment(lastRefresh).format('MMM D, h:mm:ss A')} mono />
                <DevRow label="Lookup Status" value={emp?.id ? 'Resolved' : 'No employee record'} />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DevRow({ label, value, mono }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-xs font-medium truncate ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
    </div>
  );
}