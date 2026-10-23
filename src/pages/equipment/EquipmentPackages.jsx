import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Loader2, PackageCheck, Plus, Pencil, Package, AlertTriangle, Info, Lock } from 'lucide-react';
import { toast } from 'sonner';
import PackageFormDialog from '@/components/equipment/PackageFormDialog';
import { syncPackageToTruck, removePackageFromTruck, checkPackageConflict } from '@/lib/equipmentPackageSync';
import PackageAssignmentDeveloperPanel from '@/components/equipment/PackageAssignmentDeveloperPanel';

export default function EquipmentPackages() {
  const [packages, setPackages] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assigningPkg, setAssigningPkg] = useState(null);
  const [assignForm, setAssignForm] = useState({ truck_id: '', truck_number: '', technician: '', override_reason: '' });
  const [shortages, setShortages] = useState([]);
  const [managerOverride, setManagerOverride] = useState(false);
  const [techOverride, setTechOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [packageConflict, setPackageConflict] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      base44.entities.EquipmentPackage.filter({ is_active: true }, '-created_date'),
      base44.entities.Technician.filter({ status: 'active' }),
      base44.entities.TruckProfile.filter({ status: 'Active' }),
    ]).then(([pkgs, techs, trks]) => {
      setPackages(pkgs || []);
      setTechnicians(techs || []);
      setTrucks(trks || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openAssign = async (pkg) => {
    setAssigningPkg(pkg);
    setAssignForm({ truck_id: '', truck_number: '', technician: '', override_reason: '' });
    setShortages([]);
    setManagerOverride(false);
    setTechOverride(false);
    setOverrideReason('');
    setPackageConflict(null);
    setAssignDialogOpen(true);

    // Check stock availability for all items
    let items = [];
    try { items = JSON.parse(pkg.items || '[]'); } catch {}
    if (items.length === 0) return;

    const masterIds = items.map(i => i.equipment_master_id).filter(Boolean);
    if (masterIds.length === 0) return;
    const masterItems = await base44.entities.EquipmentMaster.filter({});
    const found = {};
    masterItems.forEach(m => { found[m.id] = m; });

    const checks = items.map(item => {
      const master = found[item.equipment_master_id];
      const available = master?.quantity_available || 0;
      const needed = item.quantity_required || 1;
      return {
        item_name: item.item_name,
        needed,
        available,
        short: available < needed,
        shortfall: Math.max(0, needed - available),
      };
    });
    setShortages(checks);

    const conflict = await checkPackageConflict(pkg.id);
    setPackageConflict(conflict);
  };

  const handleAssignPackage = async () => {
    if (!assignForm.truck_id) { toast.error('Select a vehicle'); return; }
    if (!isSharedVehicle && !assignForm.technician && !(techOverride && overrideReason.trim())) {
      toast.error('This vehicle has no primary technician. Assign a technician or use manager override.');
      return;
    }
    const hasShortages = shortages.some(s => s.short);
    if (hasShortages && !managerOverride) { toast.error('Resolve shortages or enable manager override'); return; }

    setSaving(true);
    try {
      const me = await base44.auth.me();
      const tech = !isSharedVehicle && assignForm.technician ? technicians.find(t => t.full_name === assignForm.technician) : null;
      const truckNumber = assignForm.truck_number;
      const truckId = assignForm.truck_id;
      let items = [];
      try { items = JSON.parse(assigningPkg.items || '[]'); } catch {}

      // Fetch fresh stock
      const masterItems = await base44.entities.EquipmentMaster.filter({});
      const masterMap = {};
      masterItems.forEach(m => { masterMap[m.id] = m; });

      let assignedCount = 0;
      let shortageNotes = [];

      for (const item of items) {
        const master = masterMap[item.equipment_master_id];
        if (!master) continue;
        const qty = item.quantity_required || 1;
        const available = master.quantity_available || 0;
        const assignQty = managerOverride ? Math.min(qty, available) : qty;
        if (assignQty <= 0) {
          shortageNotes.push(`${item.item_name}: 0 available`);
          continue;
        }

        await base44.entities.TechEquipment.create({
          equipment_master_id: master.id,
          equipment_id: master.equipment_id,
          item_name: master.item_name,
          category: master.category || '',
          unit: master.unit || 'ea',
          description: master.description || '',
          photo_url: master.photo_url || '',
          quantity: assignQty,
          replacement_cost: master.replacement_cost_per_unit || 0,
          current_value: assignQty * (master.replacement_cost_per_unit || 0),
          condition: 'new',
          status: 'active',
          assignment_type: 'permanent',
          assigned_employee: tech ? tech.full_name : '',
          assigned_employee_email: tech ? tech.email : '',
          assigned_by: me.full_name,
          assignment_date: new Date().toISOString(),
          assigned_truck: truckId,
          assigned_truck_number: truckNumber,
          storage_location: truckNumber ? `Truck ${truckNumber}` : 'Warehouse',
          equipment_package_id: assigningPkg.package_id || assigningPkg.id,
          shared_vehicle: isSharedVehicle,
          override_reason: techOverride ? overrideReason.trim() : '',
          acknowledgment_required: !isSharedVehicle,
          acknowledgment_signed: false,
          required_daily_operations: item.required_daily_operations || master.required_daily_operations || false,
          required_todays_job: master.required_todays_job || false,
          notes: `Assigned via package: ${assigningPkg.package_name}${isSharedVehicle ? ' (Shared Vehicle)' : ''}${techOverride ? ` (Override: ${overrideReason.trim()})` : ''}${assignQty < qty ? ` (SHORT: requested ${qty}, assigned ${assignQty})` : ''}`,
        });

        // Update stock
        await base44.entities.EquipmentMaster.update(master.id, {
          quantity_available: Math.max(0, available - assignQty),
          quantity_assigned: (master.quantity_assigned || 0) + assignQty,
        });
        assignedCount++;
      }

      if (tech && truckNumber) {
        await base44.entities.Technician.update(tech.id, { default_truck_number: truckNumber, assigned_package_id: assigningPkg.package_id || assigningPkg.id });
      }

      // Sync package assignment to TruckProfile + EquipmentPackage (single source of truth)
      await syncPackageToTruck({
        equipmentPackage: assigningPkg,
        truck: { id: truckId, truck_number: truckNumber, vehicle_name: selectedTruck?.vehicle_name || '' },
        assignedBy: me.full_name,
        isSharedPackage: isSharedVehicle,
      });

      toast.success(isSharedVehicle
        ? `Assigned ${assignedCount} items to ${truckNumber} (Shared Vehicle)`
        : `Assigned ${assignedCount} items to ${tech?.full_name || truckNumber}`);
      setAssignDialogOpen(false);
      load();
    } catch {
      toast.error('Failed to assign package');
    } finally {
      setSaving(false);
    }
  };

  const selectedTruck = trucks.find(t => t.id === assignForm.truck_id);
  const isSharedVehicle = selectedTruck?.vehicle_type === 'Shared Vehicle';
  const hasPrimaryTech = !!selectedTruck?.assigned_lead_technician;
  const techLocked = !isSharedVehicle && hasPrimaryTech && !techOverride;
  const needsTech = !isSharedVehicle && !hasPrimaryTech;
  const showManualTech = techOverride || needsTech;
  const canAssign = !!assignForm.truck_id && (isSharedVehicle || (techLocked ? !!assignForm.technician : (!!assignForm.technician && !!overrideReason.trim())));

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Equipment Packages</h1>
          <p className="text-sm text-muted-foreground">Configurable equipment bundles from the master list</p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="w-4 h-4 mr-1" /> New Package</Button>
      </div>

      {packages.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-xl">
          <PackageCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No packages yet. Create one to standardize equipment assignments.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {packages.map(pkg => {
            let items = [];
            try { items = JSON.parse(pkg.items || '[]'); } catch {}
            const totalValue = pkg.total_package_value || items.reduce((s, i) => s + (i.replacement_cost_per_unit || 0) * (i.quantity_required || 1), 0);
            return (
              <div key={pkg.id} className="border rounded-xl p-4 bg-card space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{pkg.package_name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{pkg.role_type?.replace(/_/g, ' ')} · {items.length} items</p>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(pkg); setFormOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                </div>
                {pkg.description && <p className="text-sm text-muted-foreground">{pkg.description}</p>}
                <div className="space-y-1">
                  {items.map((item, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className={item.required_daily_operations ? 'font-medium' : ''}>{item.item_name} {item.required_daily_operations && <span className="text-amber-600">★</span>}</span>
                      <span className="text-muted-foreground">{item.quantity_required} {item.unit || 'ea'}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm text-muted-foreground">Package Value</span>
                  <span className="font-bold">${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                </div>
                {pkg.assigned_truck_id && (
                  <div className="flex items-center justify-between p-2 rounded-lg bg-blue-50 border border-blue-200 text-xs">
                    <span className="text-blue-800 font-medium">On Truck {pkg.assigned_truck_number || '—'}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs text-red-600 hover:text-red-700 px-2"
                      disabled={saving}
                      onClick={async () => {
                        try {
                          const me = await base44.auth.me();
                          await removePackageFromTruck(pkg, pkg.assigned_truck_id, me.full_name);
                          toast.success('Package unassigned');
                          load();
                        } catch {
                          toast.error('Failed to unassign package');
                        }
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                )}
                <Button size="sm" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => openAssign(pkg)}>
                  {pkg.assigned_truck_id ? 'Reassign Package' : 'Assign Package'}
                </Button>
                <PackageAssignmentDeveloperPanel pkg={pkg} trucks={trucks} />
              </div>
            );
          })}
        </div>
      )}

      <PackageFormDialog open={formOpen} onOpenChange={setFormOpen} initialData={editing} onSaved={() => load()} />

      {/* Assign Package Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Assign Package: {assigningPkg?.package_name}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Select a vehicle first — the primary technician auto-fills from the vehicle profile. The technician must sign a digital acknowledgment for each item.</p>

            {/* Step 1: Vehicle */}
            <div>
              <Label>Vehicle / Truck *</Label>
              <Select value={assignForm.truck_id} onValueChange={v => {
                const truck = trucks.find(t => t.id === v);
                const shared = truck?.vehicle_type === 'Shared Vehicle';
                const primaryTech = truck?.assigned_lead_technician || '';
                setAssignForm(p => ({
                  ...p,
                  truck_id: v,
                  truck_number: truck?.truck_number || '',
                  technician: shared ? '' : primaryTech,
                  override_reason: '',
                }));
                setTechOverride(false);
                setOverrideReason('');
              }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>
                  {trucks.map(t => <SelectItem key={t.id} value={t.id}>{t.truck_number} - {t.vehicle_name || t.vehicle_type}{t.assigned_lead_technician ? ` · ${t.assigned_lead_technician}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Conflict warning — package already assigned to another truck */}
            {packageConflict && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-amber-800 font-medium">
                    This equipment package is already assigned to Truck {packageConflict.truck_number}.
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Assigning here will move the assignment to the new truck.
                  </p>
                </div>
              </div>
            )}

            {/* Step 2: Technician (auto-resolved or manual) */}
            {isSharedVehicle && assignForm.truck_id && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-300 rounded-lg">
                <Info className="w-4 h-4 text-blue-600 shrink-0" />
                <p className="text-xs text-blue-800 font-medium">Shared vehicle — no primary technician required.</p>
              </div>
            )}

            {!isSharedVehicle && assignForm.truck_id && (
              <div>
                <Label>Technician {techLocked ? '(Auto-resolved)' : '*'}</Label>
                {techLocked ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Input value={assignForm.technician} readOnly className="flex-1 bg-muted font-medium" />
                    <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                    <Button size="sm" variant="outline" onClick={() => { setTechOverride(true); setAssignForm(p => ({ ...p, technician: '' })); }}>Override</Button>
                  </div>
                ) : showManualTech ? (
                  <div className="space-y-2 mt-1">
                    <Select value={assignForm.technician} onValueChange={v => setAssignForm(p => ({ ...p, technician: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select technician" /></SelectTrigger>
                      <SelectContent>
                        {technicians.map(t => <SelectItem key={t.id} value={t.full_name}>{t.full_name} ({t.role})</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input placeholder="Override reason (required)" value={overrideReason} onChange={e => setOverrideReason(e.target.value)} />
                    {hasPrimaryTech && (
                      <Button size="sm" variant="ghost" onClick={() => { setTechOverride(false); setOverrideReason(''); setAssignForm(p => ({ ...p, technician: selectedTruck.assigned_lead_technician })); }}>Cancel Override</Button>
                    )}
                  </div>
                ) : (
                  <Select value={assignForm.technician} onValueChange={v => setAssignForm(p => ({ ...p, technician: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select technician" /></SelectTrigger>
                    <SelectContent>
                      {technicians.map(t => <SelectItem key={t.id} value={t.full_name}>{t.full_name} ({t.role})</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {needsTech && !techOverride && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    This vehicle has no primary technician assigned. Assign a technician or mark vehicle as shared.
                  </p>
                )}
              </div>
            )}

            {/* Stock availability check */}
            {shortages.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Stock Availability:</p>
                {shortages.map((s, i) => (
                  <div key={i} className={`flex justify-between items-center p-2 rounded-lg text-sm ${s.short ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                    <span>{s.item_name}</span>
                    <span className={s.short ? 'text-red-600 font-medium' : 'text-green-600'}>
                      {s.short ? `${s.available}/${s.needed} (short ${s.shortfall})` : `${s.available}/${s.needed} ✓`}
                    </span>
                  </div>
                ))}
                {shortages.some(s => s.short) && (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-amber-800 font-medium">Some items have insufficient stock</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Switch checked={managerOverride} onCheckedChange={setManagerOverride} />
                        <Label className="text-xs">Manager override (assign available quantity only)</Label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAssignPackage} disabled={saving || !canAssign || (shortages.some(s => s.short) && !managerOverride)} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {packageConflict ? 'Move Assignment' : 'Assign Package'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}