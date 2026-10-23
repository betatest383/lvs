import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, PackageCheck, Loader2, Link2, Unlink, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { syncPackageToTruck, removePackageFromTruck, checkPackageConflict } from "@/lib/equipmentPackageSync";
import PackageAssignmentDeveloperPanel from "@/components/equipment/PackageAssignmentDeveloperPanel";

export function TruckOverviewTab({ truck, onReload }) {
  const [packages, setPackages] = useState([]);
  const [assignedPackage, setAssignedPackage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const pkgs = await base44.entities.EquipmentPackage.filter({ is_active: true }, 'package_name');
      setPackages(pkgs || []);

      if (truck.assigned_equipment_package_id) {
        try {
          const pkg = await base44.entities.EquipmentPackage.get(truck.assigned_equipment_package_id);
          setAssignedPackage(pkg);
        } catch {
          setAssignedPackage(null);
        }
      } else {
        setAssignedPackage(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [truck]);

  const handleSelectPackage = async (pkgId) => {
    setSelectedPackageId(pkgId);
    setConflict(null);
    if (pkgId && pkgId !== truck.assigned_equipment_package_id) {
      const c = await checkPackageConflict(pkgId, truck.id);
      setConflict(c);
    }
  };

  const handleAssign = async () => {
    if (!selectedPackageId) { toast.error("Select a package"); return; }
    setSaving(true);
    try {
      const me = await base44.auth.me();
      const pkg = packages.find(p => p.id === selectedPackageId);
      if (!pkg) { toast.error("Package not found"); return; }

      await syncPackageToTruck({
        equipmentPackage: pkg,
        truck: { id: truck.id, truck_number: truck.truck_number, vehicle_name: truck.vehicle_name || '' },
        assignedBy: me.full_name,
        isSharedPackage: truck.vehicle_type === 'Shared Vehicle',
      });

      toast.success(conflict ? "Package moved to this truck" : "Package assigned to truck");
      setSelectedPackageId("");
      setConflict(null);
      await load();
      onReload?.();
    } catch {
      toast.error("Failed to assign package");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!assignedPackage) return;
    setSaving(true);
    try {
      const me = await base44.auth.me();
      await removePackageFromTruck(assignedPackage, truck.id, me.full_name);
      toast.success("Package removed from truck");
      await load();
      onReload?.();
    } catch {
      toast.error("Failed to remove package");
    } finally {
      setSaving(false);
    }
  };

  const rows = [
    ["Truck ID", truck.truck_id],
    ["Vehicle Name", truck.vehicle_name],
    ["Vehicle Type", truck.vehicle_type],
    ["Status", truck.status],
    ["Assignment Status", truck.current_assignment_status],
    ["Assigned Lead Technician", truck.assigned_lead_technician],
    ["Assigned Apprentice", truck.assigned_apprentice],
    ["Default Crew", truck.default_crew],
    ["Current Driver", truck.current_driver],
    ["Current Job", truck.current_job],
    ["License Plate", truck.license_plate],
    ["VIN", truck.vin],
    ["Year", truck.year],
    ["Make", truck.make],
    ["Model", truck.model],
    ["Mileage", truck.mileage ? `${truck.mileage.toLocaleString()} mi` : null],
    ["ServiceTitan Truck ID", truck.servicetitan_truck_id],
    ["Last Inspection", truck.last_inspection_date],
    ["Next Inspection", truck.next_inspection_date],
    ["Last Maintenance", truck.last_maintenance_date],
    ["Next Maintenance", truck.next_maintenance_date],
    ["Related SOP", truck.related_sop_id],
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Vehicle Overview</CardTitle></CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {rows.filter(([, v]) => v !== null && v !== undefined && v !== "").map(([label, value]) => (
              <div key={label} className="flex justify-between border-b border-border/50 pb-1">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium text-right">{String(value)}</span>
              </div>
            ))}
          </div>
          {truck.notes && (
            <div className="mt-4 pt-3 border-t">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm">{truck.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" /> Equipment Package Assignment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : assignedPackage ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 border border-blue-200">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">{assignedPackage.package_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {assignedPackage.package_id || assignedPackage.id}
                      {assignedPackage.assignment_timestamp
                        ? ` · Assigned ${new Date(assignedPackage.assignment_timestamp).toLocaleDateString()}`
                        : ''}
                      {assignedPackage.assigned_by ? ` by ${assignedPackage.assigned_by}` : ''}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={handleRemove} disabled={saving} className="text-red-600 hover:text-red-700">
                  {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Unlink className="w-3.5 h-3.5 mr-1" />}
                  Remove
                </Button>
              </div>
              <PackageAssignmentDeveloperPanel pkg={assignedPackage} trucks={[truck]} />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Select value={selectedPackageId} onValueChange={handleSelectPackage}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Select equipment package" /></SelectTrigger>
                  <SelectContent>
                    {packages.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.package_name} ({p.package_id || p.id})
                        {p.assigned_truck_id ? ` · On Truck ${p.assigned_truck_number}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAssign} disabled={saving || !selectedPackageId}>
                  {saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                  Assign
                </Button>
              </div>
              {conflict && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    This package is already assigned to Truck {conflict.truck_number}. Assigning here will move the assignment.
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center py-2 flex items-center justify-center gap-1">
                <PackageCheck className="w-4 h-4" />
                No package assigned — TruckProfile is the single source of truth for equipment resolution.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}