import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { IMPACT_SYSTEMS } from '@/lib/inspectionMetadataConfig';

export default function ImpactAnalysisDialog({ open, onOpenChange, form, linkedRules, linkedMappings, onConfirm }) {
  const affectedSystems = useMemo(() => {
    const systems = [];

    if (linkedRules.length > 0) systems.push({ label: 'Logic Rules', detail: `${linkedRules.length} rule(s) reference this question` });
    if (form.creates_finding || linkedRules.length > 0) systems.push({ label: 'Repair Systems', detail: 'Findings from this question feed repair recommendations' });
    if (form.output_customer_pdf === true || form.show_on_report !== false) systems.push({ label: 'Customer PDF', detail: 'Question appears on customer-facing report' });
    if (linkedMappings.length > 0 || form.creates_finding) systems.push({ label: 'Estimate Engine', detail: 'Question feeds estimate generation' });
    if (form.output_material_calculator === true || form.show_on_material_list) systems.push({ label: 'Material Calculations', detail: 'Question feeds material quantity calculations' });
    if (form.output_warehouse === true || form.show_on_material_list) systems.push({ label: 'Warehouse Planning', detail: 'Question feeds warehouse staging' });
    if (form.output_scheduling === true || linkedMappings.length > 0) systems.push({ label: 'Scheduling', detail: 'Question feeds scheduling decisions' });
    if (form.output_analytics === true || linkedRules.length > 0) systems.push({ label: 'Analytics', detail: 'Question feeds analytics dashboards' });

    return systems;
  }, [form, linkedRules, linkedMappings]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" /> Impact Analysis
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Changing this question may affect the following systems:
          </p>
          {affectedSystems.length === 0 ? (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              No downstream systems are affected by this change.
            </div>
          ) : (
            <div className="space-y-1.5">
              {affectedSystems.map((sys, i) => (
                <div key={i} className="flex items-start gap-2.5 p-2.5 bg-muted/30 rounded-lg border">
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{sys.label}</p>
                    <p className="text-xs text-muted-foreground">{sys.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Existing inspection data, logic rules, repair mappings, and material calculations will not be modified.
            Only the question configuration is being updated.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onConfirm}>Confirm & Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}