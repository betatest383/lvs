import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Truck } from 'lucide-react';

export default function EmployeeFleetTab({ employee }) {
  const [truck, setTruck] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employee.assigned_truck) { setLoading(false); return; }
    base44.entities.TruckProfile.list('-created_date', 200)
      .then(trucks => {
        const match = trucks.find(t => t.truck_number === employee.assigned_truck || t.truck_id === employee.assigned_truck);
        setTruck(match || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [employee]);

  if (loading) return <p className="text-sm text-muted-foreground text-center py-4">Loading truck...</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Truck className="w-4 h-4" /> Assigned Truck</CardTitle></CardHeader>
        <CardContent>
          {truck ? (
            <div className="space-y-2">
              <Link to={`/fleet/trucks/${truck.id}`} className="font-medium text-sm hover:text-accent">{truck.truck_number} — {truck.vehicle_name || truck.vehicle_type}</Link>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <p className="text-xs"><span className="text-muted-foreground">Status:</span> {truck.status}</p>
                <p className="text-xs"><span className="text-muted-foreground">Type:</span> {truck.vehicle_type}</p>
                <p className="text-xs"><span className="text-muted-foreground">Make:</span> {truck.make || '—'}</p>
                <p className="text-xs"><span className="text-muted-foreground">Model:</span> {truck.model || '—'}</p>
                <p className="text-xs"><span className="text-muted-foreground">Plate:</span> {truck.license_plate || '—'}</p>
                <p className="text-xs"><span className="text-muted-foreground">VIN:</span> {truck.vin || '—'}</p>
              </div>
            </div>
          ) : <p className="text-sm text-muted-foreground">No truck assigned.</p>}
        </CardContent>
      </Card>
    </div>
  );
}