import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useEmployeeContext } from '@/hooks/useEmployeeContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Truck, Wrench, Undo2, ClipboardCheck, AlertTriangle, ChevronRight, Info } from 'lucide-react';

const STATUS_COLORS = {
  Active: 'bg-green-100 text-green-700',
  Maintenance: 'bg-amber-100 text-amber-700',
  'Out of Service': 'bg-red-100 text-red-700',
  'Shared Pool': 'bg-blue-100 text-blue-700',
  Retired: 'bg-slate-100 text-slate-600',
};

export default function MyTruckPage() {
  const { employee, effectiveEmail, effectiveName, isImpersonating } = useEmployeeContext();
  const [truck, setTruck] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [returns, setReturns] = useState([]);
  const [wh105, setWh105] = useState(null);
  const [loading, setLoading] = useState(true);

  // The assigned truck comes directly from EmployeeRegistry.assigned_truck
  const assignedTruck = employee?.assigned_truck || '';

  useEffect(() => {
    if (!assignedTruck && !effectiveEmail) return;
    let cancelled = false;

    const load = async () => {
      try {
        const today = new Date().toLocaleDateString('en-CA');
        const [trucks, allEquipment, allReturns, allWh105] = await Promise.all([
          base44.entities.TruckProfile.list('-updated_date', 100).catch(() => []),
          base44.entities.TechEquipment.list('-created_date', 200).catch(() => []),
          base44.entities.MaterialReturn.list('-created_date', 100).catch(() => []),
          base44.entities.Wh105DepartureCheck.filter({ date: today }).catch(() => []),
        ]);

        if (cancelled) return;

        // Match truck strictly by EmployeeRegistry.assigned_truck
        const myTruck = trucks.find(t =>
          t.truck_id === assignedTruck ||
          t.truck_number === assignedTruck
        ) || null;

        setTruck(myTruck);

        const truckNum = myTruck?.truck_number || assignedTruck || '';
        setEquipment(allEquipment.filter(e =>
          e.assigned_employee_email === effectiveEmail ||
          e.assigned_employee === effectiveName ||
          (truckNum && e.assigned_truck === truckNum) ||
          (truckNum && e.storage_location === truckNum)
        ));
        setReturns(allReturns.filter(r =>
          r.technician === effectiveName ||
          (truckNum && r.truck_number === truckNum)
        ));
        setWh105(allWh105.find(w => w.technician_email === effectiveEmail) || null);
      } catch (e) {
        console.error('MyTruckPage load error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [assignedTruck, effectiveEmail, effectiveName]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!truck) {
    return (
      <div className="space-y-5 pb-4">
        <h1 className="text-2xl font-bold">My Truck</h1>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Truck className="w-10 h-10 mx-auto mb-2 text-muted" />
            {assignedTruck
              ? <p>No truck profile found for "{assignedTruck}".</p>
              : <p>No truck assigned to your employee record.</p>}
            {isImpersonating && <p className="text-xs mt-1">EmployeeRegistry → assigned_truck: {assignedTruck || 'null'}</p>}
          </CardContent>
        </Card>
      </div>
    );
  }

  const truckEquipment = equipment.filter(e => e.status !== 'retired');
  const equipmentIssues = truckEquipment.filter(e => ['damaged', 'missing', 'poor'].includes(e.condition));
  const outstandingReturns = returns.filter(r => r.status !== 'Closed' && r.status !== 'Verified');
  const totalValue = truckEquipment.reduce((sum, e) => sum + (e.current_value || (e.replacement_cost || 0) * (e.quantity || 1)), 0);

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Truck className="w-6 h-6" /> My Truck
        </h1>
        {truck.truck_id && (
          <Link to={`/fleet/trucks/${truck.id}`}>
            <Button variant="outline" size="sm">Full Profile <ChevronRight className="w-3 h-3" /></Button>
          </Link>
        )}
      </div>

      {/* Registry source confirmation */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
        <Info className="w-3.5 h-3.5 flex-shrink-0" />
        Loaded from EmployeeRegistry → assigned_truck: <span className="font-mono font-medium">{assignedTruck}</span>
      </div>

      {/* Truck Profile */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Truck Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Truck Number</p>
              <p className="text-lg font-bold">{truck.truck_number || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vehicle Type</p>
              <p className="text-sm font-medium">{truck.vehicle_type || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge className={STATUS_COLORS[truck.status] || 'bg-slate-100 text-slate-600'}>
                {truck.status || '—'}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Assigned Tech</p>
              <p className="text-sm font-medium">{truck.assigned_lead_technician || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">License Plate</p>
              <p className="text-sm font-medium">{truck.license_plate || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Make / Model</p>
              <p className="text-sm font-medium">{[truck.make, truck.model].filter(Boolean).join(' ') || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last Inspection</p>
              <p className="text-sm font-medium">{truck.last_inspection_date || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Next Maintenance</p>
              <p className="text-sm font-medium">{truck.next_maintenance_date || '—'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* WH-105 Readiness */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-amber-500" /> Morning Readiness (WH-105)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {wh105 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Record ID</p>
                <p className="text-sm font-mono font-medium">{wh105.departure_id || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Overall Status</p>
                <Badge className={
                  wh105.overall_status === 'ready' ? 'bg-green-100 text-green-700' :
                  wh105.overall_status === 'blocked' ? 'bg-red-100 text-red-700' :
                  wh105.overall_status === 'departed' ? 'bg-blue-100 text-blue-700' :
                  'bg-amber-100 text-amber-700'
                }>{wh105.overall_status || '—'}</Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Readiness</p>
                <p className="text-lg font-bold">{wh105.readiness_percentage || 0}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Departed</p>
                <p className="text-sm font-medium">{wh105.departed ? 'Yes' : 'No'}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No WH-105 record for today.</p>
          )}
        </CardContent>
      </Card>

      {/* Equipment in Truck */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="w-4 h-4 text-blue-600" /> Equipment in Truck
            </CardTitle>
            <Link to="/tech/equipment" className="text-xs text-accent hover:underline">View All</Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div className="p-3 rounded-lg bg-blue-50 text-center">
              <p className="text-xl font-bold text-blue-600">{truckEquipment.length}</p>
              <p className="text-xs text-muted-foreground">Total Items</p>
            </div>
            <div className="p-3 rounded-lg bg-green-50 text-center">
              <p className="text-xl font-bold text-green-600">${totalValue.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">Total Value</p>
            </div>
            <div className="p-3 rounded-lg bg-red-50 text-center">
              <p className="text-xl font-bold text-red-600">{equipmentIssues.length}</p>
              <p className="text-xs text-muted-foreground">Issues</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 text-center">
              <p className="text-xl font-bold text-amber-600">{outstandingReturns.length}</p>
              <p className="text-xs text-muted-foreground">Returns</p>
            </div>
          </div>
          {equipmentIssues.length > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Equipment Issues ({equipmentIssues.length})</p>
                <ul className="text-xs text-red-700 mt-1">
                  {equipmentIssues.slice(0, 5).map((e, i) => (
                    <li key={i}>• {e.item_name} — {e.condition}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Material Returns */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Undo2 className="w-4 h-4 text-purple-600" /> Returns
          </CardTitle>
        </CardHeader>
        <CardContent>
          {returns.length > 0 ? (
            <div className="space-y-2">
              {returns.slice(0, 5).map(r => (
                <Link key={r.id} to={`/warehouse/material-returns/${r.id}`} className="block p-2.5 rounded-lg border hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{r.return_id || r.id}</p>
                      <p className="text-xs text-muted-foreground">{r.technician} — {r.truck_number || ''}</p>
                    </div>
                    <Badge className={r.status === 'Verified' || r.status === 'Closed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                      {r.status || '—'}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No material returns.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}