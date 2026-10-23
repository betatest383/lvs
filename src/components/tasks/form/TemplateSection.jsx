import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import RegistrySearchCombobox from '@/components/shared/RegistrySearchCombobox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, X, AlertTriangle, Filter } from 'lucide-react';
import { searchTemplates, resolveTemplates, fetchTemplateCategories } from '@/lib/taskSearchFunctions';

export default function TemplateSection({ data, updateField, isAuthorized, onClearTemplate }) {
  const [templateInfo, setTemplateInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');

  // Load distinct template categories once (free-text TaskTemplate.category — not a registry)
  useEffect(() => {
    let active = true;
    fetchTemplateCategories(isAuthorized)
      .then(cats => { if (active) setCategories(cats); })
      .catch(() => { if (active) setCategories([]); });
    return () => { active = false; };
  }, [isAuthorized]);

  // Stable filter object so the combobox only re-searches when the category actually changes
  const extraFilters = useMemo(
    () => ({ includeDrafts: isAuthorized, category: selectedCategory || undefined }),
    [isAuthorized, selectedCategory]
  );

  useEffect(() => {
    if (data.task_template_id) {
      setLoading(true);
      base44.entities.TaskTemplate.get(data.task_template_id)
        .then(t => setTemplateInfo(t))
        .catch(() => setTemplateInfo(null))
        .finally(() => setLoading(false));
    } else {
      setTemplateInfo(null);
    }
  }, [data.task_template_id]);

  const handleSelect = (id) => {
    if (!id) { handleClear(); return; }
    updateField('task_template_id', id);
  };

  const handleClear = () => {
    updateField('task_template_id', '');
    updateField('task_template_number', '');
    updateField('task_template_version', null);
    updateField('template_defaults_snapshot', '');
    onClearTemplate?.();
  };

  const handleUseBlank = () => {
    handleClear();
    updateField('title', '');
    updateField('description', '');
  };

  const isDraft = templateInfo?.status === 'Draft' || templateInfo?.status === 'In Review';
  const canUseTemplate = !isDraft || isAuthorized;

  // When a template is selected, populate task defaults
  useEffect(() => {
    if (templateInfo && canUseTemplate) {
      const defaults = {
        title: templateInfo.template_name,
        description: templateInfo.description || '',
        department: templateInfo.department_name_snapshot || '',
        priority: templateInfo.default_priority || 'Medium',
        work_category: templateInfo.work_category || 'routine',
        business_impact: templateInfo.business_impact || 'none',
        urgency: templateInfo.urgency || 'none',
        interruptibility: templateInfo.interruptibility || 'freely_interruptible',
        focus_lock_eligible: templateInfo.focus_lock_eligible || false,
        resume_required: templateInfo.resume_required || false,
        requires_immediate_acknowledgment: templateInfo.requires_immediate_acknowledgment || false,
        acknowledgment_deadline_minutes: templateInfo.acknowledgment_deadline_minutes || null,
        claim_mode: templateInfo.claim_mode || 'assigned',
        required_employee_count: templateInfo.required_employee_count || 1,
        execution_mode: templateInfo.execution_mode || 'simple_action',
        related_route: templateInfo.execution_route || '',
        // ── Assignment routing ──
        assignment_mode: templateInfo.assignment_mode || 'specific_employee',
        assigned_department: templateInfo.department_name_snapshot || '',
        assigned_department_id: templateInfo.default_department_id || '',
        assigned_employee_ids: templateInfo.default_employee_ids || [],
        assigned_role_ids: templateInfo.default_role_ids || [],
        assigned_role_id: (templateInfo.default_role_ids || [])[0] || '',
        assigned_employee_registry_id: templateInfo.assignment_mode === 'specific_employee'
          ? (templateInfo.default_employee_ids || [])[0] || ''
          : '',
        required_role_ids: templateInfo.default_role_ids || [],
        // ── Requirements ──
        required_capabilities: templateInfo.required_capabilities || [],
        required_training_ids: templateInfo.required_training_ids || [],
        required_certification_ids: templateInfo.required_certification_ids || [],
        required_equipment_ids: templateInfo.required_equipment_ids || [],
      };
      // Only populate fields that aren't already manually set
      Object.entries(defaults).forEach(([key, val]) => {
        if (val !== null && val !== '' && !data[key]) {
          updateField(key, val);
        }
      });
      updateField('task_template_number', templateInfo.template_number);
      updateField('task_template_version', templateInfo.version || 1);
      updateField('template_defaults_snapshot', JSON.stringify(defaults));
    }
  }, [templateInfo]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" /> Task Template
        </Label>
        {isAuthorized && (
          <Button type="button" variant="ghost" size="sm" onClick={handleUseBlank} className="text-xs h-7">
            Use Blank Task
          </Button>
        )}
      </div>
      {/* Category filter — narrows the template dropdown (free-text TaskTemplate.category) */}
      {categories.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <Filter className="w-3 h-3" /> Category
          </Label>
          <Select value={selectedCategory || '__all'} onValueChange={(v) => setSelectedCategory(v === '__all' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All categories</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <RegistrySearchCombobox
        key={selectedCategory || 'all'}
        value={data.task_template_id || ''}
        onChange={handleSelect}
        searchFn={searchTemplates}
        resolveFn={resolveTemplates}
        placeholder="Search active templates…"
        includeDrafts={isAuthorized}
        extraFilters={extraFilters}
        onOpenRecord={(id) => window.open(`/templates/detail/${id}`, '_blank')}
      />
      {templateInfo && (
        <div className="rounded-md border p-3 space-y-2 bg-muted/30">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs">{templateInfo.template_number}</span>
            <Badge variant={isDraft ? 'destructive' : 'default'} className="text-xs">
              {templateInfo.status}
            </Badge>
            <span className="text-xs text-muted-foreground">v{templateInfo.version || 1}</span>
            {templateInfo.department_name_snapshot && (
              <span className="text-xs text-muted-foreground">· {templateInfo.department_name_snapshot}</span>
            )}
          </div>
          {isDraft && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600">
              <AlertTriangle className="w-3 h-3" />
              Draft template — authorized preview only. Must be approved and published for production use.
            </div>
          )}
          {templateInfo.description && (
            <p className="text-xs text-muted-foreground">{templateInfo.description}</p>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={handleClear} className="text-xs h-6 text-muted-foreground">
            <X className="w-3 h-3 mr-1" /> Remove template
          </Button>
        </div>
      )}
      {loading && <p className="text-xs text-muted-foreground">Loading template…</p>}
    </div>
  );
}