import React from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

export default function MatrixStatusBar({ form, linkedRules, linkedMappings, onNavigateToValidation }) {
  const checks = [
    { label: 'Role', ok: !!form.question_role },
    { label: 'Purpose', ok: (form.question_purpose || []).length > 0 },
    { label: 'Category', ok: !!form.question_category },
    { label: 'Outputs', ok: form.output_customer_pdf === true || form.output_customer_pdf === false || form.output_repair_engine === true || form.output_estimate_engine === true },
    { label: 'Logic Linked', ok: linkedRules.length > 0 || !!form.visibility_rule },
    { label: 'Repair Mapping', ok: linkedMappings.length > 0 || (form.repair_system_config && form.repair_system_config !== 'none') },
    { label: 'Estimate Mapping', ok: linkedMappings.length > 0 },
    { label: 'Material Calc', ok: form.output_material_calculator === true || form.show_on_material_list === true || form.question_role === 'observation' },
  ];

  const passed = checks.filter(c => c.ok).length;
  const failed = checks.length - passed;
  const warnings = failed; // treat missing as warnings, not errors

  return (
    <div className="flex items-center gap-3 flex-wrap p-3 bg-muted/30 rounded-lg border">
      <div className="flex items-center gap-1.5">
        {warnings === 0 ? (
          <CheckCircle2 className="w-4 h-4 text-green-600" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-amber-600" />
        )}
        <span className="text-xs font-semibold">Inspection Matrix Status:</span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {checks.map((check, i) => (
          <button
            key={i}
            type="button"
            onClick={() => !check.ok && onNavigateToValidation?.()}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
              check.ok
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-amber-50 text-amber-700 border-amber-200 cursor-pointer hover:bg-amber-100'
            }`}
            title={check.ok ? `${check.label}: configured` : `${check.label}: not configured — click to view validation`}
          >
            {check.ok ? <CheckCircle2 className="w-2.5 h-2.5" /> : <AlertTriangle className="w-2.5 h-2.5" />}
            {check.label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Badge variant={warnings === 0 ? 'default' : 'secondary'} className={`text-[10px] ${warnings === 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {warnings === 0 ? 'No Issues' : `${warnings} Warning${warnings > 1 ? 's' : ''}`}
        </Badge>
      </div>
    </div>
  );
}