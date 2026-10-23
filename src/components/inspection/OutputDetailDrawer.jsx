import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowRight, ArrowDown, AlertTriangle, GitBranch, Zap, ShieldAlert, FileText, Camera, Wrench, Calculator, ClipboardList, Workflow } from 'lucide-react';
import { QUESTION_PURPOSES, PURPOSE_COLOR, IMPACT_SYSTEMS } from '@/lib/inspectionMetadataConfig';
import { getImpactSystems, getDependencyChain } from '@/lib/inspectionOutputsExport';

function safeParse(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

function OutputSection({ title, icon: Icon, color, fields, entry }) {
  return (
    <div>
      <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: `hsl(var(--${color === 'red' ? 'destructive' : color}))` }}>
        <Icon className="w-3.5 h-3.5" /> {title}
      </p>
      <div className="space-y-0.5">
        {fields.map(f => {
          const val = entry[f.key];
          const display = typeof val === 'boolean' ? (val ? '✓ Yes' : '✗ No') : (val || '—');
          return (
            <div key={f.key + f.label} className="flex justify-between items-center py-0.5">
              <span className="text-xs text-muted-foreground">{f.label}</span>
              <span className={`text-xs font-medium ${val === true || (val && val !== 'hide' && val !== 'none' && val !== '') ? 'text-foreground' : 'text-muted-foreground/50'}`}>
                {display}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DependencyChain({ entry }) {
  const chain = getDependencyChain(entry);
  if (chain.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No downstream dependencies detected.</p>;
  }
  return (
    <div className="flex items-center gap-1 flex-wrap p-2 bg-muted/30 rounded-lg border border-border">
      {chain.map((step, idx) => (
        <div key={idx} className="flex items-center gap-1">
          <span className="px-2 py-1 rounded-md text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
            {step}
          </span>
          {idx < chain.length - 1 && (
            <>
              <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0 hidden sm:block" />
              <ArrowDown className="w-3 h-3 text-muted-foreground flex-shrink-0 sm:hidden" />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function ImpactAnalysis({ entry }) {
  const impacted = getImpactSystems(entry);
  const notImpacted = IMPACT_SYSTEMS.filter(s => !impacted.includes(s.label));

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        If this question is changed, these systems may be affected:
      </p>
      <div className="flex flex-wrap gap-1">
        {impacted.length > 0 ? impacted.map(sys => (
          <Badge key={sys} className="text-[10px] bg-orange-100 text-orange-700 gap-1">
            <Zap className="w-2.5 h-2.5" /> {sys}
          </Badge>
        )) : (
          <span className="text-xs text-muted-foreground italic">No downstream systems affected.</span>
        )}
      </div>
      {notImpacted.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground/60 mt-1.5">Not affected:</p>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {notImpacted.map(sys => (
              <Badge key={sys} variant="outline" className="text-[9px] opacity-40">{sys}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OutputDetailDrawer({ entry, open, onOpenChange }) {
  const [showImpact, setShowImpact] = useState(false);

  if (!entry) return null;

  const purposes = safeParse(entry.question_purpose, []);
  const purposeList = Array.isArray(purposes) ? purposes : [];
  const flags = safeParse(entry.validation_flags, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-primary" />
            {entry.question_text}
          </DialogTitle>
        </DialogHeader>

        {/* Metadata badges */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <Badge variant="secondary" className="text-[10px]">{entry.section}</Badge>
          <Badge variant="outline" className="text-[10px]">{entry.subsection}</Badge>
          {entry.question_category && (
            <Badge className="text-[10px] bg-stone-100 text-stone-700">{entry.question_category}</Badge>
          )}
          {entry.question_role && (
            <Badge className="text-[10px] bg-blue-100 text-blue-700 capitalize">
              {entry.question_role?.replace(/_/g, ' ')}
              {entry.role_inferred && ' (inferred)'}
            </Badge>
          )}
          {purposeList.map(p => (
            <Badge key={p} className={`text-[10px] ${PURPOSE_COLOR[p] || 'bg-gray-100 text-gray-600'}`}>
              {QUESTION_PURPOSES[p]?.label || p}
            </Badge>
          ))}
          {entry.needs_review && (
            <Badge className="text-[10px] bg-amber-100 text-amber-700 gap-1">
              <AlertTriangle className="w-2.5 h-2.5" /> Needs Review
            </Badge>
          )}
          {entry.is_active ? (
            <Badge className="text-[10px] bg-green-100 text-green-700">Active</Badge>
          ) : (
            <Badge className="text-[10px] bg-red-100 text-red-700">Inactive</Badge>
          )}
        </div>

        {/* Purpose & Category */}
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <p className="text-xs font-semibold mb-1">Question Purpose</p>
            {purposeList.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {purposeList.map(p => (
                  <Badge key={p} className={`text-[10px] ${PURPOSE_COLOR[p] || 'bg-gray-100 text-gray-600'}`}>
                    {QUESTION_PURPOSES[p]?.label || p}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No purposes assigned</p>
            )}
            {entry.purpose_inferred && (
              <p className="text-[10px] text-muted-foreground mt-1">Auto-inferred by build engine</p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold mb-1">Question Category</p>
            <Badge className="text-[10px] bg-stone-100 text-stone-700">{entry.question_category || 'Uncategorized'}</Badge>
            {entry.category_inferred && (
              <p className="text-[10px] text-muted-foreground mt-1">Auto-inferred by build engine</p>
            )}
          </div>
        </div>

        {/* Validation warnings */}
        {flags.length > 0 && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 mb-3">
            <p className="text-xs font-semibold text-red-800 mb-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Validation Warnings
            </p>
            <ul className="space-y-0.5">
              {flags.map((f, i) => (
                <li key={i} className="text-xs text-red-700">• {f}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Dependency Chain */}
        <div className="mb-3">
          <p className="text-xs font-semibold mb-1.5 flex items-center gap-1">
            <GitBranch className="w-3.5 h-3.5 text-primary" /> Dependency Chain
          </p>
          <DependencyChain entry={entry} />
        </div>

        {/* Impact Analysis */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-orange-500" /> Impact Analysis
            </p>
            <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => setShowImpact(!showImpact)}>
              {showImpact ? 'Hide' : 'Analyze Impact'}
            </Button>
          </div>
          {showImpact && <ImpactAnalysis entry={entry} />}
        </div>

        <Separator className="my-2" />

        {/* Output Mappings */}
        <div className="grid grid-cols-2 gap-4">
          <OutputSection title="PDF / Reports" icon={FileText} color="blue"
            fields={[
              { key: 'customer_pdf', label: 'Customer PDF' },
              { key: 'internal_notes', label: 'Internal Report' },
              { key: 'inspection_summary', label: 'Inspection Summary' },
              { key: 'customer_summary', label: 'Customer Summary' },
            ]}
            entry={entry} />

          <OutputSection title="Photos / Gallery" icon={Camera} color="purple"
            fields={[
              { key: 'photo_required', label: 'Photo Required' },
              { key: 'photo_customer_pdf', label: 'Customer PDF Photo' },
              { key: 'produces_gallery', label: 'Gallery' },
              { key: 'photo_internal_only', label: 'Internal Only' },
              { key: 'customer_facing', label: 'Customer Presentation' },
            ]}
            entry={entry} />

          <OutputSection title="NFPA / Code" icon={ShieldAlert} color="red"
            fields={[
              { key: 'nfpa_211_question', label: 'NFPA 211 Required' },
              { key: 'pass_fail', label: 'Code Failure Trigger' },
              { key: 'safety_concern', label: 'Safety Concern Trigger' },
              { key: 'critical_failure', label: 'Critical Failure Trigger' },
              { key: 'inspection_level', label: 'Inspection Level' },
            ]}
            entry={entry} />

          <OutputSection title="Repair Engine" icon={Wrench} color="purple"
            fields={[
              { key: 'produces_findings', label: 'Creates Finding' },
              { key: 'repair_system', label: 'Repair System' },
              { key: 'recommendation_trigger', label: 'Recommendation Trigger' },
              { key: 'confidence_contribution', label: 'Confidence Contribution' },
              { key: 'good_better_best', label: 'Good / Better / Best' },
            ]}
            entry={entry} />

          <OutputSection title="Material Engine" icon={Calculator} color="amber"
            fields={[
              { key: 'feeds_material_calculator', label: 'Feeds Material Calculator' },
              { key: 'calculation_input_field', label: 'Measurement Inputs' },
              { key: 'calculation_formula', label: 'Formula' },
              { key: 'calculation_output_field', label: 'Output Material' },
            ]}
            entry={entry} />

          <OutputSection title="Estimate Engine" icon={ClipboardList} color="orange"
            fields={[
              { key: 'creates_recommendation', label: 'Creates Estimate Rec' },
              { key: 'pricebook_mapping', label: 'Suggested Pricebook' },
              { key: 'creates_option_group', label: 'Option Group' },
              { key: 'customer_facing', label: 'Customer-Facing Text' },
              { key: 'estimate_internal_only', label: 'Internal-Only Text' },
            ]}
            entry={entry} />

          <OutputSection title="Workflow" icon={Workflow} color="indigo"
            fields={[
              { key: 'workflow_job_hub', label: 'Job Hub' },
              { key: 'workflow_timeline', label: 'Timeline' },
              { key: 'workflow_scope_of_work', label: 'Scope of Work' },
              { key: 'workflow_scheduling', label: 'Scheduling' },
              { key: 'workflow_warehouse', label: 'Warehouse' },
              { key: 'workflow_fleet', label: 'Fleet' },
              { key: 'workflow_inspection', label: 'Morning Workflow' },
              { key: 'workflow_analytics', label: 'Analytics' },
            ]}
            entry={entry} />
        </div>
      </DialogContent>
    </Dialog>
  );
}