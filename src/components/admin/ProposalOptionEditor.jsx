import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Trash2, Award, Star, Crown, X } from 'lucide-react';
import { toast } from 'sonner';
import ServicePicker from '@/components/admin/ServicePicker';
import MaterialPicker from '@/components/admin/MaterialPicker';

const TIER_CONFIG = {
  good: { label: 'Good', icon: Award, color: 'text-blue-600 border-blue-300 bg-blue-50/50' },
  better: { label: 'Better', icon: Star, color: 'text-purple-600 border-purple-300 bg-purple-50/50' },
  best: { label: 'Best', icon: Crown, color: 'text-amber-600 border-amber-300 bg-amber-50/50' },
};

const EMPTY_OPTION = {
  template_name: '',
  is_active: true,
  linked_repair_recommendation_template_id: '',
  linked_repair_recommendation_template_name: '',
  proposal_level: 'good',
  option_title: '',
  customer_description: '',
  customer_benefits: '',
  recommended_service_catalog_id: '',
  recommended_service_name: '',
  included_services: '[]',
  optional_services: '[]',
  included_materials: '[]',
  internal_materials: '[]',
  estimated_duration: '',
  warranty_messaging: '',
  financing_available: false,
  display_order: 0,
  default_selected: false,
};

const parseJsonArray = (raw, fallback = []) => {
  if (Array.isArray(raw)) return raw;
  try { const arr = JSON.parse(raw || '[]'); return Array.isArray(arr) ? arr : fallback; }
  catch { return fallback; }
};

