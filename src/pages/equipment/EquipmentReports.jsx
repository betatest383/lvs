import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Package, Users, Truck, AlertTriangle, DollarSign, ClipboardList } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ASSIGNMENT_TYPE_LABELS, ASSIGNMENT_TYPE_COLORS, STATUS_LABELS, STATUS_COLORS } from '@/lib/equipmentConstants';

export default function EquipmentReports() {
  const [master, setMaster] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.EquipmentMaster.filter({ is_active: true }, 'item_name', 500),
      base44.entities.TechEquipment.list('-assignment_date', 500),
      base44.entities.EquipmentPackage.filter({ is_active: true }, '-created_date'),
    ]).then(([m, a, p]) => {
      setMaster(m || []);
      setAssignments(a || []);
      setPackages(p || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const catalogValue = master.reduce((s, e) => s + (e.replacement_cost_per_unit || 0) * (e.quantity_owned || 0), 0);
  const assignedValue = assignments.reduce((s, e) => s + (e.current_value || (e.replacement_cost || 0) * (e.quantity || 1)), 0);

  // By technician
  const byTech = {};
  assignments.filter(e => e.assigned_employee).forEach(e => {
    const key = e.assigned_employee;
    if (!byTech[key]) byTech[key] = { count: 0, value: 0, items: [] };
    byTech[key].count += e.quantity || 1;
    byTech[key].value += e.current_value || (e.replacement_cost || 0) * (e.quantity || 1);
    byTech[key].items.push(e);
  });

  // By truck
  const byTruck = {};
  assignments.filter(e => e.assigned_truck_number).forEach(e => {
    const key = e.assigned_truck_number;
    if (!byTruck[key]) byTruck[key] = { count: 0, value: 0, items: [] };
    byTruck[key].count += e.quantity || 1;
    byTruck[key].value += e.current_value || (e.replacement_cost || 0) * (e.quantity || 1);
    byTruck[key].items.push(e);
  });

  // Shortage report
  const lowStock = master.filter(e => (e.quantity_available || 0) <= 0 && (e.quantity_owned || 0) > 0);
  const lowStockWarning = master.filter(e => (e.quantity_available || 0) > 0 && (e.quantity_available || 0) <= 2);

  // Package availability
  const packageAvailability = packages.map(pkg => {
    let items = [];
    try { items = JSON.parse(pkg.items || '[]'); } catch {}
    const checks = items.map(item => {
      const masterItem = master.find(m => m.id === item.equipment_master_id);
      const available = masterItem?.quantity_available || 0;
      return { item_name: item.item_name, needed: item.quantity_required || 1, available, sufficient: available >= (item.quantity_required || 1) };
    });
    return { pkg, checks, allAvailable: checks.every(c => c.sufficient) };
  });

  const summaryCards = [
    { label: 'Total Catalog Value', value: `$${catalogValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, icon: DollarSign, color: 'bg-green-100 text-green-600' },
    { label: 'Total Assigned Value', value: `$${assignedValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, icon: Package, color: 'bg-purple-100 text-purple-600' },
    { label: 'Equipment Types', value: master.length, icon: Package, color: 'bg-blue-100 text-blue-600' },
    { label: 'Shortage Items', value: lowStock.length, icon: AlertTriangle, color: 'bg-red-100 text-red-600' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Equipment Reports</h1>
        <p className="text-sm text-muted-foreground">Stock, assignment, shortage, and value reports</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaryCards.map((card, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${card.color}`}>
                <card.icon className="w-4 h-4" />
              </div>
              <p className="text-xl font-bold">{card.value}</p>
              <p className="text-xs text-muted-foreground">{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="stock" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="stock"><Package className="w-3.5 h-3.5 mr-1" /> Stock Report</TabsTrigger>
          <TabsTrigger value="tech"><Users className="w-3.5 h-3.5 mr-1" /> By Technician</TabsTrigger>
          <TabsTrigger value="truck"><Truck className="w-3.5 h-3.5 mr-1" /> By Truck</TabsTrigger>
          <TabsTrigger value="shortage"><AlertTriangle className="w-3.5 h-3.5 mr-1" /> Shortage</TabsTrigger>
          <TabsTrigger value="packages"><ClipboardList className="w-3.5 h-3.5 mr-1" /> Package Availability</TabsTrigger>
        </TabsList>

        {/* Stock Report */}
        <TabsContent value="stock">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Equipment Stock Report</CardTitle></CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <div className="grid grid-cols-7 gap-2 px-3 py-2 bg-muted text-xs font-medium text-muted-foreground">
                  <span className="col-span-2">Equipment</span>
                  <span className="text-center">Owned</span>
                  <span className="text-center">Avail</span>
                  <span className="text-center">Assign</span>
                  <span className="text-center">Repair</span>
                  <span className="text-right">Value</span>
                </div>
                {master.map(item => (
                  <div key={item.id} className="grid grid-cols-7 gap-2 px-3 py-2 border-t text-sm items-center">
                    <span className="col-span-2 truncate font-medium">{item.item_name} <span className="text-xs text-muted-foreground">({item.unit})</span></span>
                    <span className="text-center">{item.quantity_owned || 0}</span>
                    <span className={`text-center font-medium ${(item.quantity_available || 0) <= 0 ? 'text-red-600' : ''}`}>{item.quantity_available || 0}</span>
                    <span className="text-center text-blue-600">{item.quantity_assigned || 0}</span>
                    <span className="text-center text-orange-600">{item.quantity_out_for_repair || 0}</span>
                    <span className="text-right font-semibold">${((item.replacement_cost_per_unit || 0) * (item.quantity_owned || 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Technician */}
        <TabsContent value="tech">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Equipment Assigned by Technician</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(byTech).sort((a, b) => b[1].value - a[1].value).map(([tech, data]) => (
                <div key={tech} className="border rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-medium text-sm">{tech}</p>
                    <span className="text-sm font-semibold">${data.value.toLocaleString('en-US', { maximumFractionDigits: 0 })} · {data.count} units</span>
                  </div>
                  <div className="space-y-1">
                    {data.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs text-muted-foreground">
                        <span>{item.item_name} ×{item.quantity || 1}</span>
                        <span>{ASSIGNMENT_TYPE_LABELS[item.assignment_type]} · ${(item.current_value || (item.replacement_cost || 0) * (item.quantity || 1)).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {Object.keys(byTech).length === 0 && <p className="text-sm text-muted-foreground">No assignments.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Truck */}
        <TabsContent value="truck">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Equipment Assigned by Truck</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(byTruck).sort((a, b) => b[1].value - a[1].value).map(([truck, data]) => (
                <div key={truck} className="border rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-medium text-sm">Truck {truck}</p>
                    <span className="text-sm font-semibold">${data.value.toLocaleString('en-US', { maximumFractionDigits: 0 })} · {data.count} units</span>
                  </div>
                  <div className="space-y-1">
                    {data.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs text-muted-foreground">
                        <span>{item.item_name} ×{item.quantity || 1}</span>
                        <span>{item.assigned_employee || '—'} · ${(item.current_value || (item.replacement_cost || 0) * (item.quantity || 1)).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {Object.keys(byTruck).length === 0 && <p className="text-sm text-muted-foreground">No truck assignments.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Shortage Report */}
        <TabsContent value="shortage">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-red-600">Out of Stock ({lowStock.length})</CardTitle></CardHeader>
              <CardContent>
                {lowStock.length === 0 ? <p className="text-sm text-muted-foreground">No out-of-stock items.</p> : (
                  <div className="space-y-1">
                    {lowStock.map(item => (
                      <div key={item.id} className="flex justify-between text-sm border-b pb-1">
                        <span>{item.item_name}</span>
                        <span className="text-red-600">0 available / {item.quantity_owned || 0} owned</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-amber-600">Low Stock Warning ({lowStockWarning.length})</CardTitle></CardHeader>
              <CardContent>
                {lowStockWarning.length === 0 ? <p className="text-sm text-muted-foreground">No low-stock warnings.</p> : (
                  <div className="space-y-1">
                    {lowStockWarning.map(item => (
                      <div key={item.id} className="flex justify-between text-sm border-b pb-1">
                        <span>{item.item_name}</span>
                        <span className="text-amber-600">{item.quantity_available} available</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Package Availability */}
        <TabsContent value="packages">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Equipment Package Availability</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {packageAvailability.length === 0 ? <p className="text-sm text-muted-foreground">No packages.</p> :
                packageAvailability.map(({ pkg, checks, allAvailable }) => (
                  <div key={pkg.id} className="border rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                      <p className="font-medium text-sm">{pkg.package_name}</p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${allAvailable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {allAvailable ? 'Available' : 'Shortage'}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {checks.map((c, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span>{c.item_name}</span>
                          <span className={c.sufficient ? 'text-green-600' : 'text-red-600'}>{c.available}/{c.needed}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              }
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}