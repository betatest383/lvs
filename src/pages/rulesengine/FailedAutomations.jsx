import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, PauseCircle, ArrowRight } from 'lucide-react';

export default function FailedAutomations() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.LogicRule.filter({ rule_type: 'automation' }, '-updated_date', 500)
      .then(setRules)
      .finally(() => setLoading(false));
  }, []);

  const inactive = rules.filter(r => r.is_active === false);
  const missingActions = rules.filter(r => {
    let acts = [];
    try { acts = JSON.parse(r.actions_json || '[]'); } catch {}
    return acts.length === 0;
  });
  const incomplete = rules.filter(r => !r.source_module || !r.trigger_event);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Failed Automations</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Rules that are disabled, incomplete, or missing configuration — surfaced for attention.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><PauseCircle className="w-4 h-4 text-amber-600" /><span className="text-xs text-muted-foreground">Inactive</span></div><p className="text-2xl font-bold">{inactive.length}</p></CardContent></Card>
            <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4 text-orange-600" /><span className="text-xs text-muted-foreground">No Actions</span></div><p className="text-2xl font-bold">{missingActions.length}</p></CardContent></Card>
            <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4 text-red-600" /><span className="text-xs text-muted-foreground">Incomplete</span></div><p className="text-2xl font-bold">{incomplete.length}</p></CardContent></Card>
          </div>

          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-semibold">Rules Needing Attention</p>
              {(inactive.length + missingActions.length + incomplete.length) === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">All automation rules are active and fully configured.</p>
              ) : (
                [...inactive, ...missingActions.filter(r => r.is_active !== false), ...incomplete.filter(r => r.is_active !== false)].map(r => {
                  let acts = 0;
                  try { acts = JSON.parse(r.actions_json || '[]').length; } catch {}
                  return (
                    <Link key={r.id} to="/rules-engine/registry" className="flex items-center justify-between border-b last:border-0 py-2 hover:bg-muted/30 -mx-2 px-2 rounded">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{r.rule_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{r.source_module_name || 'No module'} → {r.trigger_event_name || 'No event'}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {r.is_active === false && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Inactive</span>}
                        {acts === 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">No Actions</span>}
                        {(!r.source_module || !r.trigger_event) && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Incomplete</span>}
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    </Link>
                  );
                })
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}