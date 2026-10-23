import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileSearch, Link2, Tag, AlertTriangle, FileText, Calculator } from 'lucide-react';

/**
 * Displays the enriched simulated "Create Deficiency Finding" action result,
 * showing the repair template linkage and inherited deficiency configuration.
 */
export default function SimulatedFindingDetail({ actions }) {
  const findingAction = actions?.find(
    a => a.action_key === 'inspection.create_finding' && a.status === 'success'
  );
  if (!findingAction) return null;

  const r = findingAction.simulated_result || {};
  const fields = r.fields || {};
  const detail = (label, value, icon) => (
    <div className="flex items-start gap-2 py-1.5 border-b last:border-0">
      {icon && <icon.type className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${icon.color}`} />}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xs font-medium break-words">{value || <span className="text-muted-foreground italic">—</span>}</p>
      </div>
    </div>
  );

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <FileSearch className="w-4 h-4 text-accent" /> Simulated Finding Output
          </p>
          <Badge variant="outline" className="text-xs">{findingAction.label}</Badge>
        </div>

        {/* Core fields */}
        <div className="rounded-lg border divide-y">
          {detail('Job ID', fields.job_id || r.job_id, { type: 'svg', color: 'text-blue-500' })}
          {detail('Inspection Question ID', r.inspection_question_id, { type: 'svg', color: 'text-purple-500' })}
          {detail('Answer Value', r.answer_value, { type: 'svg', color: 'text-amber-500' })}
        </div>

        {/* Repair template linkage */}
        <div className="rounded-lg border divide-y bg-blue-50/30">
          {detail('Repair Template ID', r.repair_template_id, { type: Link2, color: 'text-blue-600' })}
          {detail('Repair Template Name', r.repair_template_name, { type: Tag, color: 'text-blue-600' })}
        </div>

        {/* Inherited deficiency configuration */}
        <div className="rounded-lg border divide-y bg-amber-50/30">
          <p className="text-xs font-semibold text-amber-700 px-3 pt-2">Inherited from Repair Template</p>
          {detail('Deficiency Type', r.inherited_deficiency_type, { type: AlertTriangle, color: 'text-amber-600' })}
          {detail('Severity', r.inherited_severity, { type: AlertTriangle, color: 'text-amber-600' })}
          {detail('Finding Narrative', r.inherited_finding_narrative, { type: FileText, color: 'text-amber-600' })}
        </div>

        {/* Material resolver (only when configured) */}
        {r.material_resolver_type && (
          <div className="rounded-lg border divide-y bg-green-50/30">
            <p className="text-xs font-semibold text-green-700 px-3 pt-2">Material Resolver</p>
            {detail('Calculation Type', r.material_resolver_type, { type: Calculator, color: 'text-green-600' })}
          </div>
        )}

        {!r.repair_template_id && (
          <p className="text-xs text-amber-600 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            No repair template linked — finding will use rule-level output fields only.
          </p>
        )}
      </CardContent>
    </Card>
  );
}