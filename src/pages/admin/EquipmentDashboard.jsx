import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Package, Warehouse, Clock, ShieldAlert, AlertTriangle, Wrench, TrendingUp, Users, Truck } from 'lucide-react';

export default function EquipmentDashboard() {
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const items = await base44.entities.TechEquipment.list('-created_date', 500);
        setEquipment(items || []);
      } catch (e) {
        console.error('Equipment load error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  const totalValue = equipment.reduce((sum, e) => sum + (e.current_value || e.replacement_cost || 0) * (e.quantity || 1), 0);
  const assigned = equipment.filter(e => e.assignment_type !== 'warehouse_stock' && e.status === 'active');
  const warehouse = equipment.filter(e => e.assignment_type === 'warehouse_stock');
  const temporary = equipment.filter(e => e.assignment_type === 'temporary');
  const missing = equipment.filter(e => e.status === 'missing');
  const damaged = equipment.filter(e => e.status === 'damaged');
  const outForRepair = equipment.filter(e => e.status === 'out_for_repair');

  // Group by technician
  const byTech = {};
  equipment.filter(e => e.assigned_employee_email).forEach(e => {
    const key = e.assigned_employee || e.assigned_employee_email;
    if (!byTech[key]) byTech[key] = { count: 0, value: 0 };
    byTech[key].count += e.quantity || 1;
    byTech[key].value += (e.current_value || e.replacement_cost || 0) * (e.quantity || 1);
  });

  // Group by truck
  const byTruck = {};
  equipment.filter(e => e.assigned_truck_number).forEach(e => {
    const key = e.assigned_truck_number;
    if (!byTruck[key]) byTruck[key] = { count: 0, value: 0 };
    byTruck[key].count += e.quantity || 1;
    byTruck[key].value += (e.current_value || e.replacement_cost || 0) * (e.quantity || 1);
  });

  // Most expensive
  const sorted = [...equipment].sort((a, b) => ((b.current_value || b.replacement_cost || 0) * (b.quantity || 1)) - ((a.current_value || a.replacement_cost || 0) * (a.quantity || 1)));
  const topExpensive = sorted.slice(0, 5);

  const kpis = [
    { label: 'Total Equipment Value', value: `$${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, icon: DollarSign, color: 'bg-green-100 text-green-600' },
    { label: 'Assets Assigned', value: assigned.length, icon: Package, color: 'bg-blue-100 text-blue-600' },
    { label: 'Warehouse Assets', value: warehouse.length, icon: Warehouse, color: 'bg-gray-100 text-gray-600' },
    { label: 'Temporary Checkouts', value: temporary.length, icon: Clock, color: 'bg-cyan-100 text-cyan-600' },
    { label: 'Missing Equipment', value: missing.length, icon: ShieldAlert, color: 'bg-red-100 text-red-600' },
    { label: 'Damaged Equipment', value: damaged.length, icon: AlertTriangle, color: 'bg-orange-100 text-orange-600' },
    { label: 'Repairs Pending', value: outForRepair.length, icon: Wrench, color: 'bg-purple-100 text-purple-600' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Equipment Management Dashboard</h1>
        <p className="text-sm text-muted-foreground">Company asset accountability overview</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {kpis.map((kpi, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${kpi.color}`}>
                <kpi.icon className="w-4 h-4" />
              </div>
              <p className="text-xl font-bold">{kpi.value}</p>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Most Expensive Assets */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Most Expensive Assets</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {topExpensive.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="truncate">{item.item_name} {item.quantity > 1 && <span className="text-muted-foreground">x{item.quantity}</span>}</span>
                <span className="font-semibold">${((item.current_value || item.replacement_cost || 0) * (item.quantity || 1)).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top Missing Items */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> Missing Equipment</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {missing.length === 0 ? (
              <p className="text-sm text-muted-foreground">No missing equipment.</p>
            ) : missing.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="truncate">{item.item_name}</span>
                <span className="text-xs text-muted-foreground">{item.assigned_employee || 'Unassigned'}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Equipment by Technician */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Equipment by Technician</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(byTech).length === 0 ? (
              <p className="text-sm text-muted-foreground">No assignments.</p>
            ) : Object.entries(byTech).sort((a, b) => b[1].value - a[1].value).map(([name, data]) => (
              <div key={name} className="flex items-center justify-between text-sm">
                <span className="truncate">{name}</span>
                <span className="text-muted-foreground">{data.count} items · ${data.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Equipment by Truck */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Truck className="w-4 h-4" /> Equipment by Truck</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(byTruck).length === 0 ? (
              <p className="text-sm text-muted-foreground">No truck assignments.</p>
            ) : Object.entries(byTruck).sort((a, b) => b[1].value - a[1].value).map(([truck, data]) => (
              <div key={truck} className="flex items-center justify-between text-sm">
                <span className="truncate">Truck {truck}</span>
                <span className="text-muted-foreground">{data.count} items · ${data.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}