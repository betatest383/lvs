import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Settings as SettingsIcon, Save } from 'lucide-react';

const DEFAULTS = {
  engineEnabled: true,
  dryRunMode: false,
  notifyOnFailure: true,
  maxActionsPerRule: 10,
  defaultPriority: 0,
  logRetentionDays: 90,
};

export default function RuleSettings() {
  const [settings, setSettings] = useState(DEFAULTS);

  const set = (key, val) => setSettings(s => ({ ...s, [key]: val }));

  const handleSave = () => {
    toast.success('Rules Engine settings saved');
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rules Engine Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Global configuration for the Enterprise Rules Engine.</p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <p className="text-sm font-semibold flex items-center gap-1.5"><SettingsIcon className="w-4 h-4 text-accent" /> Execution</p>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Engine Enabled</Label>
              <p className="text-xs text-muted-foreground">Master switch for all automation rule execution.</p>
            </div>
            <Switch checked={settings.engineEnabled} onCheckedChange={v => set('engineEnabled', v)} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Dry Run Mode</Label>
              <p className="text-xs text-muted-foreground">Evaluate rules and log results without executing actions.</p>
            </div>
            <Switch checked={settings.dryRunMode} onCheckedChange={v => set('dryRunMode', v)} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Notify on Failure</Label>
              <p className="text-xs text-muted-foreground">Send an alert when a rule execution fails.</p>
            </div>
            <Switch checked={settings.notifyOnFailure} onCheckedChange={v => set('notifyOnFailure', v)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <p className="text-sm font-semibold">Limits & Defaults</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Max Actions per Rule</Label>
              <Input type="number" value={settings.maxActionsPerRule} onChange={e => set('maxActionsPerRule', Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Default Priority</Label>
              <Input type="number" value={settings.defaultPriority} onChange={e => set('defaultPriority', Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Log Retention (days)</Label>
              <Input type="number" value={settings.logRetentionDays} onChange={e => set('logRetentionDays', Number(e.target.value))} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} className="gap-1.5"><Save className="w-4 h-4" /> Save Settings</Button>
      </div>
    </div>
  );
}