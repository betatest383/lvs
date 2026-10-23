import { useEffect, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Truck, Package, AlertTriangle, History, Shield, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const AUTHORIZED_ROLES = ['admin', 'owner'];

export default function EmployeeAssignmentsTab({ employee, authUser }) {
  const [trucks, setTrucks] = useState([]);
  const [packages, setPackages] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  // Form state
  const [selectedTruckId, setSelectedTruckId] = useState('');
  const [managerOverride, setManagerOverride] = useState(false);
  const [truckReason, setTruckReason] = useState('');
  const [showUnassignDialog, setShowUnassignDialog] = useState(false);
  const [unassignReason, setUnassignReason] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [forcePackageReassign, setForcePackageReassign] = useState(false);

  const canEdit = authUser && AUTHORIZED_ROLES.includes(authUser.role);

  const loadAll = useCallback(async () => {
    const [truckList, pkgList, empList, assignList] = await Promise.all([
      base44.entities.TruckProfile.list('-created_date', 200).catch(() => []),
      base44.entities.EquipmentPackage.filter({ is_active: true }, '-created_date', 200).catch(() => []),
      base44.entities.EmployeeRegistry.list('-created_date', 200).catch(() => []),
      base44.entities.VehicleAssignment.filter({ assigned_to_email: employee.email }, '-created_date', 50).catch(() => []),
    ]);
    setTrucks(truckList || []);
    setPackages(pkgList || []);
    setAllEmployees(empList || []);
    setAssignments(assignList || []);
  }, [employee.email]);

  useEffect(() => {
    loadAll().finally(() => setLoading(false));
  }, [loadAll]);

  // Resolve current truck
  const resolvedTruck = trucks.find(t =>
    t.truck_number === employee.assigned_truck || t.truck_id === employee.assigned_truck
  ) || null;

  // Resolve current equipment package
  const resolvedPackage = packages.find(p =>
    p.package_id === employee.assigned_equipment_package || p.id === employee.assigned_equipment_package
  ) || null;

  // Find trucks already assigned to other employees
  const trucksAssignedToOthers = new Set(
    allEmployees
      .filter(e => e.id !== employee.id && e.employment_status === 'Active' && e.assigned_truck)
      .map(e => e.assigned_truck)
  );

  // Find packages already assigned to other employees
  const packagesAssignedToOthers = new Set(
    allEmployees
      .filter(e => e.id !== employee.id && e.employment_status === 'Active' && e.assigned_equipment_package)
      .map(e => e.assigned_equipment_package)
  );

  const selectedTruck = trucks.find(t => t.id === selectedTruckId);
  const truckConflict = selectedTruck && trucksAssignedToOthers.has(selectedTruck.truck_number);
  const isDuplicateTruck = resolvedTruck && selectedTruck && resolvedTruck.id === selectedTruck.id;
  const isChangeTruck = resolvedTruck && selectedTruck && resolvedTruck.id !== selectedTruck.id;
  const selectedPackage = packages.find(p => p.id === selectedPackageId);
  const packageConflict = selectedPackage && packagesAssignedToOthers.has(selectedPackage.package_id);

  const handleTruckAssign = async () => {
    if (!selectedTruck) return;

    // Prevent duplicate assignment — same truck already assigned to this employee
    if (isDuplicateTruck) {
      toast.info('This employee is already assigned to this truck.');
      return;
    }

    if (truckConflict && !managerOverride) {
      toast.error(`Truck ${selectedTruck.truck_number} is already assigned to another active employee.`);
      return;
    }
    setSaving('truck');
    try {
      const now = new Date().toISOString();
      const empName = `${employee.first_name} ${employee.last_name}`;
      const adminName = authUser?.full_name || authUser?.email || 'System';
      const reason = truckReason.trim() || (isChangeTruck ? 'Truck change' : 'Initial assignment');

      // 1. If changing trucks: unassign previous truck and close its active assignment records
      if (isChangeTruck && resolvedTruck) {
        await base44.entities.TruckProfile.update(resolvedTruck.id, {
          assigned_lead_technician: '',
          current_assignment_status: 'Available',
          current_driver: '',
        });

        const oldActiveAssignments = assignments.filter(a =>
          a.truck_number === resolvedTruck.truck_number && a.status === 'Active'
        );
        for (const a of oldActiveAssignments) {
          await base44.entities.VehicleAssignment.update(a.id, {
            status: 'Returned',
            actual_return_datetime: now,
            return_received_by: adminName,
            return_condition: `Truck changed to ${selectedTruck.truck_number}. Reason: ${reason}`,
          });
        }

        // Audit: previous truck unassigned
        await base44.functions.invoke('manageNotification', {
          action: 'create',
          notificationData: {
            title: 'Truck Changed — Previous Truck Released',
            message: `${empName} released from Truck ${resolvedTruck.truck_number}. Reason: ${reason}`,
            notification_type: 'Operational',
            priority: 'Medium',
            source_module: 'Employee Detail',
            source_record_id: employee.id,
            related_truck: resolvedTruck.truck_number,
            related_employee: employee.employee_id,
            delivery_methods: ['In-App'],
            notes: `Truck change: ${resolvedTruck.truck_number} → ${selectedTruck.truck_number}. Reason: ${reason}. By: ${adminName}`,
          },
        });
      }

      // 2. Update new TruckProfile
      await base44.entities.TruckProfile.update(selectedTruck.id, {
        assigned_lead_technician: empName,
        current_assignment_status: 'Assigned',
        current_driver: empName,
      });

      // 3. Update EmployeeRegistry (single assigned_truck value)
      await base44.entities.EmployeeRegistry.update(employee.id, {
        assigned_truck: selectedTruck.truck_number,
      });

      // 4. Create VehicleAssignment history record (Active)
      await base44.entities.VehicleAssignment.create({
        assignment_id: `VA-${Date.now().toString().slice(-8)}`,
        truck_id: selectedTruck.truck_id,
        truck_number: selectedTruck.truck_number,
        vehicle_name: selectedTruck.vehicle_name || '',
        assigned_to: empName,
        assigned_to_email: employee.email,
        role: employee.primary_role || '',
        assignment_type: 'Permanent',
        start_datetime: now,
        status: 'Active',
        checkout_by: adminName,
        checkout_condition: `${isChangeTruck ? 'Truck change' : 'Assigned'} via Employee Detail. Reason: ${reason}`,
      });

      // 5. Audit: new truck assigned
      await base44.functions.invoke('manageNotification', {
        action: 'create',
        notificationData: {
          title: isChangeTruck ? 'Truck Changed' : 'Truck Assigned',
          message: `${empName} assigned to Truck ${selectedTruck.truck_number} by ${adminName}. Reason: ${reason}`,
          notification_type: 'Operational',
          priority: 'Medium',
          source_module: 'Employee Detail',
          source_record_id: employee.id,
          recipient_email: employee.email,
          recipient_name: empName,
          recipient_role: employee.primary_role || '',
          related_truck: selectedTruck.truck_number,
          related_employee: employee.employee_id,
          delivery_methods: ['In-App'],
          notes: `Truck ${selectedTruck.truck_number} ${isChangeTruck ? 'changed to' : 'assigned'} via Employee Detail by ${adminName}. Reason: ${reason}. Manager override: ${managerOverride}`,
        },
      });

      toast.success(isChangeTruck
        ? `Truck changed from ${resolvedTruck.truck_number} to ${selectedTruck.truck_number}`
        : `Truck ${selectedTruck.truck_number} assigned to ${empName}`
      );
      setSelectedTruckId('');
      setManagerOverride(false);
      setTruckReason('');
      await loadAll();
    } catch (err) {
      toast.error(err.message || 'Failed to assign truck');
    } finally {
      setSaving(null);
    }
  };

  const handleTruckUnassign = async () => {
    if (!resolvedTruck) return;
    setSaving('truck');
    try {
      const now = new Date().toISOString();
      const empName = `${employee.first_name} ${employee.last_name}`;
      const adminName = authUser?.full_name || authUser?.email || 'System';
      const reason = unassignReason.trim() || 'Unassigned via Employee Detail';

      // 1. Clear TruckProfile.assigned_lead_technician and driver
      await base44.entities.TruckProfile.update(resolvedTruck.id, {
        assigned_lead_technician: '',
        current_assignment_status: 'Available',
        current_driver: '',
      });

      // 2. Clear EmployeeRegistry.assigned_truck
      await base44.entities.EmployeeRegistry.update(employee.id, {
        assigned_truck: '',
      });

      // 3. Close all active VehicleAssignment records with end date + reason
      const activeAssignments = assignments.filter(a =>
        a.truck_number === resolvedTruck.truck_number && a.status === 'Active'
      );
      for (const a of activeAssignments) {
        await base44.entities.VehicleAssignment.update(a.id, {
          status: 'Returned',
          actual_return_datetime: now,
          return_received_by: adminName,
          return_condition: `Unassigned. Reason: ${reason}`,
        });
      }

      // 4. Audit log
      await base44.functions.invoke('manageNotification', {
        action: 'create',
        notificationData: {
          title: 'Truck Unassigned',
          message: `${empName} unassigned from Truck ${resolvedTruck.truck_number} by ${adminName}. Reason: ${reason}`,
          notification_type: 'Operational',
          priority: 'Medium',
          source_module: 'Employee Detail',
          source_record_id: employee.id,
          related_truck: resolvedTruck.truck_number,
          related_employee: employee.employee_id,
          delivery_methods: ['In-App'],
          notes: `Truck ${resolvedTruck.truck_number} unassigned. Reason: ${reason}. By: ${adminName}`,
        },
      });

      toast.success(`Truck ${resolvedTruck.truck_number} unassigned`);
      setShowUnassignDialog(false);
      setUnassignReason('');
      await loadAll();
    } catch (err) {
      toast.error(err.message || 'Failed to unassign truck');
    } finally {
      setSaving(null);
    }
  };

  const handlePackageAssign = async () => {
    if (!selectedPackage) return;
    if (packageConflict && !forcePackageReassign) {
      toast.error(`Package "${selectedPackage.package_name}" is already assigned to another active employee.`);
      return;
    }
    setSaving('package');
    try {
      const now = new Date().toISOString();
      const empName = `${employee.first_name} ${employee.last_name}`;

      // If reassigning from another employee, clear their assignment
      if (packageConflict && forcePackageReassign) {
        const otherEmps = allEmployees.filter(e =>
          e.id !== employee.id &&
          e.assigned_equipment_package === selectedPackage.package_id
        );
        for (const oe of otherEmps) {
          await base44.entities.EmployeeRegistry.update(oe.id, {
            assigned_equipment_package: '',
          });
        }
      }

      await base44.entities.EmployeeRegistry.update(employee.id, {
        assigned_equipment_package: selectedPackage.package_id,
      });

      await base44.functions.invoke('manageNotification', {
        action: 'create',
        notificationData: {
          title: 'Equipment Package Assigned',
          message: `Package "${selectedPackage.package_name}" assigned to ${empName} by ${authUser?.full_name || 'admin'}.`,
          notification_type: 'Operational',
          priority: 'Medium',
          source_module: 'Employee Detail',
          source_record_id: employee.id,
          recipient_email: employee.email,
          recipient_name: empName,
          related_equipment: selectedPackage.package_id,
          related_employee: employee.employee_id,
          delivery_methods: ['In-App'],
          notes: `Package "${selectedPackage.package_name}" assigned. Force reassign: ${forcePackageReassign}`,
        },
      });

      toast.success(`Package "${selectedPackage.package_name}" assigned to ${empName}`);
      setSelectedPackageId('');
      setForcePackageReassign(false);
      await loadAll();
    } catch (err) {
      toast.error(err.message || 'Failed to assign package');
    } finally {
      setSaving(null);
    }
  };

  const handlePackageUnassign = async () => {
    if (!resolvedPackage) return;
    setSaving('package');
    try {
      const now = new Date().toISOString();
      const empName = `${employee.first_name} ${employee.last_name}`;

      await base44.entities.EmployeeRegistry.update(employee.id, {
        assigned_equipment_package: '',
      });

      await base44.functions.invoke('manageNotification', {
        action: 'create',
        notificationData: {
          title: 'Equipment Package Unassigned',
          message: `Package "${resolvedPackage.package_name}" removed from ${empName} by ${authUser?.full_name || 'admin'}.`,
          notification_type: 'Operational',
          priority: 'Medium',
          source_module: 'Employee Detail',
          source_record_id: employee.id,
          related_equipment: resolvedPackage.package_id,
          related_employee: employee.employee_id,
          delivery_methods: ['In-App'],
        },
      });

      toast.success(`Package "${resolvedPackage.package_name}" unassigned`);
      await loadAll();
    } catch (err) {
      toast.error(err.message || 'Failed to unassign package');
    } finally {
      setSaving(null);
    }
  };

  const availableTrucks = trucks.filter(t =>
    t.status === 'Active' || t.status === 'Shared Pool'
  );

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Truck Assignment Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Truck className="w-4 h-4" /> Truck Assignment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {resolvedTruck ? (
            <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{resolvedTruck.truck_number} — {resolvedTruck.vehicle_name || resolvedTruck.vehicle_type}</span>
                <Badge variant={resolvedTruck.status === 'Active' ? 'default' : 'secondary'}>{resolvedTruck.status}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <p>Assignment Status: <span className="text-foreground font-medium">{resolvedTruck.current_assignment_status || '—'}</span></p>
                <p>Vehicle Type: <span className="text-foreground">{resolvedTruck.vehicle_type || '—'}</span></p>
                <p>Make/Model: <span className="text-foreground">{resolvedTruck.make || '—'} {resolvedTruck.model || ''}</span></p>
                <p>Plate: <span className="text-foreground">{resolvedTruck.license_plate || '—'}</span></p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No truck currently assigned.</p>
          )}

          {canEdit && (
            <div className="space-y-3 pt-2 border-t">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {resolvedTruck ? 'Change Truck' : 'Assign Truck'}
                </label>
                <Select value={selectedTruckId} onValueChange={setSelectedTruckId}>
                  <SelectTrigger><SelectValue placeholder="Select a truck" /></SelectTrigger>
                  <SelectContent>
                    {availableTrucks.map(t => {
                      const isAssignedElsewhere = trucksAssignedToOthers.has(t.truck_number);
                      const isCurrent = resolvedTruck && t.id === resolvedTruck.id;
                      return (
                        <SelectItem key={t.id} value={t.id} disabled={isAssignedElsewhere && !managerOverride && !isCurrent}>
                          {t.truck_number} — {t.vehicle_name || t.vehicle_type}
                          {isCurrent && ' (current)'}
                          {isAssignedElsewhere && !isCurrent && ' ⚠ Assigned elsewhere'}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {isDuplicateTruck && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  This employee is already assigned to this truck.
                </p>
              )}

              {isChangeTruck && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Reason for change (optional)</Label>
                  <Input
                    value={truckReason}
                    onChange={e => setTruckReason(e.target.value)}
                    placeholder="e.g. Previous truck in maintenance"
                    className="text-sm"
                  />
                </div>
              )}

              {truckConflict && !isDuplicateTruck && (
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={managerOverride} onCheckedChange={setManagerOverride} />
                  <span className="flex items-center gap-1">
                    <Shield className="w-3 h-3 text-amber-500" />
                    Manager override — allow assigning a truck that's assigned elsewhere
                  </span>
                </label>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleTruckAssign}
                  disabled={!selectedTruck || saving === 'truck' || (truckConflict && !managerOverride) || isDuplicateTruck}
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  {saving === 'truck' && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                  {isChangeTruck ? 'Change Truck' : 'Assign Truck'}
                </Button>
                {resolvedTruck && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setUnassignReason(''); setShowUnassignDialog(true); }}
                    disabled={saving === 'truck'}
                  >
                    Unassign Truck
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Equipment Package Assignment Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="w-4 h-4" /> Equipment Package
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {resolvedPackage ? (
            <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{resolvedPackage.package_name}</span>
                <Badge variant="default">{resolvedPackage.role_type}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{resolvedPackage.description || 'No description'}</p>
              {resolvedPackage.total_package_value != null && (
                <p className="text-xs text-muted-foreground">Package Value: <span className="text-foreground font-medium">${resolvedPackage.total_package_value.toLocaleString()}</span></p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No equipment package assigned.</p>
          )}

          {canEdit && (
            <div className="space-y-3 pt-2 border-t">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {resolvedPackage ? 'Reassign Package' : 'Assign Package'}
                </label>
                <Select value={selectedPackageId} onValueChange={setSelectedPackageId}>
                  <SelectTrigger><SelectValue placeholder="Select a package" /></SelectTrigger>
                  <SelectContent>
                    {packages.map(p => {
                      const isAssignedElsewhere = packagesAssignedToOthers.has(p.package_id);
                      const isCurrent = resolvedPackage && p.id === resolvedPackage.id;
                      return (
                        <SelectItem key={p.id} value={p.id}>
                          {p.package_name}
                          {isCurrent && ' (current)'}
                          {isAssignedElsewhere && !isCurrent && ' ⚠ Assigned elsewhere'}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              {packageConflict && (
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={forcePackageReassign} onCheckedChange={setForcePackageReassign} />
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                    Force reassign — remove this package from the other employee
                  </span>
                </label>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handlePackageAssign}
                  disabled={!selectedPackage || saving === 'package' || (packageConflict && !forcePackageReassign)}
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  {saving === 'package' && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                  Assign Package
                </Button>
                {resolvedPackage && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handlePackageUnassign}
                    disabled={saving === 'package'}
                  >
                    Unassign
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assignment History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><History className="w-4 h-4" /> Assignment History</CardTitle>
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assignment history.</p>
          ) : (
            <div className="space-y-2">
              {assignments.slice(0, 10).map(a => (
                <div key={a.id} className="flex items-center justify-between text-xs border-b pb-2 last:border-0">
                  <div className="space-y-0.5">
                    <span className="font-medium">Truck {a.truck_number}</span>
                    {a.vehicle_name && <span className="text-muted-foreground"> — {a.vehicle_name}</span>}
                    <p className="text-muted-foreground">
                      {a.start_datetime ? new Date(a.start_datetime).toLocaleDateString() : '—'}
                      {a.actual_return_datetime && <> → {new Date(a.actual_return_datetime).toLocaleDateString()}</>}
                    </p>
                    {a.return_condition && <p className="text-muted-foreground italic">{a.return_condition}</p>}
                  </div>
                  <Badge variant={a.status === 'Active' ? 'default' : 'secondary'}>
                    {a.status === 'Active' ? 'Current' : 'Inactive'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unassign Truck Confirmation Dialog */}
      <Dialog open={showUnassignDialog} onOpenChange={setShowUnassignDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-4 h-4" /> Unassign Truck
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm">
              Remove <span className="font-medium">{resolvedTruck?.truck_number}</span> from{' '}
              <span className="font-medium">{employee.first_name} {employee.last_name}</span>?
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason (optional)</Label>
              <Textarea
                value={unassignReason}
                onChange={e => setUnassignReason(e.target.value)}
                placeholder="e.g. Truck reassigned to another technician"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUnassignDialog(false)} disabled={saving === 'truck'}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleTruckUnassign}
              disabled={saving === 'truck'}
            >
              {saving === 'truck' && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              Unassign Truck
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Developer Panel */}
      {canEdit && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4" /> Developer Panel — Assignment Debug</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border p-2.5">
                <p className="text-muted-foreground mb-0.5">Assigned Truck (raw)</p>
                <p className="font-mono">{JSON.stringify(employee.assigned_truck) || 'null'}</p>
              </div>
              <div className="rounded-lg border p-2.5">
                <p className="text-muted-foreground mb-0.5">Resolved Truck</p>
                <p className="font-mono">{resolvedTruck ? `${resolvedTruck.truck_number} (${resolvedTruck.truck_id})` : 'null'}</p>
              </div>
              <div className="rounded-lg border p-2.5">
                <p className="text-muted-foreground mb-0.5">Assigned Equipment Package (raw)</p>
                <p className="font-mono">{JSON.stringify(employee.assigned_equipment_package) || 'null'}</p>
              </div>
              <div className="rounded-lg border p-2.5">
                <p className="text-muted-foreground mb-0.5">Resolved Equipment Package</p>
                <p className="font-mono">{resolvedPackage ? `${resolvedPackage.package_name} (${resolvedPackage.package_id})` : 'null'}</p>
              </div>
              <div className="rounded-lg border p-2.5">
                <p className="text-muted-foreground mb-0.5">Last Assignment Date</p>
                <p className="font-mono">{assignments[0]?.start_datetime ? new Date(assignments[0].start_datetime).toISOString() : 'none'}</p>
              </div>
              <div className="rounded-lg border p-2.5">
                <p className="text-muted-foreground mb-0.5">Assignment Source</p>
                <p className="font-mono">EmployeeRegistry.assigned_truck / assigned_equipment_package</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}