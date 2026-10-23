import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import RegistrySearchCombobox from '@/components/shared/RegistrySearchCombobox';
import { searchWorkflows, resolveWorkflows, searchSOPs, resolveSOPs } from '@/lib/taskSearchFunctions';
import { Badge } from '@/components/ui/badge';

const EXECUTION_MODES = [
  { value: 'simple_action', label: 'Simple Action' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'guided_task', label: 'Guided Task' },
  { value: 'form', label: 'Form' },
  { value: 'workflow', label: 'Workflow' },
  { value: 'wizard', label: 'Wizard' },
  { value: 'automated', label: 'Automated' },
  { value: 'linked_module', label: 'Linked Module' },
];

export default function ExecutionSection({ data, updateField, templateDefaults }) {
  const isTemplateDerived = (field) => templateDefaults && templateDefaults[field] !== undefined;
  const mode = data.execution_mode || 'simple_action';

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs">Execution Mode</Label>
          {isTemplateDerived('execution_mode') && <Badge variant="secondary" className="text-xs">Template</Badge>}
        </div>
        <Select value={mode} onValueChange={v => updateField('execution_mode', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {EXECUTION_MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {mode === 'simple_action' && (
        <div className="space-y-1.5">
          <Label className="text-xs">Execution Route</Label>
          <Input value={data.related_route || ''} onChange={e => updateField('related_route', e.target.value)} placeholder="/path/to/module" />
        </div>
      )}

      {mode === 'workflow' && (
        <div className="space-y-1.5">
          <Label className="text-xs">Linked Workflow</Label>
          <RegistrySearchCombobox
            value={data.workflow_type || ''}
            onChange={(id) => updateField('workflow_type', id)}
            searchFn={searchWorkflows}
            resolveFn={resolveWorkflows}
            placeholder="Search workflows…"
            onOpenRecord={(id) => window.open(`/lvcos/workflow-registry?id=${id}`, '_blank')}
          />
        </div>
      )}

      {mode === 'guided_task' && (
        <div className="space-y-1.5">
          <Label className="text-xs">Linked SOP</Label>
          <RegistrySearchCombobox
            value={data.related_sop || ''}
            onChange={(id) => updateField('related_sop', id)}
            searchFn={searchSOPs}
            resolveFn={resolveSOPs}
            placeholder="Search SOPs…"
            onOpenRecord={(id) => window.open(`/lvcos/sop-registry?id=${id}`, '_blank')}
          />
        </div>
      )}

      {mode === 'linked_module' && (
        <div className="space-y-1.5">
          <Label className="text-xs">Linked Module Route</Label>
          <Input value={data.related_route || ''} onChange={e => updateField('related_route', e.target.value)} placeholder="/module/path" />
        </div>
      )}

      {(mode === 'checklist' || mode === 'form' || mode === 'wizard' || mode === 'automated') && (
        <p className="text-xs text-muted-foreground italic">
          {mode === 'automated'
            ? 'Automated execution — the system will handle this task without manual action.'
            : `This execution mode uses the ${mode} system. Configure the linked record after task creation.`}
        </p>
      )}
    </div>
  );
}