import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Link2, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';
import LinkedResourcesPanel from '@/components/resources/LinkedResourcesPanel';

const EMPTY_FORM = {
  template_name: '',
  is_active: true,
  template_status: 'draft',
  priority: 'medium',
  inspection_category: '',
  inspection_section: '',
  inspection_form_type: '',
  deficiency_type: '',
  finding_keywords: '',
  failed_question_keywords: '',
  severity: '',
  appliance_type: '',
  chimney_system_type: '',
  disposition_default: '',
  customer_facing_recommendation: '',
  customer_summary: '',
  recommended_solution: '',
  internal_notes: '',
  safety_notes: '',
  code_reference_notes: '',
  default_estimate_required: true,
  service_catalog_id: '',
  service_name: '',
  service_code: '',
  service_category: '',
  service_description: '',
  customer_description: '',
  default_selling_price: 0,
  estimated_time_hours: 0,
  estimated_time_minutes: 0,
  pricing_mode: 'service_catalog_price',
  estimate_price: '',
  service_commission_type: 'none',
  service_commission_value: 0,
  materials_required: false,
  default_materials: '',
  optional_materials: '',
  internal_materials: '',
  inspection_forms: [],
  homeowner_risk: '',
  ai_sales_talking_points: '',
  warranty_notes: '',
  ai_inspection_best_practices: '',
  ai_technical_notes: '',
  ai_objection_handling: '',
  ai_upsell_opportunities: '',
  ai_cross_sell_opportunities: '',
  training_video_urls: '',
  reference_documents: '',
  code_references: '',
  manufacturer_references: '',
  sort_order: 0,
  material_resolution_mode: 'fixed_list',
  material_calculation_type: 'none',
};

const SEVERITIES = [
  { value: '__none__', label: 'All Severities' },
  { value: 'info', label: 'Info' },
  { value: 'minor', label: 'Minor' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'major', label: 'Major' },
  { value: 'critical', label: 'Critical' },
];

const COMMISSION_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'percentage', label: 'Percentage (%)' },
  { value: 'flat_dollar', label: 'Flat Dollar ($)' },
];

const DISPOSITIONS = [
  { value: '__none__', label: '— None —' },
  { value: 'repair_recommended', label: 'Repair Recommended' },
  { value: 'safety_concern', label: 'Safety Concern' },
  { value: 'code_violation', label: 'Code Violation' },
  { value: 'monitor', label: 'Monitor' },
  { value: 'maintenance_only', label: 'Maintenance Only' },
  { value: 'no_action_required', label: 'No Action Required' },
];

const TEMPLATE_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'testing', label: 'Testing' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const PRICING_MODES = [
  { value: 'service_catalog_price', label: 'Service Catalog Price' },
  { value: 'template_override_price', label: 'Fixed Price (Template)' },
  { value: 'manual_review_required', label: 'Dynamic (Service Config Engine)' },
];

const HOMEOWNER_RISK_OPTIONS = [
  { value: '__none__', label: '— None —' },
  { value: 'low', label: 'Low' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high', label: 'High' },
  { value: 'immediate_safety', label: 'Immediate Safety' },
];

const MATERIAL_RESOLUTION_MODES = [
  { value: 'fixed_list', label: 'Fixed Material List' },
  { value: 'measurement_lookup', label: 'Measurement-Driven Lookup' },
];

const MATERIAL_CALC_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'crown_concrete_replacement', label: 'Crown Concrete Replacement' },
];

