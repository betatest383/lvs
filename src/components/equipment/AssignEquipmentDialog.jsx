import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import EmployeePicker from '@/components/shared/EmployeePicker';
import { ASSIGNMENT_TYPE_LABELS, CONDITION_LABELS } from '@/lib/equipmentConstants';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

export default function AssignEquipmentDialog({ open, onOpenChange, equipment, onAssigned }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [technicians, setTechnicians] = useState([]);
  const [trucks, setTrucks] = useState([]);

  useEffect(() => {
    setForm({
      quantity: 1,
      assignment_type: 'permanent',
      assigned_employee: '',
      assigned_employee_email: '',
      assigned_truck_number: '',
      condition: 'good',
      acknowledgment_required: true,
      notes: '',
      expected_return_datetime: '',
    });
  }, [equipment]);

  useEffect(() => {
    if (open) {
      base44.entities.Technician.filter({ status: 'active' }).then(setTechnicians).catch(() => {});
      base44.entities.TruckProfile.filter({ status: 'Active' }).then(setTrucks).catch(() => {});
    }
  }, [open]);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open, equipment]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onOpenChange(false));

  const update = (key, value) => { setForm(prev => ({ ...prev, [key]: value })); setIsDirty(true); };

  const availableQty = equipment?.quantity_available || 0;
  const assignQty = form.quantity || 1;
  const costPerUnit = equipment?.replacement_cost_per_unit || 0;
  const totalValue = assignQty * costPerUnit;
  const exceedsStock = assignQty > availableQty;

  const handleSave = async () => {
    if (!equipment) return;
    if (assignQty < 1) { toast.error('Quantity must be at least 1'); return; }
    if (exceedsStock) { toast.error(`Only ${availableQty} available in stock`); return; }
    if (form.assignment_type !== 'warehouse_stock' && form.assignment_type !== 'retired' && !form.assigned_employee) {
      toast.error('Please select a technician'); return;
    }
    setSaving(true);
    try {
      const me = await base44.auth.me();
      const now = new Date().toISOString();

      // Create TechEquipment assignment record
      const assignmentData = {
        equipment_master_id: equipment.id,
        equipment_id: equipment.equipment_id,
        item_name: equipment.item_name,
        category: equipment.category || '',
        unit: equipment.unit || 'ea',
        description: equipment.description || '',
        photo_url: equipment.photo_url || '',
        quantity: assignQty,
        replacement_cost: costPerUnit,
        current_value: totalValue,
        condition: form.condition,
        status: form.assignment_type === 'repair' ? 'out_for_repair' : form.assignment_type === 'retired' ? 'retired' : 'active',
        assignment_type: form.assignment_type,
        assigned_employee: form.assigned_employee || '',
        assigned_employee_email: form.assigned_employee_email || '',
        assigned_by: me.full_name,
        assignment_date: now,
        assigned_truck_number: form.assigned_truck_number || '',
        storage_location: form.assigned_truck_number ? `Truck ${form.assigned_truck_number}` : form.assignment_type === 'warehouse_stock' ? 'Warehouse' : `Assigned to ${form.assigned_employee}`,
        acknowledgment_required: form.acknowledgment_required,
        acknowledgment_signed: false,
        required_daily_operations: equipment.required_daily_operations || false,
        required_todays_job: equipment.required_todays_job || false,
        notes: form.notes || '',
      };

      if (form.assignment_type === 'temporary') {
        assignmentData.return_required = true;
        assignmentData.expected_return_datetime = form.expected_return_datetime || null;
      }

      const created = await base44.entities.TechEquipment.create(assignmentData);

      // Adjust EquipmentMaster stock quantities
      let stockUpdate = {};
      if (form.assignment_type === 'permanent' || form.assignment_type === 'temporary') {
        stockUpdate = {
          quantity_available: availableQty - assignQty,
          quantity_assigned: (equipment.quantity_assigned || 0) + assignQty,
        };
      } else if (form.assignment_type === 'repair') {
        stockUpdate = {
          quantity_available: availableQty - assignQty,
          quantity_out_for_repair: (equipment.quantity_out_for_repair || 0) + assignQty,
        };
      } else if (form.assignment_type === 'retired') {
        stockUpdate = {
          quantity_available: availableQty - assignQty,
          quantity_retired: (equipment.quantity_retired || 0) + assignQty,
        };
      }
      // warehouse_stock = no stock change

      if (Object.keys(stockUpdate).length > 0) {
        await base44.entities.EquipmentMaster.update(equipment.id, stockUpdate);
      }

      toast.success(`${assignQty} x ${equipment.item_name} assigned`);
      onAssigned?.(created);
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to assign equipment');
    } finally {
      setSaving(false);
    }
  };

  const showTechSelect = form.assignment_type !== 'warehouse_stock' && form.assignment_type !== 'retired';

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