import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { GitBranch, ArrowRight, AlertTriangle } from 'lucide-react';
import VisibilityRuleBuilder from './VisibilityRuleBuilder';

export default function TabLogic({ form, set, questions, editing, linkedRules, allQuestions }) {
  const hasVisibility = !!form.visibility_rule;

  return (
    <div className="space-y-4">
      {/* Conditional Logic Builder */}
      <div>
        <Label className="flex items-center gap-1.5"><GitBranch className="w-4 h-4" /> Show When (Conditional Visibility)</Label>
        <div className="mt-2">
          <VisibilityRuleBuilder
            key={editing?.id || 'new'}
            value={form.visibility_rule || ''}
            onChange={v => set('visibility_rule', v)}
            questions={questions}
            currentId={editing?.id}
          />
        </div>
      </div>

      {/* Logic Triggers */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
          <div>
            <p className="text-sm font-medium">NFPA Trigger</p>
            <p className="text-xs text-muted-foreground">Marks as NFPA 211 code question</p>
          </div>
          <Switch checked={!!form.nfpa_trigger} onCheckedChange={v => set('nfpa_trigger', v)} />
        </div>
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
          <div>
            <p className="text-sm font-medium">Safety Trigger</p>
            <p className="text-xs text-muted-foreground">Marks as safety concern</p>
          </div>
          <Switch checked={!!form.safety_trigger} onCheckedChange={v => set('safety_trigger', v)} />
        </div>
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
          <div>
            <p className="text-sm font-medium">Critical Failure</p>
            <p className="text-xs text-muted-foreground">Failing answer → critical severity</p>
          </div>
          <Switch checked={!!form.critical_failure} onCheckedChange={v => set('critical_failure', v)} />
        </div>
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
          <div>
            <p className="text-sm font-medium">Creates Finding</p>
            <p className="text-xs text-muted-foreground">Triggers a finding record</p>
          </div>
          <Switch checked={!!form.creates_finding} onCheckedChange={v => set('creates_finding', v)} />
        </div>
      </div>

      <div>
        <Label>Derived Result Produced</Label>
        <Input value={form.derived_result_produced || ''} onChange={e => set('derived_result_produced', e.target.value)}
          placeholder="e.g. Clearance complies with NFPA 211" />
      </div>

      {/* Linked Logic Rules (read-only) */}
      <div>
        <Label>Linked Logic Rules</Label>
        {linkedRules.length === 0 ? (
          <div className="mt-1 p-3 bg-muted/30 rounded-lg border text-sm text-muted-foreground">
            No logic rules reference this question.
          </div>
        ) : (
          <div className="mt-1 space-y-1.5">
            {linkedRules.map(rule => (
              <div key={rule.id} className="flex items-center gap-2 p-2.5 bg-muted/30 rounded-lg border">
                <Badge variant="outline" className="text-[10px] capitalize">{rule.rule_type}</Badge>
                <span className="text-sm font-medium flex-1 truncate">{rule.rule_name}</span>
                {rule.output_finding_type && <Badge className="text-[10px] bg-purple-100 text-purple-700">{rule.output_finding_type}</Badge>}
                {rule.output_severity && <Badge className="text-[10px] bg-amber-100 text-amber-700 capitalize">{rule.output_severity}</Badge>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dependency Chain */}
      {linkedRules.length > 0 && (
        <div>
          <Label>Dependency Chain</Label>
          <div className="mt-2 p-3 bg-muted/30 rounded-lg border space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary" className="text-[10px]">Question</Badge>
              <span className="font-medium truncate flex-1">{form.question_text}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground pl-2">
              <ArrowRight className="w-3 h-3" />
              <span>Logic Rule{linkedRules.length > 1 ? `s (${linkedRules.length})` : ''}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground pl-6">
              <ArrowRight className="w-3 h-3" />
              <span>Finding → Repair System → Estimate</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}