export default function ProposalOptionEditor({
  repairTemplateId,
  repairTemplateName,
  serviceCatalog,
  currentUserEmail,
}) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    if (!repairTemplateId) { setOptions([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await base44.entities.ProposalOptionTemplate
        .filter({ linked_repair_recommendation_template_id: repairTemplateId })
        .catch(() => []);
      data.sort((a, b) => {
        const order = { good: 0, better: 1, best: 2 };
        return (order[a.proposal_level] ?? 3) - (order[b.proposal_level] ?? 3)
          || (a.display_order || 0) - (b.display_order || 0);
      });
      setOptions(data);
    } catch (e) {
      toast.error('Failed to load proposal options');
    }
    setLoading(false);
  }, [repairTemplateId]);

  useEffect(() => { load(); }, [load]);

  const handleNew = (level) => {
    setEditing({
      ...EMPTY_OPTION,
      template_name: `${repairTemplateName || 'Template'} - ${TIER_CONFIG[level].label}`,
      linked_repair_recommendation_template_id: repairTemplateId,
      linked_repair_recommendation_template_name: repairTemplateName,
      proposal_level: level,
    });
  };

  const handleSave = async () => {
    const errors = [];
    if (!editing.option_title?.trim()) errors.push('Option title is required');

    const includedServices = parseJsonArray(editing.included_services);
    const optionalServices = parseJsonArray(editing.optional_services);
    const includedMaterials = parseJsonArray(editing.included_materials);
    const internalMaterials = parseJsonArray(editing.internal_materials);

    // Validate services reference valid catalog records
    const validateServices = (arr, label) => {
      arr.forEach((s, i) => {
        if (!s.service_catalog_id) errors.push(`${label} item ${i + 1}: missing service reference`);
      });
    };
    validateServices(includedServices, 'Included Services');
    validateServices(optionalServices, 'Optional Services');

    // Validate materials reference valid records and quantity > 0
    const validateMaterials = (arr, label) => {
      arr.forEach((m, i) => {
        if (!m.material_id) errors.push(`${label} item ${i + 1}: missing material reference`);
        if (!m.quantity || m.quantity <= 0) errors.push(`${label} item ${i + 1}: quantity must be greater than zero`);
      });
    };
    validateMaterials(includedMaterials, 'Included Materials');
    validateMaterials(internalMaterials, 'Internal Materials');

    if (errors.length > 0) {
      toast.error(errors.length === 1 ? errors[0] : `Please fix ${errors.length} validation issues:\n• ${errors.join('\n• ')}`);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...editing,
        template_name: editing.template_name || `${repairTemplateName} - ${TIER_CONFIG[editing.proposal_level].label}`,
        included_services: JSON.stringify(includedServices),
        optional_services: JSON.stringify(optionalServices),
        included_materials: JSON.stringify(includedMaterials),
        internal_materials: JSON.stringify(internalMaterials),
        display_order: Number(editing.display_order) || 0,
        created_by: currentUserEmail || '',
      };
      if (editing.id) {
        await base44.entities.ProposalOptionTemplate.update(editing.id, payload);
        toast.success('Option updated');
      } else {
        await base44.entities.ProposalOptionTemplate.create(payload);
        toast.success('Option created');
      }
      setEditing(null);
      load();
    } catch (e) {
      toast.error('Failed to save: ' + e.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this proposal option?')) return;
    try {
      await base44.entities.ProposalOptionTemplate.delete(id);
      toast.success('Option deleted');
      load();
    } catch (e) {
      toast.error('Failed to delete');
    }
  };

  // Helpers for editing JSON-backed fields as arrays
  const setServiceField = (field, arr) => {
    setEditing(prev => ({ ...prev, [field]: JSON.stringify(arr) }));
  };

  const setMaterialField = (field, arr) => {
    setEditing(prev => ({ ...prev, [field]: JSON.stringify(arr) }));
  };

  const setRecommendedService = (arr) => {
    const svc = arr[0] || null;
    setEditing(prev => ({
      ...prev,
      recommended_service_catalog_id: svc?.service_catalog_id || '',
      recommended_service_name: svc?.service_name || '',
    }));
  };

  const getRecommendedService = () => {
    if (!editing.recommended_service_catalog_id) return [];
    return [{
      service_catalog_id: editing.recommended_service_catalog_id,
      service_name: editing.recommended_service_name || '',
    }];
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold">Proposal Options</h4>
          <p className="text-xs text-muted-foreground">
            Configure Good / Better / Best packages for this repair template.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid sm:grid-cols-3 gap-3">
          {['good', 'better', 'best'].map(level => {
            const cfg = TIER_CONFIG[level];
            const Icon = cfg.icon;
            const tierOptions = options.filter(o => o.proposal_level === level);
            return (
              <Card key={level} className={`border ${cfg.color}`}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Icon className={`w-4 h-4 ${cfg.color.split(' ')[0]}`} />
                      <span className="font-semibold text-sm">{cfg.label}</span>
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleNew(level)}>
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {tierOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-2">No option configured</p>
                  ) : (
                    tierOptions.map(opt => (
                      <div key={opt.id} className="rounded border bg-white p-2 text-xs space-y-1">
                        <p className="font-medium">{opt.option_title}</p>
                        {opt.estimated_duration && (
                          <p className="text-muted-foreground">⏱ {opt.estimated_duration}</p>
                        )}
                        {opt.warranty_messaging && (
                          <p className="text-muted-foreground">🛡 {opt.warranty_messaging}</p>
                        )}
                        {opt.default_selected && (
                          <Badge className="text-[9px] py-0 px-1">Default</Badge>
                        )}
                        <div className="flex gap-1 pt-1">
                          <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1" onClick={() => setEditing(opt)}>Edit</Button>
                          <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1 text-red-600" onClick={() => handleDelete(opt.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && setEditing(null)}>
          <div className="bg-background rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                {(() => {
                  const cfg = TIER_CONFIG[editing.proposal_level];
                  const Icon = cfg.icon;
                  return <><Icon className={`w-4 h-4 ${cfg.color.split(' ')[0]}`} /> {cfg.label} Option</>;
                })()}
              </h3>
              <Button size="icon" variant="ghost" onClick={() => !saving && setEditing(null)}><X className="w-4 h-4" /></Button>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Option Title *</Label>
                <Input value={editing.option_title} onChange={e => setEditing(p => ({ ...p, option_title: e.target.value }))} placeholder="e.g. CrownSeal Application" />
              </div>
              <div>
                <Label>Customer Description</Label>
                <Textarea value={editing.customer_description || ''} onChange={e => setEditing(p => ({ ...p, customer_description: e.target.value }))} rows={2} />
              </div>
              <div>
                <Label>Customer Benefits</Label>
                <Textarea value={editing.customer_benefits || ''} onChange={e => setEditing(p => ({ ...p, customer_benefits: e.target.value }))} rows={2} />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Estimated Duration</Label>
                  <Input value={editing.estimated_duration || ''} onChange={e => setEditing(p => ({ ...p, estimated_duration: e.target.value }))} placeholder="e.g. Half day" />
                </div>
                <div>
                  <Label>Warranty Messaging</Label>
                  <Input value={editing.warranty_messaging || ''} onChange={e => setEditing(p => ({ ...p, warranty_messaging: e.target.value }))} placeholder="e.g. 5 year warranty" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch checked={editing.financing_available} onCheckedChange={v => setEditing(p => ({ ...p, financing_available: v }))} />
                  <Label className="text-sm">Financing Available</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={editing.default_selected} onCheckedChange={v => setEditing(p => ({ ...p, default_selected: v }))} />
                  <Label className="text-sm">Default Selected</Label>
                </div>
              </div>

              {/* Recommended Service */}
              <div>
                <Label className="text-sm font-medium">Recommended Service</Label>
                <p className="text-xs text-muted-foreground mb-1.5">Primary service for this option</p>
                <ServicePicker
                  services={serviceCatalog}
                  value={getRecommendedService()}
                  onChange={setRecommendedService}
                  multi={false}
                  placeholder="Search primary service..."
                />
              </div>

              {/* Included Services */}
              <div>
                <Label className="text-sm font-medium">Included Services</Label>
                <p className="text-xs text-muted-foreground mb-1.5">All services included in this option</p>
                <ServicePicker
                  services={serviceCatalog}
                  value={parseJsonArray(editing.included_services)}
                  onChange={arr => setServiceField('included_services', arr)}
                  multi={true}
                  placeholder="Search services to include..."
                />
              </div>

              {/* Optional Services */}
              <div>
                <Label className="text-sm font-medium">Optional Services</Label>
                <p className="text-xs text-muted-foreground mb-1.5">Add-ons the technician can offer</p>
                <ServicePicker
                  services={serviceCatalog}
                  value={parseJsonArray(editing.optional_services)}
                  onChange={arr => setServiceField('optional_services', arr)}
                  multi={true}
                  placeholder="Search optional services..."
                />
              </div>

              {/* Included Materials */}
              <div>
                <Label className="text-sm font-medium">Included Materials</Label>
                <p className="text-xs text-muted-foreground mb-1.5">Customer-facing materials included in this option</p>
                <MaterialPicker
                  value={parseJsonArray(editing.included_materials)}
                  onChange={arr => setMaterialField('included_materials', arr)}
                  defaultChargeable={true}
                  placeholder="Search materials to include..."
                />
              </div>

              {/* Internal Materials */}
              <div>
                <Label className="text-sm font-medium">Internal Materials</Label>
                <p className="text-xs text-muted-foreground mb-1.5">Non-chargeable materials tracked internally only</p>
                <MaterialPicker
                  value={parseJsonArray(editing.internal_materials)}
                  onChange={arr => setMaterialField('internal_materials', arr)}
                  defaultChargeable={false}
                  placeholder="Search internal materials..."
                />
              </div>

              <div>
                <Label>Display Order</Label>
                <Input type="number" value={editing.display_order || 0} onChange={e => setEditing(p => ({ ...p, display_order: e.target.value }))} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => !saving && setEditing(null)} disabled={saving}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {editing.id ? 'Update' : 'Create'} Option
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}