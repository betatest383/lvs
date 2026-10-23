import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Truck, AlertTriangle, Edit3, Loader2, RotateCcw } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useCurrentRole } from '@/hooks/useCurrentRole';
import { canOverrideTruck } from '@/lib/roleUtils';
import { toast } from 'sonner';

const STATUS_COLORS = {
  'Auto Assigned': 'bg-green-100 text-green-700',
  'Truck Assignment Needed': 'bg-amber-100 text-amber-700',
  'Manually Overridden': 'bg-blue-100 text-blue-700',
  'Not Required': 'bg-muted text-muted-foreground',
};

const SOURCE_LABELS = {
  vehicle_assignment: 'Active Vehicle Assignment',
  technician_profile: 'Technician Profile',
  employee_registry: 'Employee Registry',
  none: 'No Source',
};

export default function TruckAssignmentField({
  trucks = [],
  leadTechnicianEmail = '',
  truckData = {},
  onTruckChange,
}) {
  const { user } = useAuth();
  const { role } = useCurrentRole();
  const canOverride = canOverrideTruck(role);
  const [resolving, setResolving] = useState(false);
  const [overrideMode, setOverrideMode] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const lastResolvedEmail = useRef('');

  const status = truckData.truck_assignment_status || 'Not Required';
  const selectedTruck = trucks.find(t => t.id === truckData.assigned_truck_id);
  const isOverridden = truckData.truck_override_used === true;
  const noTruck = status === 'Truck Assignment Needed';

  // Auto-resolve truck when lead technician changes
  useEffect(() => {
    if (!leadTechnicianEmail) {
      lastResolvedEmail.current = '';
      if (status !== 'Not Required' || truckData.assigned_truck_id) {
        onTruckChange({
          ...truckData,
          assigned_truck_id: '',
          auto_assigned_truck: '',
          truck_assignment_source: 'none',
          truck_assignment_status: 'Not Required',
          truck_override_used: false,
          truck_override_reason: '',
          truck_override_by: '',
          truck_override_at: '',
        });
      }
      return;
    }

    // Skip if already overridden and same technician
    if (isOverridden && lastResolvedEmail.current === leadTechnicianEmail) return;
    // Skip if already resolved this email (prevents re-fetch on re-render)
    if (lastResolvedEmail.current === leadTechnicianEmail && !isOverridden) return;

    lastResolvedEmail.current = leadTechnicianEmail;

    let cancelled = false;
    setResolving(true);
    base44.functions.invoke('resolveTechnicianTruck', { technician_email: leadTechnicianEmail })
      .then(res => {
        if (cancelled) return;
        const data = res.data;
        const truckId = data.truck_profile_id ||
          (trucks.find(t => t.truck_number === data.truck_number || t.truck_id === data.truck_id)?.id) ||
          '';
        onTruckChange({
          ...truckData,
          assigned_truck_id: truckId,
          auto_assigned_truck: data.truck_number || '',
          truck_assignment_source: data.source,
          truck_assignment_status: data.found ? 'Auto Assigned' : 'Truck Assignment Needed',
          truck_override_used: false,
          truck_override_reason: '',
          truck_override_by: '',
          truck_override_at: '',
        });
      })
      .catch(() => {
        if (cancelled) return;
        onTruckChange({
          ...truckData,
          assigned_truck_id: '',
          auto_assigned_truck: '',
          truck_assignment_source: 'none',
          truck_assignment_status: 'Truck Assignment Needed',
          truck_override_used: false,
        });
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });

    return () => { cancelled = true; };
  }, [leadTechnicianEmail]);

  const handleOverrideConfirm = () => {
    if (!overrideReason.trim()) {
      toast.error('Override reason is required');
      return;
    }
    if (!truckData.assigned_truck_id) {
      toast.error('Please select a truck before confirming override');
      return;
    }
    onTruckChange({
      ...truckData,
      truck_override_used: true,
      truck_override_reason: overrideReason,
      truck_override_by: user?.full_name || user?.email || 'Unknown',
      truck_override_at: new Date().toISOString(),
      truck_assignment_status: 'Manually Overridden',
    });
    setOverrideMode(false);
    setOverrideReason('');
    toast.success('Truck override applied');
  };

  const handleResetToAuto = () => {
    lastResolvedEmail.current = '';
    setResolving(true);
    base44.functions.invoke('resolveTechnicianTruck', { technician_email: leadTechnicianEmail })
      .then(res => {
        const data = res.data;
        const truckId = data.truck_profile_id ||
          (trucks.find(t => t.truck_number === data.truck_number || t.truck_id === data.truck_id)?.id) ||
          '';
        onTruckChange({
          ...truckData,
          assigned_truck_id: truckId,
          auto_assigned_truck: data.truck_number || '',
          truck_assignment_source: data.source,
          truck_assignment_status: data.found ? 'Auto Assigned' : 'Truck Assignment Needed',
          truck_override_used: false,
          truck_override_reason: '',
          truck_override_by: '',
          truck_override_at: '',
        });
      })
      .catch(() => {})
      .finally(() => setResolving(false));
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Assigned Truck</Label>
        {status !== 'Not Required' && (
          <Badge className={STATUS_COLORS[status] || STATUS_COLORS['Not Required']}>
            {status}
          </Badge>
        )}
      </div>

      {resolving ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Resolving truck assignment…
        </div>
      ) : overrideMode ? (
        <div className="space-y-2 p-3 rounded-lg border border-blue-200 bg-blue-50/50">
          <Select value={truckData.assigned_truck_id || ''} onValueChange={v => onTruckChange({ ...truckData, assigned_truck_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select truck" /></SelectTrigger>
            <SelectContent>
              {trucks.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  {t.truck_number || t.truck_id} {t.vehicle_name ? `— ${t.vehicle_name}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Override reason (required)…"
            value={overrideReason}
            onChange={e => setOverrideReason(e.target.value)}
            rows={2}
            className="text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleOverrideConfirm} className="gap-1.5">
              Confirm Override
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setOverrideMode(false); setOverrideReason(''); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : noTruck ? (
        <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/50 space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <AlertTriangle className="w-4 h-4" /> No truck assigned to this technician
          </div>
          <p className="text-xs text-amber-700">
            This technician does not have an active truck assignment. The job can still be assigned, but a manager or dispatcher must assign a truck before dispatch.
          </p>
          {canOverride && (
            <Button size="sm" variant="outline" className="mt-1 gap-1.5" onClick={() => setOverrideMode(true)}>
              <Edit3 className="w-3.5 h-3.5" /> Assign Truck Manually
            </Button>
          )}
        </div>
      ) : selectedTruck ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
            <Truck className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {selectedTruck.truck_number || selectedTruck.truck_id}
                {selectedTruck.vehicle_name ? ` — ${selectedTruck.vehicle_name}` : ''}
              </p>
              <p className="text-xs text-muted-foreground">
                {isOverridden ? 'Manually overridden' : `Auto-assigned from Lead Technician (${SOURCE_LABELS[truckData.truck_assignment_source] || truckData.truck_assignment_source || 'Unknown'})`}
              </p>
            </div>
          </div>
          {isOverridden && (
            <div className="text-xs text-muted-foreground px-1">
              <p>Reason: {truckData.truck_override_reason}</p>
              <p>By: {truckData.truck_override_by} on {new Date(truckData.truck_override_at).toLocaleString()}</p>
            </div>
          )}
          {canOverride && !isOverridden && (
            <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={() => setOverrideMode(true)}>
              <Edit3 className="w-3 h-3" /> Override Truck
            </Button>
          )}
          {canOverride && isOverridden && (
            <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={handleResetToAuto}>
              <RotateCcw className="w-3 h-3" /> Reset to Auto
            </Button>
          )}
        </div>
      ) : status === 'Not Required' ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Truck className="w-4 h-4" /> No lead technician selected
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Truck className="w-4 h-4" /> Truck not found in profile list
        </div>
      )}
    </div>
  );
}