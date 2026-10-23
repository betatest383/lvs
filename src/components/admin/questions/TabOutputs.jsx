import React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

function OutputToggle({ form, set, field, label, desc }) {
  const value = form[field];
  const isExplicit = value === true || value === false;
  return (
    <div className={`flex items-center justify-between p-2.5 rounded-lg border ${isExplicit ? 'bg-accent/10 border-accent/30' : 'bg-muted/30 border-border'}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {desc && <p className="text-xs text-muted-foreground truncate">{desc}</p>}
      </div>
      <Switch
        checked={value === true}
        onCheckedChange={v => set(field, v)}
      />
    </div>
  );
}

function OutputGroup({ title, children }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{title}</Label>
      <div className="mt-1.5 space-y-1.5">{children}</div>
    </div>
  );
}

export default function TabOutputs({ form, set }) {
  return (
    <div className="space-y-5">
      <OutputGroup title="Reports">
        <OutputToggle form={form} set={set} field="output_customer_pdf" label="Customer PDF" desc="Appears on the customer-facing PDF report" />
        <OutputToggle form={form} set={set} field="output_internal_pdf" label="Internal PDF" desc="Appears on the internal-only PDF" />
        <OutputToggle form={form} set={set} field="output_inspection_summary" label="Inspection Summary" desc="Included in the inspection summary section" />
        <OutputToggle form={form} set={set} field="output_customer_summary" label="Customer Summary" desc="Included in the customer summary section" />
        <OutputToggle form={form} set={set} field="output_material_list" label="Material List" desc="Included on the material list report" />
      </OutputGroup>

      <OutputGroup title="Photo Outputs">
        <OutputToggle form={form} set={set} field="output_before_gallery" label="Before Gallery" desc="Photos appear in the before gallery" />
        <OutputToggle form={form} set={set} field="output_after_gallery" label="After Gallery" desc="Photos appear in the after gallery" />
        <OutputToggle form={form} set={set} field="output_internal_gallery" label="Internal Gallery" desc="Photos appear in the internal gallery" />
        <OutputToggle form={form} set={set} field="output_customer_presentation" label="Customer Presentation" desc="Photos shown in customer presentation" />
      </OutputGroup>

      <OutputGroup title="Downstream Systems">
        <OutputToggle form={form} set={set} field="output_repair_engine" label="Repair Engine" desc="Feeds the repair system recommendation engine" />
        <OutputToggle form={form} set={set} field="output_estimate_engine" label="Estimate Engine" desc="Feeds estimate line item generation" />
        <OutputToggle form={form} set={set} field="output_material_calculator" label="Material Calculator" desc="Feeds material quantity calculations" />
        <OutputToggle form={form} set={set} field="output_scope_of_work" label="Scope of Work" desc="Feeds the scope of work planning system" />
        <OutputToggle form={form} set={set} field="output_scheduling" label="Scheduling" desc="Feeds scheduling decisions" />
        <OutputToggle form={form} set={set} field="output_warehouse" label="Warehouse" desc="Feeds warehouse staging and prep" />
        <OutputToggle form={form} set={set} field="output_fleet" label="Fleet" desc="Feeds fleet resource planning" />
        <OutputToggle form={form} set={set} field="output_job_hub" label="Job Hub" desc="Appears in the technician job hub" />
        <OutputToggle form={form} set={set} field="output_analytics" label="Analytics" desc="Feeds analytics and reporting dashboards" />
        <OutputToggle form={form} set={set} field="output_timeline" label="Timeline" desc="Appears on the job timeline" />
      </OutputGroup>

      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs text-blue-700">
          <strong>Note:</strong> When output fields are explicitly set, the Inspection Matrix will use these values
          instead of inferring from show_on_report / show_on_material_list. Toggles shown with a highlighted background
          have been explicitly configured.
        </p>
      </div>
    </div>
  );
}