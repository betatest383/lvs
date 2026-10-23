import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Zap, ArrowRight, ChevronDown, Settings } from 'lucide-react';
import { ACTION_CATEGORIES, ALL_ACTIONS, VALUE_SOURCE_TYPES } from '@/lib/enterpriseActionRegistry';
import RepairTemplatePicker from './RepairTemplatePicker';

function FieldMappingRow({ mapping, index, actionField, eventFields, onChange, onRemove, repairTemplateId, onRepairTemplateSync }) {
  const isBoolean = actionField?.type === 'boolean';
  const isEnum = actionField?.type === 'enum';
  const isMultiEnum = actionField?.type === 'multienum';
  const isText = actionField?.type === 'text';
  const isRepairTemplateLookup = actionField?.lookup === true && actionField?.key === 'repair_template_id';
  // Enum fields and repair template lookups must be static-only
  const sourceType = isEnum ? 'static' : (isRepairTemplateLookup ? 'static' : (mapping.source_type || 'static'));

  return (
    <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg border">
      {index > 0 && (
        <span className="text-xs font-bold text-muted-foreground mt-2.5 w-6 shrink-0">AND</span>
      )}

      <div className="flex-1 min-w-0 space-y-2">
        {/* Field label */}
        <div className="flex items-center gap-2 flex-wrap">
          <Label className="text-xs font-semibold">{actionField?.label || mapping.field}</Label>
          {actionField?.required && <Badge variant="destructive" className="text-[10px] py-0">Required</Badge>}
          <Badge variant="outline" className="text-[10px]">{actionField?.type || 'string'}</Badge>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Source type selector — hidden for enum fields and repair template lookups (locked to static) */}
          {!isEnum && !isRepairTemplateLookup && (
            <Select value={sourceType} onValueChange={v => onChange({ ...mapping, source_type: v, value: '', event_field: '' })}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VALUE_SOURCE_TYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {sourceType === 'event' && (
            <Select value={mapping.event_field || ''} onValueChange={v => onChange({ ...mapping, event_field: v, value: v })}>
              <SelectTrigger className="flex-1 h-8 text-xs min-w-[140px]">
                <SelectValue placeholder="Select event field..." />
              </SelectTrigger>
              <SelectContent>
                {eventFields.map(f => (
                  <SelectItem key={f.key} value={f.key}>
                    <span className="text-xs">{f.label} <code className="text-muted-foreground">{f.key}</code></span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {sourceType === 'static' && (
            <div className="flex-1 min-w-[140px]">
              {isRepairTemplateLookup ? (
                <RepairTemplatePicker
                  value={repairTemplateId}
                  onChange={(id, tmpl) => {
                    onChange({ ...mapping, value: id });
                    onRepairTemplateSync?.(id, tmpl);
                  }}
                  className="h-8 text-xs"
                  placeholder="Select repair template..."
                />
              ) : isBoolean ? (
                <Select value={mapping.value || ''} onValueChange={v => onChange({ ...mapping, value: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Value..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">True</SelectItem>
                    <SelectItem value="false">False</SelectItem>
                  </SelectContent>
                </Select>
              ) : isEnum ? (
                <Select value={mapping.value || ''} onValueChange={v => onChange({ ...mapping, value: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Value..." /></SelectTrigger>
                  <SelectContent>
                    {actionField.options.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : isMultiEnum ? (
                <MultiEnumInput options={actionField.options} value={mapping.value || ''} onChange={v => onChange({ ...mapping, value: v })} />
              ) : isText ? (
                <Textarea
                  rows={2}
                  className="text-xs"
                  placeholder="Value..."
                  value={mapping.value || ''}
                  onChange={e => onChange({ ...mapping, value: e.target.value })}
                />
              ) : (
                <Input
                  className="h-8 text-xs"
                  type={actionField?.type === 'number' ? 'number' : 'text'}
                  placeholder="Value..."
                  value={mapping.value || ''}
                  onChange={e => onChange({ ...mapping, value: e.target.value })}
                />
              )}
            </div>
          )}

          {sourceType === 'template' && (
            <div className="flex-1 min-w-[140px]">
              <Input
                className="h-8 text-xs"
                placeholder="Use {{event.field}} for dynamic values"
                value={mapping.value || ''}
                onChange={e => onChange({ ...mapping, value: e.target.value })}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Use <code>{'{{event.employee}}'}</code> to inject event field values</p>
            </div>
          )}
        </div>
      </div>

      <button type="button" onClick={onRemove} className="mt-1.5 text-muted-foreground hover:text-destructive shrink-0">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function MultiEnumInput({ options, value, onChange }) {
  const selected = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  const toggle = (opt) => {
    if (selected.includes(opt)) {
      onChange(selected.filter(s => s !== opt).join(','));
    } else {
      onChange([...selected, opt].join(','));
    }
  };
  return (
    <div className="flex flex-wrap gap-1 p-2 border rounded-md bg-background">
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => toggle(opt)}
          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${selected.includes(opt) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export default function ActionBuilder({ eventFields, actions, onChange, sourceModuleKey, repairTemplateId, onRepairTemplateSync }) {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [collapsedActions, setCollapsedActions] = useState(new Set());
  const [expandedAdvanced, setExpandedAdvanced] = useState(new Set());

  // When source is Inspection Engine, filter out repair workflow actions —
  // the Repair Recommendation Engine handles downstream automatically via
  // the "Deficiency Created" event subscription.
  const isInspectionEngine = sourceModuleKey === 'inspection_engine';

  const filteredCategories = useMemo(() => {
    if (!isInspectionEngine) return ACTION_CATEGORIES;
    return ACTION_CATEGORIES.map(cat => ({
      ...cat,
      actions: cat.actions.filter(a => !a.isRepairWorkflowAction),
    })).filter(cat => cat.actions.length > 0);
  }, [isInspectionEngine]);

  const availableFields = useMemo(() => {
    if (!selectedCategory) return [];
    const cat = filteredCategories.find(c => c.categoryKey === selectedCategory);
    return cat?.actions || [];
  }, [selectedCategory, filteredCategories]);

  const addAction = (actionKey) => {
    const action = ALL_ACTIONS.find(a => a.actionKey === actionKey);
    if (!action) return;
    const allFields = [...(action.fields || []), ...(action.advancedFields || [])];
    const fieldMappings = allFields.map(f => ({
      field: f.key,
      source_type: 'static',
      value: f.default || '',
      event_field: '',
    }));
    const newActions = [...(actions || []), { action_key: actionKey, action_name: action.action, field_mappings: fieldMappings }];
    onChange(newActions);
    // New actions start expanded (not in collapsed set)
  };

  const toggleCollapse = (index) => {
    setCollapsedActions(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAdvanced = (index) => {
    setExpandedAdvanced(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const updateAction = (index, updated) => {
    onChange(actions.map((a, i) => i === index ? updated : a));
  };

  const removeAction = (index) => {
    onChange(actions.filter((_, i) => i !== index));
  };

  const updateFieldMapping = (actionIndex, fieldIndex, updated) => {
    const action = actions[actionIndex];
    const newMappings = action.field_mappings.map((m, i) => i === fieldIndex ? updated : m);
    updateAction(actionIndex, { ...action, field_mappings: newMappings });
  };

  const removeFieldMapping = (actionIndex, fieldIndex) => {
    const action = actions[actionIndex];
    const newMappings = action.field_mappings.filter((_, i) => i !== fieldIndex);
    updateAction(actionIndex, { ...action, field_mappings: newMappings });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-accent" />
        <Label className="text-sm font-semibold">Actions</Label>
        <span className="text-xs text-muted-foreground">({actions?.length || 0} configured)</span>
      </div>

      {/* Inspection Engine: repair workflow is automated banner */}
      {isInspectionEngine && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <Zap className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-700">
            <p className="font-semibold">Repair workflow actions are automated</p>
            <p className="mt-0.5">When a deficiency finding is created, the Repair Recommendation Engine automatically handles: repair recommendations, estimate items, scope of work, proposals, customer presentation, inventory, and analytics. No inspection rule needs to call these manually.</p>
          </div>
        </div>
      )}

      {/* Action selector — category toggle buttons */}
      <div className="flex flex-wrap gap-2">
        {filteredCategories.map(cat => (
          <button
            key={cat.categoryKey}
            type="button"
            onClick={() => setSelectedCategory(selectedCategory === cat.categoryKey ? '' : cat.categoryKey)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${selectedCategory === cat.categoryKey ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-muted'}`}
          >
            <span className={`w-2 h-2 rounded-full ${cat.color.split(' ')[0]}`} />
            {cat.category}
            <span className="opacity-60">({cat.actions.length})</span>
          </button>
        ))}
      </div>

      {/* Selected category actions */}
      {selectedCategory && (
        <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-lg border">
          {availableFields.map(act => (
            <Button
              key={act.actionKey}
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => addAction(act.actionKey)}
            >
              <Plus className="w-3 h-3" />
              {act.action}
            </Button>
          ))}
        </div>
      )}

      {/* Configured actions */}
      <div className="space-y-3">
        {(actions || []).map((actionConfig, ai) => {
          const action = ALL_ACTIONS.find(a => a.actionKey === actionConfig.action_key);
          if (!action) return null;
          return (
            <div key={ai} className="border rounded-lg p-4 space-y-3 bg-card">
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => toggleCollapse(ai)} className="flex items-center gap-2 text-left flex-1 min-w-0">
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${action.categoryColor}`}>
                    <Zap className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{action.action}</p>
                    <p className="text-xs text-muted-foreground truncate">{action.description}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] ml-1 shrink-0">
                    {actionConfig.field_mappings.filter(m => m.value || m.event_field).length}/{actionConfig.field_mappings.length} mapped
                  </Badge>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => toggleCollapse(ai)} className="text-muted-foreground hover:text-foreground p-1">
                    {collapsedActions.has(ai) ? <Plus className="w-4 h-4" /> : <Trash2 className="w-4 h-4 rotate-180" />}
                  </button>
                  <button type="button" onClick={() => removeAction(ai)} className="text-muted-foreground hover:text-destructive p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {!collapsedActions.has(ai) && (
              <>
              <div className="space-y-2">
                {actionConfig.field_mappings.map((mapping, fi) => {
                  if (action.advancedFields?.some(f => f.key === mapping.field)) return null;
                  return (
                    <FieldMappingRow
                      key={fi}
                      mapping={mapping}
                      index={fi}
                      actionField={action.fields.find(f => f.key === mapping.field)}
                      eventFields={eventFields}
                      onChange={updated => updateFieldMapping(ai, fi, updated)}
                      onRemove={() => removeFieldMapping(ai, fi)}
                      repairTemplateId={repairTemplateId}
                      onRepairTemplateSync={onRepairTemplateSync}
                    />
                  );
                })}
              </div>

              {/* Advanced Settings */}
              {action.advancedFields && action.advancedFields.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleAdvanced(ai)}
                    className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors select-none"
                  >
                    <span className="flex items-center gap-1.5">
                      <Settings className="w-3.5 h-3.5" />
                      Advanced Settings
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedAdvanced.has(ai) ? 'rotate-180' : ''}`} />
                  </button>
                  {expandedAdvanced.has(ai) && (
                    <div className="space-y-2 p-3 pt-1 bg-muted/20">
                      {actionConfig.field_mappings.map((mapping, fi) => {
                        if (!action.advancedFields.some(f => f.key === mapping.field)) return null;
                        return (
                          <FieldMappingRow
                            key={fi}
                            mapping={mapping}
                            index={fi}
                            actionField={action.advancedFields.find(f => f.key === mapping.field)}
                            eventFields={eventFields}
                            onChange={updated => updateFieldMapping(ai, fi, updated)}
                            onRemove={() => removeFieldMapping(ai, fi)}
                            repairTemplateId={repairTemplateId}
                            onRepairTemplateSync={onRepairTemplateSync}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Auto-populated fields indicator */}
              {action.autoPopulated && action.autoPopulated.length > 0 && (
                <div className="text-xs bg-muted/30 rounded p-2 border">
                  <p className="font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-accent" />
                    Auto-populated by Rules Engine ({action.autoPopulated.length} fields)
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {action.autoPopulated.map(f => (
                      <Badge key={f.key} variant="outline" className="text-[10px] py-0 font-normal text-muted-foreground">
                        {f.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview */}
                  <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2 border flex items-center gap-1.5">
                    <ArrowRight className="w-3 h-3" />
                    <span className="font-medium">Preview:</span>
                    <code className="font-mono">
                      {action.entity} → {action.operation}
                    </code>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}