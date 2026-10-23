import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Package, Warehouse, Clock, ShieldAlert, AlertTriangle, Wrench, TrendingUp, Users, Truck, Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function EquipmentDashboard() {
  const [master, setMaster] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.EquipmentMaster.filter({ is_active: true }, 'item_name', 500),
      base44.entities.TechEquipment.list('-assignment_date', 500),
    ]).then(([m, a]) => {
      setMaster(m || []);
      setAssignments(a || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  const catalogValue = master.reduce((s, e) => s + (e.replacement_cost_per_unit || 0) * (e.quantity_owned || 0), 0);
  const assignedValue = assignments.reduce((s, e) => s + (e.current_value || (e.replacement_cost || 0) * (e.quantity || 1)), 0);
  const totalUnitsOwned = master.reduce((s, e) => s + (e.quantity_owned || 0), 0);
  const totalUnitsAvailable = master.reduce((s, e) => s + (e.quantity_available || 0), 0);
  const totalUnitsAssigned = master.reduce((s, e) => s + (e.quantity_assigned || 0), 0);
  const totalUnitsRepair = master.reduce((s, e) => s + (e.quantity_out_for_repair || 0), 0);
  const permanent = assignments.filter(e => e.assignment_type === 'permanent');
  const temporary = assignments.filter(e => e.assignment_type === 'temporary');
  const missing = assignments.filter(e => e.status === 'missing' || e.condition === 'missing');
  const damaged = assignments.filter(e => e.status === 'damaged' || e.condition === 'damaged');
  const lowStock = master.filter(e => (e.quantity_available || 0) <= 0 && (e.quantity_owned || 0) > 0);

  const kpis = [
    { label: 'Catalog Value', value: `$${catalogValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, icon: DollarSign, color: 'bg-green-100 text-green-600' },
    { label: 'Assigned Value', value: `$${assignedValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, icon: TrendingUp, color: 'bg-purple-100 text-purple-600' },
    { label: 'Equipment Types', value: master.length, icon: Package, color: 'bg-blue-100 text-blue-600' },
    { label: 'Units Owned', value: totalUnitsOwned, icon: Package, color: 'bg-gray-100 text-gray-600' },
    { label: 'Units Available', value: totalUnitsAvailable, icon: Warehouse, color: 'bg-cyan-100 text-cyan-600' },
    { label: 'Units Assigned', value: totalUnitsAssigned, icon: Users, color: 'bg-purple-100 text-purple-600' },
    { label: 'Out for Repair', value: totalUnitsRepair, icon: Wrench, color: 'bg-orange-100 text-orange-600' },
    { label: 'Missing', value: missing.length, icon: ShieldAlert, color: 'bg-red-100 text-red-600' },
  ];

  const byTech = {};
  assignments.filter(e => e.assigned_employee).forEach(e => {
    const key = e.assigned_employee;
    if (!byTech[key]) byTech[key] = { count: 0, value: 0 };
    byTech[key].count += e.quantity || 1;
    byTech[key].value += e.current_value || (e.replacement_cost || 0) * (e.quantity || 1);
  });

  const byTruck = {};
  assignments.filter(e => e.assigned_truck_number).forEach(e => {
    const key = e.assigned_truck_number;
    if (!byTruck[key]) byTruck[key] = { count: 0, value: 0 };
    byTruck[key].count += e.quantity || 1;
    byTruck[key].value += e.current_value || (e.replacement_cost || 0) * (e.quantity || 1);
  });

  const integrations = [
    { label: 'Truck Profiles', to: '/fleet/trucks', icon: Truck },
    { label: 'WH-201 Truck Returns', to: '/warehouse/material-returns', icon: Package },
    { label: 'Morning Readiness', to: '/tech/dashboard', icon: Clock },
    { label: 'Management Audits', to: '/audits', icon: ShieldAlert },
    { label: 'Operations Center', to: '/operations', icon: TrendingUp },
    { label: 'Continuous Improvement', to: '/ci', icon: Wrench },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Equipment Management Dashboard</h1>
        <p className="text-sm text-muted-foreground">Company-wide asset accountability and operations</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

      {lowStock.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-600" /> Low Stock Alerts ({lowStock.length})</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {lowStock.slice(0, 5).map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{item.item_name}</span>
                <span className="text-red-600">0 available / {item.quantity_owned || 0} owned</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Equipment by Technician</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(byTech).length === 0 ? <p className="text-sm text-muted-foreground">No assignments.</p> :
              Object.entries(byTech).sort((a, b) => b[1].value - a[1].value).slice(0, 8).map(([name, data]) => (
                <div key={name} className="flex items-center justify-between text-sm">
                  <span className="truncate">{name}</span>
                  <span className="text-muted-foreground">{data.count} units · ${data.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                </div>
              ))
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Truck className="w-4 h-4" /> Equipment by Truck</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(byTruck).length === 0 ? <p className="text-sm text-muted-foreground">No truck assignments.</p> :
              Object.entries(byTruck).sort((a, b) => b[1].value - a[1].value).slice(0, 8).map(([truck, data]) => (
                <div key={truck} className="flex items-center justify-between text-sm">
                  <span className="truncate">Truck {truck}</span>
                  <span className="text-muted-foreground">{data.count} units · ${data.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                </div>
              ))
            }
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Link2 className="w-4 h-4" /> Integrations</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {integrations.map((int, i) => (
              <Link key={i} to={int.to} className="flex flex-col items-center gap-1 p-3 rounded-lg border hover:bg-muted transition-colors">
                <int.icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-center">{int.label}</span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}