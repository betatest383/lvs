import React, { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';

function ValidationRow({ status, label, detail }) {
  const config = {
    ok: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
    warning: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
    error: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
    info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  };
  const c = config[status] || config.info;
  const Icon = c.icon;
  return (
    <div className={`flex items-start gap-2.5 p-2.5 rounded-lg border ${c.bg} ${c.border}`}>
      <Icon className={`w-4 h-4 ${c.color} shrink-0 mt-0.5`} />
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

export default function TabValidation({ form, linkedRules, linkedMappings, gapResults }) {
  const checks = useMemo(() => {
    const results = [];

    // Role configured
    results.push({
      status: form.question_role ? 'ok' : 'error',
      label: 'Role Configured',
      detail: form.question_role ? `Role: ${form.question_role}` : 'No question role set — will be auto-inferred',
    });

    // Purpose configured
    const purposes = form.question_purpose || [];
    results.push({
      status: purposes.length > 0 ? 'ok' : 'warning',
      label: 'Purpose Configured',
      detail: purposes.length > 0 ? `${purposes.length} purpose(s): ${purposes.join(', ')}` : 'No purpose set — will be auto-inferred',
    });

    // Category configured
    results.push({
      status: form.question_category ? 'ok' : 'warning',
      label: 'Category Configured',
      detail: form.question_category || 'No category set — will be auto-inferred',
    });

    // Outputs configured
    const outputFields = ['output_customer_pdf','output_internal_pdf','output_repair_engine','output_estimate_engine','output_material_calculator'];
    const explicitOutputs = outputFields.filter(f => form[f] === true || form[f] === false);
    results.push({
      status: explicitOutputs.length > 0 ? 'ok' : 'warning',
      label: 'Outputs Configured',
      detail: explicitOutputs.length > 0 ? `${explicitOutputs.length} output(s) explicitly set` : 'No explicit outputs — will be inferred from show_on_report',
    });

    // Conditional logic
    results.push({
      status: form.visibility_rule ? 'ok' : 'info',
      label: 'Conditional Logic',
      detail: form.visibility_rule ? 'Visibility rule configured' : 'No conditional logic — always visible',
    });

    // Logic rule linked
    results.push({
      status: linkedRules.length > 0 ? 'ok' : 'warning',
      label: 'Logic Rule Linked',
      detail: linkedRules.length > 0 ? `${linkedRules.length} rule(s) reference this question` : 'No logic rules reference this question',
    });

    // Repair mapping
    results.push({
      status: linkedMappings.length > 0 ? 'ok' : 'warning',
      label: 'Repair Mapping',
      detail: linkedMappings.length > 0 ? `${linkedMappings.length} pricebook mapping(s) found for this category` : 'No pricebook mappings found for this category',
    });

    // Estimate mapping
    results.push({
      status: form.creates_finding || linkedRules.length > 0 ? (linkedMappings.length > 0 ? 'ok' : 'warning') : 'info',
      label: 'Estimate Mapping',
      detail: linkedMappings.length > 0 ? 'Pricebook mapping exists' : (form.creates_finding ? 'Creates findings but no pricebook mapping' : 'Does not create findings'),
    });

    // Material calculation
    const hasMaterialOutput = form.output_material_calculator === true || form.show_on_material_list;
    results.push({
      status: form.question_role === 'measurement' || form.question_role === 'calculation_input'
        ? (hasMaterialOutput ? 'ok' : 'warning')
        : 'info',
      label: 'Material Calculation',
      detail: form.question_role === 'measurement' || form.question_role === 'calculation_input'
        ? (hasMaterialOutput ? 'Connected to material calculator' : 'Measurement not connected to material calculator')
        : 'Not a measurement question',
    });

    return results;
  }, [form, linkedRules, linkedMappings]);

  const warnings = checks.filter(c => c.status === 'warning').length;
  const errors = checks.filter(c => c.status === 'error').length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg border">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span className="text-lg font-bold">{checks.filter(c => c.status === 'ok').length}</span>
          <span className="text-xs text-muted-foreground">Complete</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          <span className="text-lg font-bold">{warnings}</span>
          <span className="text-xs text-muted-foreground">Warnings</span>
        </div>
        <div className="flex items-center gap-2">
          <XCircle className="w-5 h-5 text-red-600" />
          <span className="text-lg font-bold">{errors}</span>
          <span className="text-xs text-muted-foreground">Errors</span>
        </div>
      </div>

      {/* Validation checks */}
      <div className="space-y-2">
        {checks.map((check, i) => (
          <ValidationRow key={i} status={check.status} label={check.label} detail={check.detail} />
        ))}
      </div>

      {/* Gap Review results */}
      {gapResults && gapResults.length > 0 && (
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Gap Review Results</Label>
          <div className="mt-1.5 space-y-1.5">
            {gapResults.map((gap, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">{gap.gap_type}</p>
                  <p className="text-xs text-muted-foreground">{gap.gap_why}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}