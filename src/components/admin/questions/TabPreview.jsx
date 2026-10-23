import React from 'react';
import { Badge } from '@/components/ui/badge';
import { ArrowDown, FileText, Wrench, Calculator, Calendar, Warehouse, Truck, ClipboardList, BarChart3, GitBranch, AlertTriangle } from 'lucide-react';
import { PURPOSE_COLOR } from '@/lib/inspectionMetadataConfig';
import { QUESTION_ROLES } from '@/lib/inspectionMatrixGapClassifier';

function ChainStep({ icon: Icon, label, active, children }) {
  return (
    <div className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${active ? 'bg-accent/10 border-accent/30' : 'bg-muted/30 border-border opacity-50'}`}>
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className={`text-sm ${active ? 'font-medium' : 'text-muted-foreground'}`}>{label}</span>
      {children}
    </div>
  );
}

export default function TabPreview({ form, linkedRules, linkedMappings }) {
  const purposes = form.question_purpose || [];
  const hasVisibility = !!form.visibility_rule;
  const hasRule = linkedRules.length > 0;
  const hasMapping = linkedMappings.length > 0;
  const createsFinding = form.creates_finding || hasRule;
  const hasRepairSystem = (form.repair_system_config && form.repair_system_config !== 'none') || hasMapping;
  const hasEstimate = hasMapping || createsFinding;
  const role = form.question_role || 'observation';

  const downstreamSteps = [
    { icon: GitBranch, label: 'Logic Rule', active: hasRule, detail: hasRule ? `${linkedRules.length} linked` : 'None' },
    { icon: AlertTriangle, label: 'Finding', active: createsFinding, detail: form.finding_type_config || (hasRule ? 'From rule' : 'None') },
    { icon: Wrench, label: 'Repair System', active: hasRepairSystem, detail: form.repair_system_config && form.repair_system_config !== 'none' ? form.repair_system_config : (hasMapping ? 'From mapping' : 'None') },
    { icon: FileText, label: 'Estimate', active: hasEstimate, detail: hasMapping ? `${linkedMappings.length} items` : 'None' },
    { icon: ClipboardList, label: 'Scope of Work', active: hasEstimate },
    { icon: Calendar, label: 'Scheduling', active: hasEstimate },
    { icon: Warehouse, label: 'Warehouse', active: form.output_warehouse === true || (form.question_role === 'measurement' && (form.output_material_calculator === true || form.show_on_material_list)) },
    { icon: Truck, label: 'Fleet', active: form.output_fleet === true },
    { icon: Calculator, label: 'Material Calculator', active: form.output_material_calculator === true || form.show_on_material_list },
    { icon: FileText, label: 'Technician (Job Hub)', active: form.output_job_hub === true || form.inspection_type === 'interior' || form.inspection_type === 'both' },
    { icon: BarChart3, label: 'Analytics', active: form.output_analytics === true || hasRule },
  ];

  return (
    <div className="space-y-4">
      {/* Question summary */}
      <div className="p-4 bg-muted/30 rounded-lg border">
        <p className="text-sm font-medium mb-2">{form.question_text || 'Untitled Question'}</p>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[10px] capitalize">{form.question_type?.replace(/_/g, ' ')}</Badge>
          {role && (
            <Badge className={`text-[10px] ${QUESTION_ROLES[role] ? '' : 'bg-gray-100 text-gray-600'}`}>
              {QUESTION_ROLES[role]?.label || role}
            </Badge>
          )}
          {form.question_category && (
            <Badge variant="outline" className="text-[10px]">{form.question_category}</Badge>
          )}
          {purposes.map(p => (
            <Badge key={p} className={`text-[10px] ${PURPOSE_COLOR[p] || 'bg-gray-100 text-gray-600'}`}>
              {p.replace(/_/g, ' ')}
            </Badge>
          ))}
        </div>
      </div>

      {/* Dependency Chain */}
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Downstream Dependency Chain</p>
        <div className="space-y-1">
          {downstreamSteps.map((step, i) => (
            <React.Fragment key={i}>
              <ChainStep icon={step.icon} label={step.label} active={step.active}>
                {step.detail && <span className="text-xs text-muted-foreground ml-auto">{step.detail}</span>}
              </ChainStep>
              {i < downstreamSteps.length - 1 && (
                <div className="flex justify-center"><ArrowDown className="w-3 h-3 text-muted-foreground/40" /></div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Visibility info */}
      <div className="p-3 bg-muted/30 rounded-lg border">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Visibility</p>
        <p className="text-sm">{hasVisibility ? 'Conditional — only shown when rule matches' : 'Always visible'}</p>
      </div>
    </div>
  );
}