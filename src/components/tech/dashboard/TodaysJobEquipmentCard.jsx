import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, Package } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';

export default function TodaysJobEquipmentCard({ equipment = [], user, truckNumber, todayJobs = [] }) {
  const { toast } = useToast();
  const [requesting, setRequesting] = useState(false);

  const todaysEquipment = equipment.filter(e => e.required_todays_job && e.is_active !== false);
  const assigned = todaysEquipment.filter(e => e.assigned_employee_email === user?.email || e.assigned_employee === user?.full_name);
  const missing = todaysEquipment.filter(e => !e.assigned_employee_email && !e.assigned_employee);

  const allAssigned = missing.length === 0 && todaysEquipment.length > 0;
  const jobLabel = todayJobs.length > 0 ? `${todayJobs.length} job${todayJobs.length > 1 ? 's' : ''} today` : 'No jobs today';

  const requestEquipment = async () => {
    setRequesting(true);
    try {
      for (const item of missing) {
        await base44.entities.EquipmentRequest.create({
          technician_email: user.email,
          technician_name: user.full_name,
          truck_number: truckNumber,
          request_type: 'todays_job',
          item_name: item.item_name,
          category: item.category || '',
          quantity: item.quantity || 1,
          job_number: todayJobs[0]?.job_number || '',
          reason: `Required for today's job — not currently assigned`,
          urgency: 'high',
          status: 'pending',
          requested_at: new Date().toISOString(),
        });
      }
      toast({ title: 'Equipment Requested', description: 'Warehouse has been notified of your equipment needs.' });
    } catch (e) {
      toast({ title: 'Request Failed', description: e.message, variant: 'destructive' });
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Card className={!allAssigned && missing.length > 0 ? 'border-amber-200' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            Today's Job Equipment
          </CardTitle>
          <span className="text-xs text-muted-foreground">{jobLabel}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {todaysEquipment.length === 0 ? (
          <p className="text-sm text-muted-foreground">No special equipment required for today's jobs.</p>
        ) : allAssigned ? (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium text-green-700">All Required Equipment Assigned</span>
          </div>
        ) : (
          <>
            {assigned.length > 0 && (
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-xs text-green-700">{assigned.length} item(s) assigned</span>
              </div>
            )}
            <div className="space-y-1">
              {missing.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded bg-amber-50 border border-amber-100">
                  <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                  <span className="font-medium">{item.item_name}</span>
                  <span className="text-amber-600 ml-auto">Needed</span>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" className="w-full mt-2" onClick={requestEquipment} disabled={requesting}>
              {requesting ? 'Requesting...' : 'Request Equipment'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}