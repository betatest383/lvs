import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useDirtyCloseGuard } from "@/components/ui/useDirtyCloseGuard";
import DirtyCloseWarning from "@/components/ui/DirtyCloseWarning";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import EmployeePicker from "@/components/shared/EmployeePicker";

const VEHICLE_TYPES = ["Lead Technician Vehicle", "Shared Vehicle", "Install Vehicle", "Service Vehicle", "Sales Vehicle", "Utility Vehicle"];
const STATUSES = ["Active", "Shared Pool", "Out of Service", "Maintenance", "Retired"];
const ASSIGNMENT_STATUSES = ["Assigned", "Available", "Checked Out", "In Use", "Returned"];

const empty = {
  truck_id: "", truck_number: "", vehicle_name: "", vehicle_type: "Lead Technician Vehicle",
  status: "Active", assigned_lead_technician: "", assigned_apprentice: "", default_crew: "",
  current_driver: "", current_job: "", current_assignment_status: "Available",
  license_plate: "", vin: "", year: "", make: "", model: "", mileage: "",
  servicetitan_truck_id: "", notes: "", last_inspection_date: "", next_inspection_date: "",
  last_maintenance_date: "", next_maintenance_date: "", related_sop_id: "",
};

export function TruckFormDialog({ open, onOpenChange, truck, onSaved }) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(truck ? { ...empty, ...truck } : empty);
  }, [truck, open]);

  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(truck ? { ...empty, ...truck } : empty),
    [form, truck]
  );
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(
    isDirty, () => onOpenChange(false)
  );

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      // Sanitize: convert empty strings to null for number fields to avoid validation errors
      const NUMBER_FIELDS = ["year", "mileage"];
      const cleaned = { ...form };
      NUMBER_FIELDS.forEach(k => {
        if (cleaned[k] === "" || cleaned[k] == null) cleaned[k] = null;
      });

      if (truck?.id) {
        await base44.entities.TruckProfile.update(truck.id, cleaned);
      } else {
        const truckId = cleaned.truck_id || `TRK-${String(Date.now()).slice(-6)}`;
        await base44.entities.TruckProfile.create({ ...cleaned, truck_id: truckId });
      }
      toast.success(truck?.id ? "Truck updated" : "Truck created");
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Failed to save truck");
    } finally {
      setSaving(false);
    }
  };

  const field = (key, label, opts = {}) => (
    <div key={key} className={opts.full ? "col-span-2" : ""}>
      <Label className="text-xs">{label}</Label>
      {opts.select ? (
        <select
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm mt-1"
          value={form[key] || ""}
          onChange={(e) => set(key, e.target.value)}
        >
          {opts.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <Input
          type={opts.type || "text"}
          value={form[key] ?? ""}
          onChange={(e) => set(key, opts.type === "number" ? Number(e.target.value) : e.target.value)}
          className="mt-1"
        />
      )}
    </div>
  );

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
...
    </Dialog>
    <DirtyCloseWarning
      open={showWarning}
      onContinueEditing={cancelDiscard}
      onDiscardChanges={confirmDiscard}
    />
    </>
  );
}