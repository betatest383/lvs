import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, UserCheck, Search, Package, Undo2, PackageCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import AssignEquipmentDialog from '@/components/equipment/AssignEquipmentDialog';
import UnassignEquipmentDialog from '@/components/equipment/UnassignEquipmentDialog';
import BulkReturnDialog from '@/components/equipment/BulkReturnDialog';
import { ASSIGNMENT_TYPE_LABELS, ASSIGNMENT_TYPE_COLORS } from '@/lib/equipmentConstants';

export default function AssignEquipment() {
  const [masterItems, setMasterItems] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [assignItem, setAssignItem] = useState(null);
  const [returnItem, setReturnItem] = useState(null);
  const [bulkReturnOpen, setBulkReturnOpen] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      base44.entities.EquipmentMaster.filter({ is_active: true }, 'item_name', 500),
      base44.entities.TechEquipment.filter({}, '-assignment_date', 500),
    ]).then(([masters, assigns]) => {
      setMasterItems(masters || []);
      setAssignments(assigns || []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = masterItems.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    return ['item_name', 'equipment_id', 'category']
      .some(f => item[f] && String(item[f]).toLowerCase().includes(q));
  });

  const available = filtered.filter(i => (i.quantity_available || 0) > 0);
  const outOfStock = filtered.filter(i => (i.quantity_available || 0) <= 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Assign Equipment</h1>
        <p className="text-sm text-muted-foreground">Assign equipment from the master list to technicians and trucks</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search equipment..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {available.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Available to Assign ({available.length})</p>
              {available.map(item => (
                <Card key={item.id}>
                  <CardContent className="p-3 flex items-center gap-3">
                    {item.photo_url ? (
                      <img src={item.photo_url} alt={item.item_name} className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center"><Package className="w-4 h-4 text-muted-foreground" /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.item_name}</p>
                      <div className="flex flex-wrap gap-2 mt-0.5">
                        {item.equipment_id && <span className="text-xs text-muted-foreground">{item.equipment_id}</span>}
                        <span className="text-xs text-green-600 font-medium">{item.quantity_available} available</span>
                        <span className="text-xs text-muted-foreground">${(item.replacement_cost_per_unit || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} / {item.unit || 'ea'}</span>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => setAssignItem(item)} className="bg-accent text-accent-foreground hover:bg-accent/90 shrink-0">
                      <UserCheck className="w-3.5 h-3.5 mr-1" /> Assign
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {outOfStock.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Out of Stock ({outOfStock.length})</p>
              {outOfStock.map(item => (
                <Card key={item.id} className="opacity-60">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center"><Package className="w-4 h-4 text-muted-foreground" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.item_name}</p>
                      <span className="text-xs text-red-600">No available stock · {item.quantity_assigned || 0} assigned</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Current Assignments */}
          {(() => {
            const activeAssignments = assignments.filter(a => a.is_active !== false);
            if (activeAssignments.length === 0) return null;
            return (
              <div className="space-y-2 pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">Current Assignments ({activeAssignments.length})</p>
                  {activeAssignments.length > 1 && (
                    <Button size="sm" variant="outline" onClick={() => setBulkReturnOpen(true)}>
                      <PackageCheck className="w-3.5 h-3.5 mr-1" /> Bulk Return
                    </Button>
                  )}
                </div>
                <div className="border rounded-xl overflow-hidden">
                  <div className="hidden md:grid grid-cols-7 gap-2 px-4 py-2 bg-muted text-xs font-medium text-muted-foreground">
                    <span className="col-span-2">Equipment</span>
                    <span className="col-span-1 text-center">Qty</span>
                    <span className="col-span-1">Technician</span>
                    <span className="col-span-1">Truck</span>
                    <span className="col-span-1 text-right">Value</span>
                    <span className="col-span-1 text-right">Action</span>
                  </div>
                  {activeAssignments.map(a => (
                    <div key={a.id} className="grid grid-cols-7 gap-2 px-4 py-2 border-t bg-card text-sm items-center">
                      <div className="col-span-2">
                        <p className="font-medium truncate">{a.item_name}</p>
                        <span className={`px-1.5 py-0.5 rounded-full text-xs ${ASSIGNMENT_TYPE_COLORS[a.assignment_type] || ''}`}>{ASSIGNMENT_TYPE_LABELS[a.assignment_type]}</span>
                      </div>
                      <div className="col-span-1 text-center font-medium">{a.quantity || 1} {a.unit || ''}</div>
                      <div className="col-span-1 text-xs text-muted-foreground truncate">{a.assigned_employee || '—'}</div>
                      <div className="col-span-1 text-xs text-muted-foreground truncate">{a.assigned_truck_number || '—'}</div>
                      <div className="col-span-1 text-right font-semibold">${(a.current_value || (a.replacement_cost * a.quantity) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                      <div className="col-span-1 flex justify-end">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReturnItem(a)}>
                          <Undo2 className="w-3 h-3 mr-1" /> Unassign
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </>
      )}

      <AssignEquipmentDialog open={!!assignItem} onOpenChange={v => !v && setAssignItem(null)} equipment={assignItem} onAssigned={() => load()} />
      <UnassignEquipmentDialog open={!!returnItem} onOpenChange={v => !v && setReturnItem(null)} assignment={returnItem} onReturned={() => load()} />
      <BulkReturnDialog open={bulkReturnOpen} onOpenChange={setBulkReturnOpen} assignments={assignments.filter(a => a.is_active !== false)} onReturned={() => load()} />
    </div>
  );
}