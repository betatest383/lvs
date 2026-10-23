import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  GitBranch, AlertTriangle, ArrowRight, ExternalLink, Loader2,
  HelpCircle, FileText, Wrench, Package, ClipboardList, Presentation,
  Boxes, Warehouse, Truck, CalendarClock, BarChart3, Layers, Cpu
} from 'lucide-react';
import { resolveRuleDependencies } from '@/lib/ruleDependencyResolver';

const LAYER_ICONS = {
  questions: HelpCircle,
  findings: AlertTriangle,
  templates: FileText,
  services: Wrench,
  materials: Package,
  scopes: ClipboardList,
  proposals: Presentation,
  inventory: Boxes,
  warehouse: Warehouse,
  fleet: Truck,
  scheduling: CalendarClock,
  presentation: Presentation,
  analytics: BarChart3,
  ai_coaching: Cpu,
};

export default function RuleDependencyViewer() {
  const params = useParams();
  const preselectedRuleId = params.ruleId || '';
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRuleId, setSelectedRuleId] = useState(preselectedRuleId || '');
  const [dependencyTree, setDependencyTree] = useState(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    base44.entities.LogicRule.filter({ rule_type: 'automation' }, '-priority', 500)
      .then(setRules)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (preselectedRuleId) setSelectedRuleId(preselectedRuleId);
  }, [preselectedRuleId]);

  const selectedRule = useMemo(
    () => rules.find(r => r.id === selectedRuleId),
    [rules, selectedRuleId]
  );

  useEffect(() => {
    if (!selectedRule) {
      setDependencyTree(null);
      return;
    }
    setResolving(true);
    resolveRuleDependencies(selectedRule)
      .then(setDependencyTree)
      .finally(() => setResolving(false));
  }, [selectedRule]);

  const impactItems = dependencyTree ? [
    { label: 'Inspection Questions', value: dependencyTree.impact.questions, color: 'text-blue-600' },
    { label: 'Recommendation Templates', value: dependencyTree.impact.templates, color: 'text-purple-600' },
    { label: 'Services', value: dependencyTree.impact.services, color: 'text-amber-600' },
    { label: 'Materials', value: dependencyTree.impact.materials, color: 'text-pink-600' },
    { label: 'Proposal Packages', value: dependencyTree.impact.proposals, color: 'text-indigo-600' },
    { label: 'Scope of Work', value: dependencyTree.impact.scopes, color: 'text-cyan-600' },
    { label: 'Active Rules', value: dependencyTree.impact.active_rules, color: 'text-accent' },
    { label: 'Historical Jobs', value: dependencyTree.impact.historical_jobs, color: 'text-emerald-600' },
  ] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <GitBranch className="w-6 h-6 text-accent" /> Rule Dependency Viewer
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Understand everything affected by a rule before making changes.
        </p>
      </div>

      {/* Rule Selector */}
      <Card>
        <CardContent className="p-4">
          <Select value={selectedRuleId} onValueChange={setSelectedRuleId}>
            <SelectTrigger><SelectValue placeholder="Select a rule to analyze..." /></SelectTrigger>
            <SelectContent>
              {rules.map(r => (
                <SelectItem key={r.id} value={r.id}>{r.rule_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {resolving && (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Resolving dependencies...</span>
        </div>
      )}

      {dependencyTree && !resolving && (
        <>
          {/* Impact Analysis */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Impact Analysis</p>
                <Badge variant="outline" className="text-xs">This rule currently affects</Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {impactItems.map(item => (
                  <div key={item.label} className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Conflicts */}
          {dependencyTree.conflicts.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" /> Conflicting Rules
                </p>
                <p className="text-xs text-muted-foreground">These rules share the same trigger event and may conflict.</p>
                {dependencyTree.conflicts.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-xs border-b last:border-0 py-1.5">
                    <span className="font-medium">{c.name}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">Priority {c.priority}</Badge>
                      <Badge variant="outline" className="text-xs text-amber-700">{c.conflict_type}</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Run History */}
          {dependencyTree.run_history && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-semibold">Run History</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-2 bg-muted/50 rounded text-center">
                    <p className="text-lg font-bold">{dependencyTree.run_history.total_runs}</p>
                    <p className="text-xs text-muted-foreground">Total Runs</p>
                  </div>
                  <div className="p-2 bg-green-50 rounded text-center">
                    <p className="text-lg font-bold text-green-600">{dependencyTree.run_history.successful}</p>
                    <p className="text-xs text-muted-foreground">Successful</p>
                  </div>
                  <div className="p-2 bg-red-50 rounded text-center">
                    <p className="text-lg font-bold text-red-600">{dependencyTree.run_history.failed}</p>
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                  <div className="p-2 bg-muted/50 rounded text-center">
                    <p className="text-lg font-bold">{dependencyTree.run_history.avg_duration}ms</p>
                    <p className="text-xs text-muted-foreground">Avg Duration</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Dependency Graph */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-semibold">Dependency Graph</p>
              <p className="text-xs text-muted-foreground">Click any node to view details. Each layer shows entities connected to this rule.</p>

              <div className="space-y-0">
                {/* Rule Node */}
                <div className="flex items-center gap-3 p-3 bg-accent/10 border border-accent/30 rounded-lg">
                  <Layers className="w-5 h-5 text-accent" />
                  <div className="flex-1">
                    <p className="text-sm font-bold">{selectedRule.rule_name}</p>
                    <p className="text-xs text-muted-foreground">{selectedRule.source_module_name} → {selectedRule.trigger_event_name}</p>
                  </div>
                  <Badge className="text-xs">Rule</Badge>
                </div>

                {/* Dependency Layers */}
                {dependencyTree.layers.map((layer, i) => {
                  const Icon = LAYER_ICONS[layer.key] || Package;
                  return (
                    <div key={layer.key}>
                      <div className="flex justify-center py-1">
                        <ArrowRight className="w-4 h-4 text-muted-foreground rotate-90" />
                      </div>
                      <div className="p-3 bg-muted/30 border rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <Icon className="w-4 h-4 text-muted-foreground" />
                            {layer.label}
                          </span>
                          <Badge variant="outline" className="text-xs">{layer.total} total</Badge>
                        </div>
                        {layer.items.length > 0 ? (
                          <div className="space-y-1">
                            {layer.items.map(item => (
                              <div key={item.id} className="flex items-center justify-between text-xs bg-card border rounded px-2 py-1.5">
                                <span className="truncate">{item.name}</span>
                                <span className="text-muted-foreground text-[10px] shrink-0 ml-2">{item.type}</span>
                              </div>
                            ))}
                            {layer.total > layer.items.length && (
                              <p className="text-xs text-muted-foreground text-center">+ {layer.total - layer.items.length} more...</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">No items found</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!selectedRule && !loading && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <GitBranch className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Select a rule above to view its full dependency tree.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}