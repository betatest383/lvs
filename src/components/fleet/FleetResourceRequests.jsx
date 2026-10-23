import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Truck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { FLEET_REQUEST_STATUS_STYLE } from '@/lib/scopeOfWorkConstants';

export default function FleetResourceRequests() {
  const [requests, setRequests] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [reqs, truckList] = await Promise.all([
        base44.entities.FleetResourceRequest.list('-created_date', 100),
        base44.entities.TruckProfile.filter({ status: 'Active' }),
      ]);
      setRequests(reqs);
      setTrucks(truckList);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleAssign = async (requestId, truckId) => {
    const truck = trucks.find(t => t.id === truckId);
    if (!truck) return;
    setAssigning(requestId);
    try {
      await base44.entities.FleetResourceRequest.update(requestId, {
        status: 'Assigned',
        assigned_truck_id: truck.id,
        assigned_truck_number: truck.truck_number,
        assigned_at: new Date().toISOString(),
        assigned_by: 'Fleet Manager',
      });
      toast.success(`Assigned Truck ${truck.truck_number}`);
      load();
    } catch {
      toast.error('Failed to assign truck');
    } finally {
      setAssigning(null);
    }
  };

  const pending = requests.filter(r => r.status === 'Pending Assignment');
  const assigned = requests.filter(r => r.status === 'Assigned');
  const unavailable = requests.filter(r => r.status === 'Unavailable');

  if (loading) {
    return <Card><CardContent className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  if (requests.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="w-4 h-4" /> Fleet Resource Requests
          {pending.length > 0 && <Badge className="bg-amber-100 text-amber-700 text-xs">{pending.length} pending</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {pending.map(req => {
          const matchingTrucks = trucks.filter(t => {
            const vt = (t.vehicle_type || '').toLowerCase();
            const vc = (req.vehicle_class || '').toLowerCase();
            return vc.includes('dump') ? vt.includes('service') || vt.includes('install') :
              vc.includes('pickup') ? vt.includes('lead') || vt.includes('service') :
              vc.includes('van') ? vt.includes('service') : true;
          });
          const hasConflict = matchingTrucks.length === 0;
          return (
            <div key={req.id} className={`border rounded-lg p-2.5 space-y-1.5 ${hasConflict ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50/50'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">{req.vehicle_class}</span>
                  <span className="text-xs text-muted-foreground ml-1.5">×{req.quantity_needed}</span>
                  {req.critical && <Badge variant="destructive" className="text-[10px] ml-1.5">Critical</Badge>}
                </div>
                {hasConflict && (
                  <Badge className="bg-red-100 text-red-700 text-[10px] gap-1"><AlertTriangle className="w-2.5 h-2.5" /> Conflict</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{req.customer_name} · {req.purpose || '—'}</p>
              {hasConflict ? (
                <p className="text-xs text-red-600">No matching vehicles available. Consider renting or rescheduling.</p>
              ) : (
                <Select onValueChange={v => handleAssign(req.id, v)} disabled={assigning === req.id}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Assign truck..." /></SelectTrigger>
                  <SelectContent>
                    {matchingTrucks.map(t => <SelectItem key={t.id} value={t.id}>Truck {t.truck_number} — {t.vehicle_name || t.make}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          );
        })}

        {assigned.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-1">Assigned</p>
            {assigned.map(req => (
              <div key={req.id} className="flex items-center justify-between py-1 text-sm">
                <span>{req.vehicle_class} ×{req.quantity_needed} — {req.customer_name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-green-700">→ Truck {req.assigned_truck_number}</span>
                  <Badge className={`text-[10px] ${FLEET_REQUEST_STATUS_STYLE[req.status]}`}>{req.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        {unavailable.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-1">Unavailable</p>
            {unavailable.map(req => (
              <div key={req.id} className="flex items-center justify-between py-1 text-sm">
                <span>{req.vehicle_class} ×{req.quantity_needed} — {req.customer_name}</span>
                <Badge className={`text-[10px] ${FLEET_REQUEST_STATUS_STYLE[req.status]}`}>{req.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}