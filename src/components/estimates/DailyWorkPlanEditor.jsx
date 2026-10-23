import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Clock, Users, Hammer } from 'lucide-react';
import { COMMON_SKILLS } from '@/lib/scopeOfWorkConstants';

export default function DailyWorkPlanEditor({ days, onChange }) {
  const list = days || [];

  const update = (idx, key, value) => {
    const next = [...list];
    next[idx] = { ...next[idx], [key]: value };
    onChange(next);
  };

  const addDay = () => {
    onChange([...list, {
      day_number: list.length + 1, full_day: true, estimated_hours: 8,
      lead_technicians: 1, apprentices: 0, masons: 0,
      required_skills: [], daily_scope: '', production_goal: '',
    }]);
  };

  const removeDay = (idx) => {
    const next = list.filter((_, i) => i !== idx);
    next.forEach((d, i) => { d.day_number = i + 1; });
    onChange(next);
  };

  const toggleSkill = (idx, skill) => {
    const current = list[idx]?.required_skills || [];
    update(idx, 'required_skills', current.includes(skill)
      ? current.filter(s => s !== skill)
      : [...current, skill]);
  };

  const totalHours = list.reduce((s, d) => s + (d.estimated_hours || 0), 0);
  const maxCrew = list.reduce((max, d) =>
    Math.max(max, (d.lead_technicians || 0) + (d.apprentices || 0) + (d.masons || 0)), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {totalHours}h total</span>
        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {list.length} day{list.length !== 1 ? 's' : ''}</span>
        <span className="flex items-center gap-1"><Hammer className="w-3 h-3" /> Max crew: {maxCrew}</span>
      </div>

      {list.map((day, idx) => (
        <div key={idx} className="border rounded-lg p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="font-mono">Day {day.day_number}</Badge>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeDay(idx)}>
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Full Day?</Label>
              <div className="flex items-center h-8">
                <Switch checked={day.full_day} onCheckedChange={v => update(idx, 'full_day', v)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Est. Hours</Label>
              <Input type="number" min="0" step="0.5" value={day.estimated_hours || 0}
                onChange={e => update(idx, 'estimated_hours', parseFloat(e.target.value) || 0)} className="h-8" />
            </div>
            <div>
              <Label className="text-xs">Lead Techs</Label>
              <Input type="number" min="0" value={day.lead_technicians || 0}
                onChange={e => update(idx, 'lead_technicians', parseInt(e.target.value) || 0)} className="h-8" />
            </div>
            <div>
              <Label className="text-xs">Apprentices</Label>
              <Input type="number" min="0" value={day.apprentices || 0}
                onChange={e => update(idx, 'apprentices', parseInt(e.target.value) || 0)} className="h-8" />
            </div>
            <div>
              <Label className="text-xs">Masons</Label>
              <Input type="number" min="0" value={day.masons || 0}
                onChange={e => update(idx, 'masons', parseInt(e.target.value) || 0)} className="h-8" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Required Skills</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {COMMON_SKILLS.map(skill => (
                <button key={skill} type="button" onClick={() => toggleSkill(idx, skill)}
                  className={`px-2 py-0.5 rounded-full text-[11px] transition-colors ${day.required_skills?.includes(skill) ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
                  {skill}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Daily Scope of Work</Label>
            <Textarea rows={2} value={day.daily_scope || ''}
              onChange={e => update(idx, 'daily_scope', e.target.value)}
              placeholder="What work will be completed this day?" />
          </div>
          <div>
            <Label className="text-xs">Daily Production Goal</Label>
            <Textarea rows={2} value={day.production_goal || ''}
              onChange={e => update(idx, 'production_goal', e.target.value)}
              placeholder="What should be accomplished by end of day?" />
          </div>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={addDay} className="w-full border-dashed">
        <Plus className="w-4 h-4 mr-1" /> Add Work Day
      </Button>
    </div>
  );
}