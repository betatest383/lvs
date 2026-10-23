import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

function safeParse(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

function FlagRow({ label, value }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {typeof value === 'boolean' ? (
        <Badge variant={value ? 'default' : 'secondary'} className="text-[10px]">{value ? 'Yes' : 'No'}</Badge>
      ) : (
        <span className="text-xs font-medium text-right">{value || '—'}</span>
      )}
    </div>
  );
}

function FlagGroup({ title, children }) {
  return (
    <div>
      <p className="text-xs font-semibold mb-1 text-foreground">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export default function MatrixEntryDetail({ entry, open, onOpenChange }) {
  if (!entry) return null;

  const flags = safeParse(entry.validation_flags, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{entry.question_text}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5 mb-3">
          <Badge variant="secondary" className="text-[10px]">{entry.section}</Badge>
          <Badge variant="outline" className="text-[10px]">{entry.subsection}</Badge>
          {entry.question_role && (
            <Badge className="text-[10px] bg-blue-100 text-blue-700 capitalize">
              {entry.question_role?.replace(/_/g, ' ')}
              {entry.role_inferred && ' (inferred)'}
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] capitalize">{entry.question_type?.replace(/_/g, ' ')}</Badge>
          {entry.is_active ? (
            <Badge className="text-[10px] bg-green-100 text-green-700">Active</Badge>
          ) : (
            <Badge className="text-[10px] bg-red-100 text-red-700">Inactive</Badge>
          )}
          {entry.nfpa_211_question && <Badge className="text-[10px] bg-blue-100 text-blue-700">NFPA 211</Badge>}
          {entry.safety_concern && <Badge className="text-[10px] bg-red-100 text-red-700">Safety</Badge>}
          {entry.conditional_logic && <Badge className="text-[10px] bg-amber-100 text-amber-700">Conditional</Badge>}
        </div>

        {/* Validation Flags */}
        {flags.length > 0 && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 mb-3">
            <p className="text-xs font-semibold text-red-800 mb-1">Validation Issues</p>
            <ul className="space-y-0.5">
              {flags.map((f, i) => (
                <li key={i} className="text-xs text-red-700">• {f}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <FlagGroup title="Question Info">
            <FlagRow label="Question Role" value={entry.question_role?.replace(/_/g, ' ')} />
            <FlagRow label="Role Inferred" value={entry.role_inferred} />
            <FlagRow label="Logic Source" value={entry.logic_source} />
            <FlagRow label="Display Order" value={entry.display_order} />
            <FlagRow label="Inspection Type" value={entry.inspection_type} />
            <FlagRow label="Required" value={entry.required} />
            <FlagRow label="Required Conditionally" value={entry.required_conditionally} />
            <FlagRow label="Answer Options" value={entry.answer_options} />
            <FlagRow label="Help Text" value={entry.help_text} />
          </FlagGroup>

          <FlagGroup title="Conditional Logic">
            <FlagRow label="Has Conditional Logic" value={entry.conditional_logic} />
            <div className="py-1">
              <span className="text-xs text-muted-foreground">Shows When:</span>
              <p className="text-xs font-medium mt-0.5">{entry.shows_when || 'Always visible'}</p>
            </div>
            <div className="py-1">
              <span className="text-xs text-muted-foreground">Hidden When:</span>
              <p className="text-xs font-medium mt-0.5">{entry.hidden_when || '—'}</p>
            </div>
          </FlagGroup>

          <FlagGroup title="Photos">
            <FlagRow label="Photo Required" value={entry.photo_required} />
            <FlagRow label="Photo Optional" value={entry.photo_optional} />
            <FlagRow label="Photo Category" value={entry.photo_category} />
            <FlagRow label="Photo → Customer PDF" value={entry.photo_customer_pdf} />
            <FlagRow label="Photo → Internal Report" value={entry.photo_internal_report} />
            <FlagRow label="Photo → Estimate" value={entry.photo_estimate} />
            <FlagRow label="Photo → Repair System" value={entry.photo_repair_system} />
            <FlagRow label="Photo → Timeline" value={entry.photo_timeline} />
            <FlagRow label="Photo → Internal Only" value={entry.photo_internal_only} />
          </FlagGroup>

          <FlagGroup title="Measurements">
            <FlagRow label="Measurement Required" value={entry.measurement_required} />
            <FlagRow label="Measurement Units" value={entry.measurement_units} />
            <FlagRow label="→ Material Calculations" value={entry.measurement_material_calc} />
            <FlagRow label="→ Estimate Quantities" value={entry.measurement_estimate_qty} />
            <FlagRow label="→ PDF Report" value={entry.measurement_pdf_report} />
            <FlagRow label="→ Repair System" value={entry.measurement_repair_system} />
          </FlagGroup>

          <FlagGroup title="NFPA / Code">
            <FlagRow label="NFPA 211 Question" value={entry.nfpa_211_question} />
            <FlagRow label="Code Reference" value={entry.code_reference} />
            <FlagRow label="Pass/Fail" value={entry.pass_fail} />
            <FlagRow label="Safety Concern" value={entry.safety_concern} />
            <FlagRow label="Critical Failure" value={entry.critical_failure} />
            <FlagRow label="Inspection Level" value={entry.inspection_level} />
          </FlagGroup>

          <FlagGroup title="Repair Engine">
            <FlagRow label="Repair System" value={entry.repair_system} />
            <FlagRow label="Finding Type" value={entry.finding_type} />
            <FlagRow label="Severity" value={entry.severity} />
            <FlagRow label="Recommendation Trigger" value={entry.recommendation_trigger} />
            <FlagRow label="Grouped Into" value={entry.grouped_into} />
            <FlagRow label="Estimate Recommendation" value={entry.estimate_recommendation} />
            <FlagRow label="Pricebook Mapping" value={entry.pricebook_mapping} />
            <FlagRow label="Good/Better/Best" value={entry.good_better_best} />
            <FlagRow label="Confidence Contribution" value={entry.confidence_contribution} />
          </FlagGroup>

          <FlagGroup title="Material Calculations">
            <FlagRow label="Feeds Material Calculator" value={entry.feeds_material_calculator} />
            <FlagRow label="Calculation Type" value={entry.calculation_type} />
            <FlagRow label="Input Field" value={entry.calculation_input_field} />
            <FlagRow label="Output Field" value={entry.calculation_output_field} />
            <FlagRow label="Formula" value={entry.calculation_formula} />
          </FlagGroup>

          <FlagGroup title="Estimate Engine">
            <FlagRow label="Creates Recommendation" value={entry.creates_recommendation} />
            <FlagRow label="Adds Estimate Item" value={entry.adds_estimate_item} />
            <FlagRow label="Suggests Upgrade" value={entry.suggests_upgrade} />
            <FlagRow label="Creates Option Group" value={entry.creates_option_group} />
            <FlagRow label="Customer Facing" value={entry.customer_facing} />
            <FlagRow label="Internal Only" value={entry.estimate_internal_only} />
          </FlagGroup>

          <FlagGroup title="Inspection Outputs">
            <FlagRow label="Customer PDF" value={entry.customer_pdf} />
            <FlagRow label="Customer Summary" value={entry.customer_summary} />
            <FlagRow label="Internal Notes" value={entry.internal_notes} />
            <FlagRow label="Inspection Summary" value={entry.inspection_summary} />
            <FlagRow label="Timeline" value={entry.timeline} />
            <FlagRow label="Job Hub" value={entry.job_hub} />
            <FlagRow label="Dashboard" value={entry.dashboard} />
          </FlagGroup>

          <FlagGroup title="Workflows">
            <FlagRow label="Inspection" value={entry.workflow_inspection} />
            <FlagRow label="PDF" value={entry.workflow_pdf} />
            <FlagRow label="Material Calculator" value={entry.workflow_material_calculator} />
            <FlagRow label="Repair System" value={entry.workflow_repair_system} />
            <FlagRow label="Estimate" value={entry.workflow_estimate} />
            <FlagRow label="Scope of Work" value={entry.workflow_scope_of_work} />
            <FlagRow label="Scheduling" value={entry.workflow_scheduling} />
            <FlagRow label="Warehouse" value={entry.workflow_warehouse} />
            <FlagRow label="Fleet" value={entry.workflow_fleet} />
            <FlagRow label="Job Hub" value={entry.workflow_job_hub} />
            <FlagRow label="Timeline" value={entry.workflow_timeline} />
            <FlagRow label="Analytics" value={entry.workflow_analytics} />
          </FlagGroup>

          <FlagGroup title="Produces / Consumes">
            <FlagRow label="Consumes Measurements" value={entry.consumes_measurements} />
            <FlagRow label="Produces Findings" value={entry.produces_findings} />
            <FlagRow label="Produces Repair" value={entry.produces_repair} />
            <FlagRow label="Produces Estimate" value={entry.produces_estimate} />
            <FlagRow label="Produces Material Calc" value={entry.produces_material_calculation} />
            <FlagRow label="Produces PDF" value={entry.produces_pdf} />
            <FlagRow label="Produces Gallery" value={entry.produces_gallery} />
            <FlagRow label="Produces Timeline" value={entry.produces_timeline} />
          </FlagGroup>

          <FlagGroup title="Validation">
            <FlagRow label="Unused" value={entry.validation_unused} />
            <FlagRow label="Duplicate" value={entry.validation_duplicate} />
            <FlagRow label="Incomplete" value={entry.validation_incomplete} />
            <FlagRow label="Missing Mapping" value={entry.validation_missing_mapping} />
            <FlagRow label="Missing Photo Logic" value={entry.validation_missing_photo_logic} />
            <FlagRow label="Missing Repair Mapping" value={entry.validation_missing_repair_mapping} />
            <FlagRow label="Missing PDF Mapping" value={entry.validation_missing_pdf_mapping} />
            <FlagRow label="Missing Material Calc" value={entry.validation_missing_material_calc} />
            <FlagRow label="Missing Estimate Mapping" value={entry.validation_missing_estimate_mapping} />
          </FlagGroup>
        </div>
      </DialogContent>
    </Dialog>
  );
}