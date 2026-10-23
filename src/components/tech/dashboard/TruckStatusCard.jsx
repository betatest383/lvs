import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { Truck, Wrench, AlertTriangle, PackageX, CheckCircle2 } from 'lucide-react';

export default function TruckStatusCard({ truck, equipment, materialReturns }) {
  const truckNumber = truck?.truck_number || '—';
  const truckStatus = truck?.status || '—';
  const maintenanceAlert = truck?.status === 'Maintenance' || truck?.status === 'Out of Service';
  const nextMaintenance = truck?.next_maintenance_date;
  const equipmentIssues = equipment.filter(e => e.condition === 'damaged' || e.condition === 'lost' || e.condition === 'poor');
  const outstandingReturns = materialReturns.filter(r => r.status !== 'Closed' && r.status !== 'Verified');

  const stats = [
    { label: 'Truck Number', value: truckNumber, icon: Truck, alert: false },
    { label: 'Status', value: truckStatus, icon: maintenanceAlert ? AlertTriangle : CheckCircle2, alert: maintenanceAlert },
    { label: 'Equipment Issues', value: equipmentIssues.length, icon: Wrench, alert: equipmentIssues.length > 0 },
    { label: 'Outstanding Returns', value: outstandingReturns.length, icon: PackageX, alert: outstandingReturns.length > 0 },
  ];

  return (
    <Card className="border-0 shadow-sm h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Truck Status</CardTitle>
          <Link to="/tech/equipment" className="text-xs text-accent hover:underline">View Details</Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {stats.map((s, i) => (
            <div key={i} className={`p-3 rounded-lg border ${s.alert ? 'border-amber-200 bg-amber-50' : 'border-border bg-white'}`}>
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={`w-4 h-4 ${s.alert ? 'text-amber-600' : 'text-muted-foreground'}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className={`text-lg font-bold ${s.alert ? 'text-amber-700' : ''}`}>{s.value}</p>
            </div>
          ))}
        </div>
        {nextMaintenance && (
          <p className="text-xs text-muted-foreground mt-3">Next maintenance: {nextMaintenance}</p>
        )}
      </CardContent>
    </Card>
  );
}