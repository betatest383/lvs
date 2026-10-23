import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings, Shield, Users, Building2, Clock } from 'lucide-react';
import { TASK_TYPES, TASK_STATUSES, TASK_PRIORITIES, DEPARTMENTS, SOURCE_MODULES } from '@/lib/enterpriseTaskConstants';

export default function TaskSettings() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Task Settings</h1>
        <p className="text-muted-foreground text-sm">Configuration and reference for the Enterprise Task Center.</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Settings className="w-4 h-4 text-accent" /> Task Types ({TASK_TYPES.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {TASK_TYPES.map(t => <span key={t} className="px-2 py-0.5 rounded-full bg-muted text-xs">{t}</span>)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-accent" /> Statuses ({TASK_STATUSES.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {TASK_STATUSES.map(s => <span key={s} className="px-2 py-0.5 rounded-full bg-muted text-xs">{s}</span>)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4 text-accent" /> Priorities ({TASK_PRIORITIES.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {TASK_PRIORITIES.map(p => <span key={p} className="px-2 py-0.5 rounded-full bg-muted text-xs">{p}</span>)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Building2 className="w-4 h-4 text-accent" /> Departments ({DEPARTMENTS.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {DEPARTMENTS.map(d => <span key={d} className="px-2 py-0.5 rounded-full bg-muted text-xs">{d}</span>)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4 text-accent" /> Source Modules ({SOURCE_MODULES.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {SOURCE_MODULES.map(s => <span key={s} className="px-2 py-0.5 rounded-full bg-muted text-xs">{s}</span>)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4 text-accent" /> Permissions</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">• Employees can view and update their own tasks.</p>
            <p className="text-muted-foreground">• Managers can view and assign tasks in their department.</p>
            <p className="text-muted-foreground">• Operations Manager, Director, Admin, and Owner can view all tasks.</p>
            <p className="text-muted-foreground">• Only authorized roles can approve approval-required tasks.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}