import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CalendarDays, Wrench, Truck, Shield, CloudRain, Clock, Users, Hammer,
  CheckCircle2, AlertCircle,
} from 'lucide-react';
import { SCAFFOLD_STATUS_STYLE, WEATHER_SENSITIVITY_OPTIONS, FLEET_REQUEST_STATUS_STYLE } from '@/lib/scopeOfWorkConstants';

function safeParse(str, fallback) {
  if (!str) return fallback;
  if (Array.isArray(str)) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export default function ScopeOfWorkSummary({ estimate }) {
  const days = safeParse(estimate?.scope_of_work_plan, []);
  const equipment = safeParse(estimate?.required_special_equipment, []);
  const fleet = safeParse(estimate?.fleet_resource_requests, []);
  const scaffoldRequired = estimate?.scaffold_plan_required;
  const scaffoldStatus = estimate?.scaffold_plan_status || 'not_required';
  const weather = WEATHER_SENSITIVITY_OPTIONS.find(w => w.value === (estimate?.weather_sensitivity || 'none'));

  if (days.length === 0 && equipment.length === 0 && fleet.length === 0 && !scaffoldRequired) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          <AlertCircle className="w-5 h-5 mx-auto mb-1" />
          No Scope of Work Plan defined yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary stats */}
      <div className="flex flex-wrap gap-3 p-3 bg-muted/50 rounded-lg">
        <Stat icon={CalendarDays} label="Days" value={days.length} />
        <Stat icon={Clock} label="Total Hours" value={`${days.reduce((s, d) => s + (d.estimated_hours || 0), 0)}h`} />
        <Stat icon={Wrench} label="Equipment" value={equipment.length} />
        <Stat icon={Truck} label="Fleet Requests" value={fleet.length} />
        <Stat icon={CloudRain} label="Weather" value={weather?.label?.split(' — ')[0] || 'None'} />
      </div>

      {/* Daily Plans */}
      {days.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CalendarDays className="w-4 h-4" /> Daily Work Plans</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {days.map((day, i) => (
              <div key={i} className="border rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="font-mono">Day {day.day_number}</Badge>
                  <div className="flex items-center gap-3">
                    <Stat icon={Clock} label="" value={`${day.estimated_hours || 0}h`} />
                    <Stat icon={Users} label="Crew" value={`${(day.lead_technicians||0)}L/${(day.apprentices||0)}A/${(day.masons||0)}M`} />
                  </div>
                </div>
                {day.required_skills?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {day.required_skills.map(s => <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>)}
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Scope:</p>
                  <p className="text-sm">{day.daily_scope || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Production Goal:</p>
                  <p className="text-sm font-medium text-accent">{day.production_goal || '—'}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Special Equipment */}
      {equipment.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Wrench className="w-4 h-4" /> Special Equipment</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-2">
            {equipment.map((item, i) => (
              <div key={i} className="border rounded-lg p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{item.item_name}</span>
                  {item._availability && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${item._availability.cls}`}>{item._availability.label}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{item.category}{item.sku ? ` · ${item.sku}` : ''}</p>
                {item.required_days?.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">Days: {item.required_days.join(', ')}</p>
                )}
                {item.critical && <Badge variant="destructive" className="text-[10px] mt-1">Critical</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Fleet Resources */}
      {fleet.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Truck className="w-4 h-4" /> Fleet Resource Requests</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {fleet.map((res, i) => (
              <div key={i} className="flex items-center justify-between border rounded-lg p-2 text-sm">
                <div>
                  <span className="font-medium">{res.vehicle_class}</span>
                  <span className="text-muted-foreground ml-2">×{res.quantity_needed}</span>
                  {res.purpose && <p className="text-xs text-muted-foreground">{res.purpose}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {res.critical && <Badge variant="destructive" className="text-[10px]">Critical</Badge>}
                  {res.required_days?.length > 0 && <span className="text-xs text-muted-foreground">Day {res.required_days.join(', ')}</span>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Scaffold + Restrictions */}
      <div className="grid sm:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4" /> Scaffold</CardTitle></CardHeader>
          <CardContent>
            <Badge className={`text-xs ${SCAFFOLD_STATUS_STYLE[scaffoldStatus] || ''}`}>
              {scaffoldRequired ? (scaffoldStatus === 'attached' ? 'Plan Attached' : 'Plan Pending') : 'Not Required'}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CloudRain className="w-4 h-4" /> Scheduling</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="text-xs"><span className="text-muted-foreground">Weather:</span> {weather?.label || 'None'}</p>
            {estimate?.customer_scheduling_restrictions && (
              <p className="text-xs"><span className="text-muted-foreground">Restrictions:</span> {estimate.customer_scheduling_restrictions}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}