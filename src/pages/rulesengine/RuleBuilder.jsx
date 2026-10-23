import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EventRuleDialog from '@/components/admin/EventRuleDialog';
import { Card, CardContent } from '@/components/ui/card';
import { Wand2, Database, Zap, Filter, ArrowRight, Boxes } from 'lucide-react';
import { MODULES_BY_CATEGORY } from '@/lib/moduleEventRegistry';
import { ACTION_CATEGORIES } from '@/lib/enterpriseActionRegistry';

const STEPS = [
  { n: 1, icon: Database, title: 'Source Module', desc: 'Choose the LVC OS module that publishes the trigger event.' },
  { n: 2, icon: Zap, title: 'Trigger Event', desc: 'Select the specific event that should start this automation.' },
  { n: 3, icon: Filter, title: 'Conditions', desc: 'Add field-based conditions that must all be true for the rule to fire.' },
  { n: 4, icon: Boxes, title: 'Action Mapping', desc: 'Configure actions (Tasks, Notifications, Records, Workflows, etc.) with dynamic field mapping.' },
  { n: 5, icon: Wand2, title: 'Save & Activate', desc: 'Persist the rule and enable it for live execution.' },
];

export default function RuleBuilder() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rule Builder</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Create event-driven automation rules in 5 guided steps.</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition-colors"
        >
          <Wand2 className="w-4 h-4" /> Create New Rule
        </button>
      </div>

      <div className="grid md:grid-cols-5 gap-3">
        {STEPS.map(s => (
          <Card key={s.n}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
                  <s.icon className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-muted-foreground">STEP {s.n}</span>
              </div>
              <p className="text-sm font-semibold">{s.title}</p>
              <p className="text-xs text-muted-foreground">{s.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-1.5"><Database className="w-4 h-4 text-accent" /> Available Source Modules</p>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {MODULES_BY_CATEGORY.map(cat => (
                <div key={cat.key} className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{cat.label}</p>
                  <div className="flex flex-wrap gap-1">
                    {cat.modules.map(m => (
                      <span key={m.moduleKey} className={`text-xs px-2 py-0.5 rounded-full ${m.color?.split(' ')[0] || 'bg-muted'} bg-opacity-100 ${m.reserved ? 'opacity-40 italic' : ''}`}>
                        {m.module}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-1.5"><Boxes className="w-4 h-4 text-accent" /> Action Categories</p>
            <div className="space-y-1.5">
              {ACTION_CATEGORIES.map(c => (
                <div key={c.categoryKey} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${c.color.split(' ')[0]}`} />
                    {c.category}
                  </span>
                  <span className="text-xs text-muted-foreground">{c.actions.length} actions</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <EventRuleDialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) navigate('/rules-engine/registry'); }}
        editing={null}
        repairs={[]}
        onSave={() => navigate('/rules-engine/registry')}
      />
    </div>
  );
}