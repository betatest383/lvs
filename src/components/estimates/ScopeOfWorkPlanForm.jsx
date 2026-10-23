import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, CalendarDays, Wrench, Truck, Shield, CloudRain } from 'lucide-react';
import { toast } from 'sonner';
import DailyWorkPlanEditor from './DailyWorkPlanEditor';
import EquipmentMultiSelect from './EquipmentMultiSelect';
import FleetResourceEditor from './FleetResourceEditor';
import ScaffoldPlanningSection from './ScaffoldPlanningSection';
import { WEATHER_SENSITIVITY_OPTIONS } from '@/lib/scopeOfWorkConstants';

function safeParse(str, fallback) {
  if (!str) return fallback;
  if (Array.isArray(str)) return str;
  try { return JSON.parse(str); } catch { return fallback; }
}

export default function ScopeOfWorkPlanForm({ estimate, onSaved }) {
  const [days, setDays] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [fleetResources, setFleetResources] = useState([]);
  const [scaffold, setScaffold] = useState({ required: false, status: 'not_required' });
  const [additionalFleet, setAdditionalFleet] = useState(false);
  const [weather, setWeather] = useState('none');
  const [restrictions, setRestrictions] = useState('');
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized || !estimate) return;
    setDays(safeParse(estimate.scope_of_work_plan, []));
    setEquipment(safeParse(estimate.required_special_equipment, []));
    setFleetResources(safeParse(estimate.fleet_resource_requests, []));
    setScaffold({
      required: estimate.scaffold_plan_required || false,
      status: estimate.scaffold_plan_status || 'not_required',
    });
    setAdditionalFleet(estimate.additional_fleet_required || false);
    setWeather(estimate.weather_sensitivity || 'none');
    setRestrictions(estimate.customer_scheduling_restrictions || '');
    setInitialized(true);
  }, [estimate, initialized]);

  // Reset when estimate changes
  useEffect(() => {
    if (estimate) setInitialized(false);
  }, [estimate?.id]);

  const totalDays = days.length;
  const totalHours = days.reduce((s, d) => s + (d.estimated_hours || 0), 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = {
        scope_of_work_plan: JSON.stringify(days),
        total_job_days: totalDays,
        total_estimated_hours: totalHours,
        required_special_equipment: JSON.stringify(equipment),
        scaffold_plan_required: scaffold.required,
        scaffold_plan_status: scaffold.required ? scaffold.status : 'not_required',
        additional_fleet_required: additionalFleet,
        fleet_resource_requests: additionalFleet ? JSON.stringify(fleetResources) : JSON.stringify([]),
        weather_sensitivity: weather,
        customer_scheduling_restrictions: restrictions,
      };
      const updated = await base44.entities.Estimate.update(estimate.id, data);
      toast.success('Scope of Work Plan saved');
      onSaved?.(updated);
    } catch (e) {
      toast.error('Failed to save scope of work plan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Daily Work Plan */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="w-4 h-4" /> Daily Work Plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DailyWorkPlanEditor days={days} onChange={setDays} />
        </CardContent>
      </Card>

      {/* Special Equipment */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="w-4 h-4" /> Special Tools / Equipment Required
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EquipmentMultiSelect items={equipment} onChange={setEquipment} totalDays={totalDays} />
        </CardContent>
      </Card>

      {/* Scaffold Planning */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" /> Scaffold Planning
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScaffoldPlanningSection
            required={scaffold.required}
            status={scaffold.status}
            onChange={setScaffold}
          />
        </CardContent>
      </Card>

      {/* Fleet Resource Planning */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="w-4 h-4" /> Additional Fleet Resource
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Switch checked={additionalFleet} onCheckedChange={setAdditionalFleet} />
            <Label className="text-sm">Additional Fleet Resource Required?</Label>
          </div>
          {additionalFleet && (
            <FleetResourceEditor resources={fleetResources} onChange={setFleetResources} totalDays={totalDays} />
          )}
        </CardContent>
      </Card>

      {/* Scheduling Metadata */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CloudRain className="w-4 h-4" /> Scheduling Context
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Weather Sensitivity</Label>
            <Select value={weather} onValueChange={setWeather}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WEATHER_SENSITIVITY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Customer Scheduling Restrictions</Label>
            <Textarea rows={2} value={restrictions} onChange={e => setRestrictions(e.target.value)}
              placeholder="e.g. Only weekdays before 3pm, no work on Saturdays, customer home after 10am..." />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 sticky bottom-0 bg-background/95 backdrop-blur py-3 border-t">
        <Button onClick={handleSave} disabled={saving} className="bg-accent text-accent-foreground hover:bg-accent/90">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Scope of Work Plan
        </Button>
      </div>
    </div>
  );
}