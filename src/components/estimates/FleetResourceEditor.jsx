import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Truck } from 'lucide-react';
import { VEHICLE_CLASSES, FLEET_PURPOSES } from '@/lib/scopeOfWorkConstants';

export default function FleetResourceEditor({ resources, onChange, totalDays }) {
  const list = resources || [];
  const dayCount = totalDays || 1;

  const addResource = () => {
    onChange([...list, {
      vehicle_class: '', quantity_needed: 1, required_days: [],
      critical: false, purpose: '', notes: '',
    }]);
  };

  const update = (idx, key, value) => {
    const next = [...list]; next[idx] = { ...next[idx], [key]: value }; onChange(next);
  };

  const remove = (idx) => onChange(list.filter((_, i) => i !== idx));

  const toggleDay = (idx, day) => {
    const current = list[idx]?.required_days || [];
    update(idx, 'required_days', current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day].sort((a, b) => a - b));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
        <Truck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <p>Estimator selects <strong>vehicle classes</strong> only. Fleet Manager assigns actual trucks/trailers.</p>
      </div>

      {list.map((res, idx) => (
        <div key={idx} className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <Select value={res.vehicle_class || ''} onValueChange={v => update(idx, 'vehicle_class', v)}>
              <SelectTrigger className="h-8 text-sm font-medium w-auto min-w-[160px]">
                <SelectValue placeholder="Select vehicle class" />
              </SelectTrigger>
              <SelectContent>
                {VEHICLE_CLASSES.map(vc => <SelectItem key={vc} value={vc}>{vc}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(idx)}>
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Quantity Needed</Label>
              <Input type="number" min="1" value={res.quantity_needed || 1}
                onChange={e => update(idx, 'quantity_needed', parseInt(e.target.value) || 1)} className="h-8" />
            </div>
            <div>
              <Label className="text-xs">Purpose</Label>
              <Select value={res.purpose || ''} onValueChange={v => update(idx, 'purpose', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select purpose" /></SelectTrigger>
                <SelectContent>
                  {FLEET_PURPOSES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Required Days:</span>
            {Array.from({ length: dayCount }, (_, i) => i + 1).map(day => (
              <button key={day} type="button" onClick={() => toggleDay(idx, day)}
                className={`w-6 h-6 rounded-full text-[10px] font-medium transition-colors ${res.required_days?.includes(day) ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
                {day}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={res.critical || false} onCheckedChange={v => update(idx, 'critical', v)} />
            <Label className="text-xs">Critical for Work</Label>
          </div>

          <Textarea rows={1} value={res.notes || ''} onChange={e => update(idx, 'notes', e.target.value)}
            placeholder="Notes (e.g. needs lift gate, specific capacity)..." className="text-xs" />
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={addResource} className="w-full border-dashed">
        <Plus className="w-4 h-4 mr-1" /> Add Fleet Resource
      </Button>
    </div>
  );
}