import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  STANDARD_STATUSES, SEVERITY_OPTIONS, RISK_FLAGS, getCategoryColor, getAuthorityColor,
} from '@/lib/inspectionStandardConstants';

function safeParse(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

function Section({ title, children }) {
  if (!children) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function FieldDisplay({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm whitespace-pre-wrap mt-0.5">{value}</p>
    </div>
  );
}

export default function StandardDetailDrawer({ standard, open, onOpenChange }) {
  if (!standard) return null;

  const authorities = standard.authority_level || [];
  const authorityDetails = safeParse(standard.authority_details, []);
  const appliesTo = standard.applies_to || [];
  const possibleSystems = standard.possible_repair_systems || [];
  const revisionHistory = safeParse(standard.revision_history, []);
  const activeRiskFlags = RISK_FLAGS.filter(f => standard[f.key]);
  const severity = SEVERITY_OPTIONS.find(s => s.value === standard.severity);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 flex-wrap">
            {standard.standard_name}
            {standard.status && (
              <Badge className={`text-xs ${STANDARD_STATUSES[standard.status]?.color || ''}`}>
                {STANDARD_STATUSES[standard.status]?.label || standard.status}
              </Badge>
            )}
          </SheetTitle>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {standard.standard_number && <Badge variant="outline">{standard.standard_number}</Badge>}
            {standard.version && <Badge variant="outline">v{standard.version}</Badge>}
            {standard.category && <Badge className={`text-xs ${getCategoryColor(standard.category)}`}>{standard.category}</Badge>}
            {standard.inspection_level && <Badge variant="outline" className="capitalize">{standard.inspection_level.replace('_', ' ')}</Badge>}
          </div>
        </SheetHeader>

        <div className="space-y-4 mt-4 pb-8">
          <Section title="Applies To">
            {appliesTo.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {appliesTo.map(a => <Badge key={a} variant="secondary" className="text-xs">{a}</Badge>)}
              </div>
            )}
          </Section>

          <Section title="Authority Level">
            {authorities.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {authorities.map(a => <Badge key={a} className={`text-xs ${getAuthorityColor(a)}`}>{a}</Badge>)}
              </div>
            )}
            {authorityDetails.length > 0 && (
              <div className="space-y-2 mt-2">
                {authorityDetails.map((d, i) => (
                  <div key={i} className="p-2 border rounded-lg text-xs space-y-0.5">
                    {d.authority_name && <p className="font-semibold">{d.authority_name}</p>}
                    {d.section && <p>Section: {d.section}</p>}
                    {d.paragraph && <p>Paragraph: {d.paragraph}</p>}
                    {d.url && <p className="text-blue-600 break-all">{d.url}</p>}
                    {d.reference_notes && <p className="text-muted-foreground">{d.reference_notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Pass / Fail Criteria">
            <div className="space-y-2">
              <FieldDisplay label="Pass Criteria" value={standard.pass_criteria} />
              <FieldDisplay label="Warning Criteria" value={standard.warning_criteria} />
              <FieldDisplay label="Fail Criteria" value={standard.fail_criteria} />
              <FieldDisplay label="Critical Failure Criteria" value={standard.critical_failure_criteria} />
              <FieldDisplay label="N/A Criteria" value={standard.na_criteria} />
              <FieldDisplay label="Measurement Tolerances" value={standard.measurement_tolerances} />
              <FieldDisplay label="Photo Requirements" value={standard.photo_requirements} />
              <FieldDisplay label="Measurement Requirements" value={standard.measurement_requirements} />
              <FieldDisplay label="Required Supporting Evidence" value={standard.required_supporting_evidence} />
              {(standard.minimum_value != null || standard.maximum_value != null || standard.target_value != null) && (
                <div className="flex gap-3 text-sm">
                  {standard.minimum_value != null && <span>Min: <strong>{standard.minimum_value} {standard.unit_of_measure || ''}</strong></span>}
                  {standard.target_value != null && <span>Target: <strong>{standard.target_value} {standard.unit_of_measure || ''}</strong></span>}
                  {standard.maximum_value != null && <span>Max: <strong>{standard.maximum_value} {standard.unit_of_measure || ''}</strong></span>}
                </div>
              )}
            </div>
          </Section>

          <Section title="Technician Guidance">
            <div className="space-y-2">
              <FieldDisplay label="Inspection Procedure" value={standard.inspection_procedure} />
              <FieldDisplay label="How To Inspect" value={standard.how_to_inspect} />
              <FieldDisplay label="Measurement Instructions" value={standard.measurement_instructions} />
              <FieldDisplay label="Photo Instructions" value={standard.photo_instructions} />
              <FieldDisplay label="Required Documentation" value={standard.required_documentation} />
              <FieldDisplay label="Common Defects" value={standard.common_defects} />
              <FieldDisplay label="Common Causes" value={standard.common_causes} />
              <FieldDisplay label="Safety Considerations" value={standard.safety_considerations} />
              <FieldDisplay label="Troubleshooting Tips" value={standard.troubleshooting_tips} />
              <FieldDisplay label="Technician Notes" value={standard.technician_notes} />
            </div>
          </Section>

          <Section title="Customer Education">
            <div className="space-y-2">
              <FieldDisplay label="Customer Explanation" value={standard.customer_explanation} />
              <FieldDisplay label="Why This Matters" value={standard.why_this_matters} />
              <FieldDisplay label="Potential Risks" value={standard.potential_risks} />
              <FieldDisplay label="Consequences If Ignored" value={standard.consequences_if_ignored} />
              <FieldDisplay label="Recommended Maintenance" value={standard.recommended_maintenance} />
              <FieldDisplay label="FAQ" value={standard.faq} />
              <FieldDisplay label="Customer-Friendly Language" value={standard.customer_friendly_language} />
            </div>
          </Section>

          <Section title="Repair Guidance">
            <div className="space-y-2">
              {standard.default_repair_system && <FieldDisplay label="Default Repair System" value={standard.default_repair_system} />}
              {possibleSystems.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {possibleSystems.map(s => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
                </div>
              )}
              <FieldDisplay label="Good Option" value={standard.good_option} />
              <FieldDisplay label="Better Option" value={standard.better_option} />
              <FieldDisplay label="Best Option" value={standard.best_option} />
              <FieldDisplay label="Recommended Pricebook Categories" value={standard.recommended_pricebook_categories} />
              <FieldDisplay label="Suggested Material Calculation Template" value={standard.suggested_material_calc_template} />
              <FieldDisplay label="Suggested Scope of Work Template" value={standard.suggested_scope_of_work_template} />
              <FieldDisplay label="Typical Labor Difficulty" value={standard.typical_labor_difficulty} />
            </div>
          </Section>

          <Section title="Risk Classification">
            <div className="flex flex-wrap gap-2">
              {severity && <Badge className={severity.color}>Severity: {severity.label}</Badge>}
              {activeRiskFlags.map(f => <Badge key={f.key} className="text-xs bg-red-100 text-red-700">{f.label}</Badge>)}
            </div>
          </Section>

          <Section title="Version Control">
            <div className="space-y-2 text-sm">
              {standard.created_by && <p><span className="text-muted-foreground">Created by:</span> {standard.created_by}</p>}
              {standard.reviewed_by && <p><span className="text-muted-foreground">Reviewed by:</span> {standard.reviewed_by}</p>}
              {standard.approved_by && <p><span className="text-muted-foreground">Approved by:</span> {standard.approved_by}</p>}
              {standard.approval_date && <p><span className="text-muted-foreground">Approval Date:</span> {standard.approval_date}</p>}
              {revisionHistory.length > 0 && (
                <div className="space-y-1 mt-2">
                  <p className="text-xs font-medium text-muted-foreground">Revision History:</p>
                  {revisionHistory.map((r, i) => (
                    <div key={i} className="text-xs p-2 border rounded-lg">
                      <p><strong>v{r.version}</strong> — {r.date?.split('T')[0]}</p>
                      <p className="text-muted-foreground">{r.author}: {r.changes}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}