export default function RepairRecommendationTemplateDialog({
  open, onClose, onSaved, template, serviceCatalog, currentUserEmail,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [estimatePriceError, setEstimatePriceError] = useState(false);
  const estimatePriceRef = useRef(null);

  useEffect(() => {
    if (template) {
      setForm({ ...EMPTY_FORM, ...template });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [template, open]);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open, template]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onClose());

  const update = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleServiceSelect = (serviceId) => {
    if (!serviceId || serviceId === 'none') {
      update('service_catalog_id', '');
      return;
    }
    const svc = serviceCatalog.find(s => s.id === serviceId);
    if (!svc) return;
    setForm(prev => ({
      ...prev,
      service_catalog_id: svc.id,
      service_name: svc.service_name || '',
      service_code: svc.service_code || '',
      service_category: svc.category || '',
      service_description: svc.description || '',
      customer_description: svc.customer_description || '',
      default_selling_price: svc.default_selling_price || 0,
      estimated_time_hours: svc.estimated_time_hours || 0,
      estimated_time_minutes: svc.estimated_time_minutes || 0,
      service_commission_type: svc.service_commission_type || 'none',
      service_commission_value: svc.service_commission_value || 0,
    }));
  };

  const handleUnlinkService = () => {
    update('service_catalog_id', '');
  };

  const handleServiceSelectFromSearch = (svc) => {
    setForm(prev => ({
      ...prev,
      service_catalog_id: svc.id,
      service_name: svc.service_name || '',
      service_code: svc.service_code || '',
      service_category: svc.category || '',
      service_description: svc.description || '',
      customer_description: svc.customer_description || '',
      default_selling_price: svc.default_selling_price || 0,
      estimated_time_hours: svc.estimated_time_hours || 0,
      estimated_time_minutes: svc.estimated_time_minutes || 0,
      service_commission_type: svc.service_commission_type || 'none',
      service_commission_value: svc.service_commission_value || 0,
    }));
    console.log('[RepairTemplateDialog] Service linked:', { id: svc.id, name: svc.service_name });
  };

  const serviceSearchFn = async (searchTerm) => {
    const res = await base44.functions.invoke('searchServiceCatalog', { search: searchTerm, limit: 50 });
    return res.data?.items || [];
  };

  const handleInspectionFormsChange = (forms) => {
    setForm(prev => ({
      ...prev,
      inspection_forms: forms,
      inspection_form_type: forms.length > 0 ? forms.join(', ') : '',
    }));
  };

  const handleSave = async () => {
    if (!form.template_name?.trim()) {
      toast.error('Template name is required');
      return;
    }

    // pricing_mode-gated validation: fixed price requires a valid estimate_price
    const isFixedPrice = form.pricing_mode === 'template_override_price';
    const estimatePriceNum = Number(form.estimate_price);
    if (isFixedPrice && (!form.estimate_price || isNaN(estimatePriceNum) || estimatePriceNum <= 0)) {
      setEstimatePriceError(true);
      toast.error('Estimate Price is required for Fixed Price mode');
      estimatePriceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => estimatePriceRef.current?.focus(), 300);
      return;
    }
    setEstimatePriceError(false);

    setSaving(true);
    try {
      const payload = { ...form };
      // estimate_price is only meaningful for fixed price; otherwise clear it so the
      // backend never receives a stale value for dynamic / service_catalog modes.
      payload.estimate_price = isFixedPrice ? (Number(form.estimate_price) || 0) : 0;
      payload.default_selling_price = Number(payload.default_selling_price) || 0;
      payload.estimated_time_hours = Number(payload.estimated_time_hours) || 0;
      payload.estimated_time_minutes = Number(payload.estimated_time_minutes) || 0;
      payload.service_commission_value = Number(payload.service_commission_value) || 0;
      payload.sort_order = Number(payload.sort_order) || 0;
      payload.updated_by = currentUserEmail || '';

      // Sync is_active with template_status for backwards compatibility
      payload.is_active = payload.template_status === 'active';

      const safeJsonCount = (raw) => {
        if (!raw) return 0;
        try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr.length : 0; } catch { return 0; }
      };
      console.log('[RepairTemplateDialog] Saving template:', {
        templateId: template?.id,
        service_catalog_id: payload.service_catalog_id,
        default_materials_count: safeJsonCount(payload.default_materials),
        optional_materials_count: safeJsonCount(payload.optional_materials),
        internal_materials_count: safeJsonCount(payload.internal_materials),
      });
      if (template) {
        await base44.entities.RepairRecommendationTemplate.update(template.id, payload);
        console.log('[RepairTemplateDialog] Template updated successfully:', template.id);
        toast.success('Template updated');
      } else {
        payload.created_by = currentUserEmail || '';
        const created = await base44.entities.RepairRecommendationTemplate.create(payload);
        console.log('[RepairTemplateDialog] Template created successfully:', created.id);
        toast.success('Template created');
      }
      onSaved();
      onClose();
    } catch (e) {
      const status = e?.response?.status;
      const data = e?.response?.data;
      const backendMsg =
        (data && (data.detail || data.error || data.message)) ||
        (typeof data === 'string' ? data : null) ||
        e.message;
      if (status === 422) {
        toast.error('Validation error: ' + backendMsg);
      } else {
        toast.error('Failed to save: ' + backendMsg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto" onCloseAttempt={handleCloseAttempt}>
        <DialogHeader>
          <DialogTitle>{template ? 'Edit Repair Recommendation Template' : 'New Repair Recommendation Template'}</DialogTitle>
        </DialogHeader>
        {template?.id && (
          <LinkedResourcesPanel entityType="RepairRecommendationTemplate" entityId={template.id} title="Product Resources" />
        )}

        <div className="space-y-5">
          {/* Basic Information */}
          <Section title="Basic Information">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Template Name" required>
                <Input value={form.template_name || ''} onChange={e => update('template_name', e.target.value)} placeholder="e.g. Cracked Crown → Crown Seal" />
              </Field>
              <Field label="Template Status">
                <Select value={form.template_status || 'draft'} onValueChange={v => update('template_status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={form.priority || 'medium'} onValueChange={v => update('priority', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Active">
                <div className="pt-2"><Switch checked={form.is_active !== false} onCheckedChange={v => update('is_active', v)} /></div>
              </Field>
            </div>
          </Section>

          {/* Inspection Matching */}
          <Section title="Inspection Matching">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Inspection Category">
                <Input value={form.inspection_category || ''} onChange={e => update('inspection_category', e.target.value)} placeholder="e.g. Chimney Crown" />
              </Field>
              <Field label="Inspection Section">
                <Input value={form.inspection_section || ''} onChange={e => update('inspection_section', e.target.value)} placeholder="e.g. exterior" />
              </Field>
              <Field label="Deficiency Type">
                <Input value={form.deficiency_type || ''} onChange={e => update('deficiency_type', e.target.value)} placeholder="e.g. cracked_crown" />
              </Field>
              <Field label="Severity Filter">
                <Select value={form.severity || '__none__'} onValueChange={v => update('severity', v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="All Severities" /></SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Appliance Type">
                <Input value={form.appliance_type || ''} onChange={e => update('appliance_type', e.target.value)} placeholder="e.g. fireplace" />
              </Field>
              <Field label="Chimney System Type">
                <Input value={form.chimney_system_type || ''} onChange={e => update('chimney_system_type', e.target.value)} placeholder="e.g. masonry" />
              </Field>
            </div>
            <Field label="Inspection Forms" hint="Comma-separated form names">
              <Input
                value={Array.isArray(form.inspection_forms) ? form.inspection_forms.join(', ') : ''}
                onChange={e => handleInspectionFormsChange(e.target.value.split(',').map(f => f.trim()).filter(Boolean))}
                placeholder="interior, exterior"
              />
            </Field>
            <Field label="Finding Keywords" hint="Comma-separated keywords matched against finding title/location/description">
              <Input value={form.finding_keywords || ''} onChange={e => update('finding_keywords', e.target.value)} placeholder="crack, crown, deteriorated" />
            </Field>
            <Field label="Failed Question Keywords" hint="Comma-separated keywords matched against the failed inspection question text">
              <Input value={form.failed_question_keywords || ''} onChange={e => update('failed_question_keywords', e.target.value)} placeholder="crown_condition, crack" />
            </Field>
          </Section>

          {/* Disposition & Customer Communication */}
          <Section title="Disposition & Customer Communication">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Default Disposition">
                <Select value={form.disposition_default || '__none__'} onValueChange={v => update('disposition_default', v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="— None —" /></SelectTrigger>
                  <SelectContent>
                    {DISPOSITIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Homeowner Risk">
                <Select value={form.homeowner_risk || '__none__'} onValueChange={v => update('homeowner_risk', v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="— None —" /></SelectTrigger>
                  <SelectContent>
                    {HOMEOWNER_RISK_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Customer-Facing Recommendation">
              <Textarea rows={2} value={form.customer_facing_recommendation || ''} onChange={e => update('customer_facing_recommendation', e.target.value)} placeholder="Pre-written recommendation shown to customer" />
            </Field>
            <Field label="Customer Summary">
              <Textarea rows={2} value={form.customer_summary || ''} onChange={e => update('customer_summary', e.target.value)} placeholder="Customer-facing explanation prefilled into Recommendation Review" />
            </Field>
            <Field label="Recommended Solution">
              <Textarea rows={2} value={form.recommended_solution || ''} onChange={e => update('recommended_solution', e.target.value)} placeholder="Description of the recommended repair or solution" />
            </Field>
            <Field label="Customer Description">
              <Textarea rows={2} value={form.customer_description || ''} onChange={e => update('customer_description', e.target.value)} placeholder="Customer-facing service description" />
            </Field>
          </Section>

          {/* Service & Pricing */}
          <Section title="Service & Pricing">
            <Field label="Linked Service Catalog Item">
              {form.service_catalog_id ? (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-green-700 border-green-300 gap-1">
                    <Link2 className="w-3 h-3" /> {form.service_name || 'Service Linked'}
                  </Badge>
                  <Button type="button" variant="ghost" size="sm" onClick={handleUnlinkService} className="text-red-600 gap-1">
                    <Unlink className="w-3 h-3" /> Unlink
                  </Button>
                </div>
              ) : (
                <Select value="none" onValueChange={handleServiceSelect}>
                  <SelectTrigger><SelectValue placeholder="Select a service..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {(serviceCatalog || []).filter(s => s.id).map(s => <SelectItem key={s.id} value={s.id}>{s.service_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Service Name">
                <Input value={form.service_name || ''} onChange={e => update('service_name', e.target.value)} placeholder="Auto-filled from linked service" />
              </Field>
              <Field label="Service Code">
                <Input value={form.service_code || ''} onChange={e => update('service_code', e.target.value)} placeholder="Auto-filled from linked service" />
              </Field>
              <Field label="Pricing Mode">
                <Select value={form.pricing_mode || 'service_catalog_price'} onValueChange={v => update('pricing_mode', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRICING_MODES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Estimate Price ($)" hint="Required for Fixed Price mode">
                <Input
                  ref={estimatePriceRef}
                  type="number"
                  value={form.estimate_price || ''}
                  onChange={e => update('estimate_price', parseFloat(e.target.value) || 0)}
                  className={estimatePriceError ? 'border-red-500 ring-1 ring-red-500' : ''}
                  disabled={form.pricing_mode !== 'template_override_price'}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Default Selling Price ($)">
                <Input type="number" value={form.default_selling_price || 0} onChange={e => update('default_selling_price', parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="Commission Type">
                <Select value={form.service_commission_type || 'none'} onValueChange={v => update('service_commission_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMMISSION_TYPES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Estimated Time (Hours)">
                <Input type="number" value={form.estimated_time_hours || 0} onChange={e => update('estimated_time_hours', parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="Estimated Time (Minutes)">
                <Input type="number" value={form.estimated_time_minutes || 0} onChange={e => update('estimated_time_minutes', parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="Commission Value">
                <Input type="number" value={form.service_commission_value || 0} onChange={e => update('service_commission_value', parseFloat(e.target.value) || 0)} />
              </Field>
            </div>
          </Section>

          {/* Materials */}
          <Section title="Materials">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Material Resolution Mode">
                <Select value={form.material_resolution_mode || 'fixed_list'} onValueChange={v => update('material_resolution_mode', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MATERIAL_RESOLUTION_MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Material Calculation Type">
                <Select value={form.material_calculation_type || 'none'} onValueChange={v => update('material_calculation_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MATERIAL_CALC_TYPES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Default Materials (JSON)" hint="JSON array of {material_id, material_name, quantity, unit, unit_price, chargeable_to_customer, customer_visible}">
              <Textarea rows={3} value={form.default_materials || ''} onChange={e => update('default_materials', e.target.value)} placeholder="[]" className="font-mono text-xs" />
            </Field>
            <Field label="Optional Materials (JSON)">
              <Textarea rows={2} value={form.optional_materials || ''} onChange={e => update('optional_materials', e.target.value)} placeholder="[]" className="font-mono text-xs" />
            </Field>
            <Field label="Internal Materials (JSON)">
              <Textarea rows={2} value={form.internal_materials || ''} onChange={e => update('internal_materials', e.target.value)} placeholder="[]" className="font-mono text-xs" />
            </Field>
          </Section>

          {/* Internal Notes & References */}
          <Section title="Internal Notes & References">
            <Field label="Internal Notes">
              <Textarea rows={2} value={form.internal_notes || ''} onChange={e => update('internal_notes', e.target.value)} />
            </Field>
            <Field label="Safety Notes">
              <Textarea rows={2} value={form.safety_notes || ''} onChange={e => update('safety_notes', e.target.value)} />
            </Field>
            <Field label="Code Reference Notes" hint="e.g. NFPA 211 §13.1, IRC R1003">
              <Textarea rows={2} value={form.code_reference_notes || ''} onChange={e => update('code_reference_notes', e.target.value)} />
            </Field>
            <Field label="Warranty Notes">
              <Textarea rows={2} value={form.warranty_notes || ''} onChange={e => update('warranty_notes', e.target.value)} />
            </Field>
          </Section>

          {/* AI Knowledge Objects */}
          <Section title="AI Knowledge Objects">
            <Field label="AI Sales Talking Points">
              <Textarea rows={2} value={form.ai_sales_talking_points || ''} onChange={e => update('ai_sales_talking_points', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Inspection Best Practices">
                <Textarea rows={2} value={form.ai_inspection_best_practices || ''} onChange={e => update('ai_inspection_best_practices', e.target.value)} />
              </Field>
              <Field label="Technical Notes">
                <Textarea rows={2} value={form.ai_technical_notes || ''} onChange={e => update('ai_technical_notes', e.target.value)} />
              </Field>
              <Field label="Objection Handling">
                <Textarea rows={2} value={form.ai_objection_handling || ''} onChange={e => update('ai_objection_handling', e.target.value)} />
              </Field>
              <Field label="Upsell Opportunities">
                <Textarea rows={2} value={form.ai_upsell_opportunities || ''} onChange={e => update('ai_upsell_opportunities', e.target.value)} />
              </Field>
              <Field label="Cross-Sell Opportunities">
                <Textarea rows={2} value={form.ai_cross_sell_opportunities || ''} onChange={e => update('ai_cross_sell_opportunities', e.target.value)} />
              </Field>
              <Field label="Training Video URLs (JSON)">
                <Textarea rows={2} value={form.training_video_urls || ''} onChange={e => update('training_video_urls', e.target.value)} placeholder='[{"title":"...","url":"..."}]' className="font-mono text-xs" />
              </Field>
              <Field label="Reference Documents (JSON)">
                <Textarea rows={2} value={form.reference_documents || ''} onChange={e => update('reference_documents', e.target.value)} placeholder='[{"title":"...","url":"..."}]' className="font-mono text-xs" />
              </Field>
              <Field label="Code References (JSON)">
                <Textarea rows={2} value={form.code_references || ''} onChange={e => update('code_references', e.target.value)} placeholder='[{"code":"...","section":"...","description":"..."}]' className="font-mono text-xs" />
              </Field>
              <Field label="Manufacturer References (JSON)">
                <Textarea rows={2} value={form.manufacturer_references || ''} onChange={e => update('manufacturer_references', e.target.value)} placeholder='[{"manufacturer":"...","product":"...","url":"..."}]' className="font-mono text-xs" />
              </Field>
            </div>
          </Section>

          {/* Other Settings */}
          <Section title="Other Settings">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Default Estimate Required">
                <div className="pt-2"><Switch checked={form.default_estimate_required !== false} onCheckedChange={v => update('default_estimate_required', v)} /></div>
              </Field>
              <Field label="Sort Order">
                <Input type="number" value={form.sort_order || 0} onChange={e => update('sort_order', parseInt(e.target.value) || 0)} />
              </Field>
            </div>
          </Section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCloseAttempt} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {template ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <DirtyCloseWarning
      open={showWarning}
      onContinueEditing={cancelDiscard}
      onDiscardChanges={confirmDiscard}
    />
    </>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, hint, required, children }) {
  return (
    <div>
      <Label className="text-sm font-medium flex items-center gap-1">
        {label}
        {required && <span className="text-red-500">*</span>}
      </Label>
      {hint && <p className="text-xs text-muted-foreground mb-1">{hint}</p>}
      <div className="mt-1">{children}</div>
    </div>
  );
}