import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Search, Plus, Trash2, DollarSign, Clock, Percent, ChevronDown, ChevronUp, ShoppingCart, Wrench, CheckCircle2 } from 'lucide-react';
import {
  calculateCommissionBreakdown,
  calculateTotalLaborTime,
  formatTimeDisplay,
  formatCommission,
  buildEstimateLineItems,
} from '@/lib/commissionEngine';
import { ServiceThumbnail } from '@/components/services/ServiceImage';

export default function ServiceEstimateBuilder({
  open, onClose, onComplete, jobId, estimate, existingEstimate,
}) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedServices, setSelectedServices] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    loadServices();
    if (existingEstimate) {
      try {
        const items = typeof existingEstimate.line_items === 'string'
          ? JSON.parse(existingEstimate.line_items)
          : existingEstimate.line_items;
        if (items?.services) setSelectedServices(items.services);
        if (items?.materials) setMaterials(items.materials);
      } catch { /* ignore */ }
    } else {
      setSelectedServices([]);
      setMaterials([]);
    }
  }, [open, existingEstimate]);

  const loadServices = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.ServiceCatalog.filter({ is_active: true });
      data.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      setServices(data);
    } catch (e) {
      console.error('Failed to load services:', e);
    } finally {
      setLoading(false);
    }
  };

  const categories = useMemo(
    () => [...new Set(services.map(s => s.category).filter(Boolean))],
    [services]
  );

  const filteredServices = useMemo(() => {
    return services.filter(s => {
      const matchSearch = !search ||
        s.service_name?.toLowerCase().includes(search.toLowerCase()) ||
        s.service_code?.toLowerCase().includes(search.toLowerCase());
      const matchCategory = categoryFilter === 'all' || s.category === categoryFilter;
      return matchSearch && matchCategory;
    });
  }, [services, search, categoryFilter]);

  const breakdown = useMemo(
    () => calculateCommissionBreakdown(selectedServices, materials),
    [selectedServices, materials]
  );

  const laborTime = useMemo(
    () => calculateTotalLaborTime(selectedServices),
    [selectedServices]
  );

  const handleSelectService = (svc) => {
    setSelectedServices(prev => [...prev, {
      service_catalog_id: svc.id,
      service_name: svc.service_name,
      service_code: svc.service_code || '',
      category: svc.category || '',
      customer_description: svc.customer_description || '',
      selling_price: svc.default_selling_price || 0,
      quantity: 1,
      estimated_time_hours: svc.estimated_time_hours || 0,
      estimated_time_minutes: svc.estimated_time_minutes || 0,
      adjusted_labor_hours: 0,
      service_commission_type: svc.service_commission_type || 'none',
      service_commission_value: svc.service_commission_value || 0,
      allow_labor_adjustment: svc.allow_labor_adjustment !== false,
      minimum_labor_hours: svc.minimum_labor_hours || 0,
      maximum_labor_hours: svc.maximum_labor_hours || 0,
    }]);
  };

  const handleRemoveService = (idx) => {
    setSelectedServices(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateService = (idx, updates) => {
    setSelectedServices(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));
  };

  const handleAddMaterial = (matData) => {
    setMaterials(prev => [...prev, matData]);
  };

  const handleRemoveMaterial = (idx) => {
    setMaterials(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateMaterial = (idx, updates) => {
    setMaterials(prev => prev.map((m, i) => i === idx ? { ...m, ...updates } : m));
  };

  const handleSaveEstimate = async () => {
    if (selectedServices.length === 0) return;
    setSaving(true);
    try {
      const lineItems = buildEstimateLineItems(selectedServices, materials);
      const subtotal = breakdown.totalRevenue;

      const estimateData = {
        job_id: jobId,
        customer_name: estimate?.customer_name || '',
        customer_id: estimate?.customer_id || '',
        line_items: JSON.stringify(lineItems),
        subtotal,
        total: subtotal,
        status: 'draft',
      };

      if (existingEstimate) {
        await base44.entities.Estimate.update(existingEstimate.id, {
          line_items: JSON.stringify(lineItems),
          subtotal,
          total: subtotal,
        });
      } else {
        await base44.entities.Estimate.create(estimateData);
      }

      onComplete?.(lineItems);
      onClose?.();
    } catch (e) {
      console.error('Save estimate failed:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose?.(); }}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-accent" />
              Service-Based Estimate Builder
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Service Selection */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-1">
                  <Plus className="w-4 h-4" /> Select Services
                </h3>
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-3 flex flex-wrap gap-2 items-center">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search services..."
                        className="pl-9"
                      />
                    </div>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>

                {filteredServices.length > 0 && (
                  <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {filteredServices.map(svc => {
                      const alreadySelected = selectedServices.some(s => s.service_catalog_id === svc.id);
                      return (
                        <button
                          key={svc.id}
                          onClick={() => !alreadySelected && handleSelectService(svc)}
                          disabled={alreadySelected}
                          className={`text-left p-3 rounded-lg border transition-colors ${
                            alreadySelected
                              ? 'border-green-200 bg-green-50 opacity-60'
                              : 'border-input bg-background hover:bg-accent/5'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-sm font-medium truncate">{svc.service_name}</span>
                            {alreadySelected && <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />}
                          </div>
                          <div className="flex items-start gap-2 mt-1">
                            <ServiceThumbnail src={svc.service_image} alt={svc.service_name} size="sm" />
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-0.5">
                                <DollarSign className="w-3 h-3" />
                                ${(svc.default_selling_price || 0).toFixed(2)}
                              </span>
                              {(svc.estimated_time_hours > 0 || svc.estimated_time_minutes > 0) && (
                                <span className="flex items-center gap-0.5">
                                  <Clock className="w-3 h-3" />
                                  {formatTimeDisplay(svc.estimated_time_hours, svc.estimated_time_minutes)}
                                </span>
                              )}
                            </div>
                          </div>
                          {svc.category && (
                            <Badge variant="outline" className="mt-1 text-xs">{svc.category}</Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Selected Services */}
              {selectedServices.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Selected Services ({selectedServices.length})</h3>
                  {selectedServices.map((svc, idx) => (
                    <ServiceLineItem
                      key={idx}
                      service={svc}
                      onRemove={() => handleRemoveService(idx)}
                      onUpdate={(updates) => handleUpdateService(idx, updates)}
                    />
                  ))}
                </div>
              )}

              {/* Materials Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-1">
                    <ShoppingCart className="w-4 h-4" /> Materials ({materials.length})
                  </h3>
                  <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setMaterialDialogOpen(true)}>
                    <Plus className="w-3 h-3" /> Add Material
                  </Button>
                </div>
                {materials.length > 0 ? (
                  <div className="space-y-2">
                    {materials.map((mat, idx) => (
                      <MaterialLineItem
                        key={idx}
                        material={mat}
                        onRemove={() => handleRemoveMaterial(idx)}
                        onUpdate={(updates) => handleUpdateMaterial(idx, updates)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No materials added. Materials are optional.</p>
                )}
              </div>

              {/* Summary */}
              <EstimateSummaryCard
                services={selectedServices}
                materials={materials}
                breakdown={breakdown}
                laborTime={laborTime}
              />

              <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                <Button onClick={handleSaveEstimate} disabled={saving || selectedServices.length === 0} className="gap-1">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Create Estimate
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <MaterialAddDialog
        open={materialDialogOpen}
        onClose={() => setMaterialDialogOpen(false)}
        onAdd={(matData) => {
          handleAddMaterial(matData);
          setMaterialDialogOpen(false);
        }}
        defaultMaterialCommissionType={selectedServices[0]?.service_commission_type || 'none'}
        defaultMaterialCommissionValue={0}
      />
    </>
  );
}

function ServiceLineItem({ service, onRemove, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const commission = calculateCommissionBreakdown([service], []);

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex gap-3 flex-1">
            <ServiceThumbnail src={service.service_image} alt={service.service_name} size="md" />
            <div>
              <h4 className="font-medium text-sm">{service.service_name}</h4>
              {service.service_code && (
                <span className="text-xs text-muted-foreground font-mono">{service.service_code}</span>
              )}
            </div>
          </div>
          <Button size="sm" variant="ghost" className="text-destructive h-7 w-7 p-0" onClick={onRemove}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="grid sm:grid-cols-3 gap-2 mt-2">
          <div>
            <Label className="text-xs">Price</Label>
            <Input
              type="number"
              step="0.01"
              value={service.selling_price}
              onChange={e => onUpdate({ selling_price: Number(e.target.value) })}
              className="text-sm h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Qty</Label>
            <Input
              type="number"
              value={service.quantity}
              onChange={e => onUpdate({ quantity: Number(e.target.value) })}
              className="text-sm h-8"
              min="1"
            />
          </div>
          <div>
            <Label className="text-xs">Line Total</Label>
            <div className="text-sm font-semibold pt-1.5">${(service.selling_price * service.quantity).toFixed(2)}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTimeDisplay(service.estimated_time_hours, service.estimated_time_minutes)}
          </span>
          <span className="flex items-center gap-1">
            <Percent className="w-3 h-3" />
            {formatCommission(service.service_commission_type, service.service_commission_value)}
          </span>
          <Badge variant="outline" className="text-xs">
            Commission: ${commission.serviceCommission.toFixed(2)}
          </Badge>
        </div>

        {service.allow_labor_adjustment && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-blue-600 mt-2"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Labor Adjustment
          </button>
        )}

        {expanded && service.allow_labor_adjustment && (
          <div className="mt-2 grid sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Adjusted Labor Hours</Label>
              <Input
                type="number"
                step="0.25"
                value={service.adjusted_labor_hours || 0}
                onChange={e => onUpdate({ adjusted_labor_hours: Number(e.target.value) })}
                className="text-sm h-8"
              />
            </div>
            <div className="text-xs text-muted-foreground pt-5">
              {service.minimum_labor_hours > 0 && `Min: ${service.minimum_labor_hours}h | `}
              {service.maximum_labor_hours > 0 && `Max: ${service.maximum_labor_hours}h`}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MaterialLineItem({ material, onRemove, onUpdate }) {
  return (
    <Card className={`border-0 shadow-sm ${!material.chargeable_to_customer ? 'bg-gray-50/50' : ''}`}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-sm">{material.material_name}</h4>
              {material.chargeable_to_customer ? (
                <Badge className="text-xs bg-green-100 text-green-700">Customer Chargeable</Badge>
              ) : (
                <Badge className="text-xs bg-gray-200 text-gray-600">Internal Material</Badge>
              )}
            </div>
          </div>
          <Button size="sm" variant="ghost" className="text-destructive h-7 w-7 p-0" onClick={onRemove}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="grid sm:grid-cols-4 gap-2 mt-2">
          <div>
            <Label className="text-xs">Qty</Label>
            <Input
              type="number"
              value={material.quantity}
              onChange={e => onUpdate({ quantity: Number(e.target.value) })}
              className="text-sm h-8"
              min="1"
            />
          </div>
          <div>
            <Label className="text-xs">Unit Price</Label>
            <Input
              type="number"
              step="0.01"
              value={material.unit_price}
              onChange={e => onUpdate({ unit_price: Number(e.target.value) })}
              className="text-sm h-8"
              disabled={!material.chargeable_to_customer}
            />
          </div>
          <div>
            <Label className="text-xs">Line Total</Label>
            <div className="text-sm font-semibold pt-1.5">
              ${(material.unit_price * material.quantity).toFixed(2)}
            </div>
          </div>
          <div>
            <Label className="text-xs">Commission</Label>
            <div className="text-xs pt-2">
              {formatCommission(material.commission_type, material.commission_value)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-2">
          <label className="flex items-center gap-1 text-xs cursor-pointer">
            <Switch
              checked={material.chargeable_to_customer}
              onCheckedChange={v => onUpdate({ chargeable_to_customer: v })}
            />
            Chargeable
          </label>
          <label className="flex items-center gap-1 text-xs cursor-pointer">
            <Switch
              checked={material.customer_visible}
              onCheckedChange={v => onUpdate({ customer_visible: v })}
              disabled={!material.chargeable_to_customer}
            />
            Customer Visible
          </label>
        </div>

        {material.chargeable_to_customer && (
          <div className="grid sm:grid-cols-2 gap-2 mt-2">
            <div>
              <Label className="text-xs">Material Commission Type</Label>
              <Select
                value={material.commission_type || 'none'}
                onValueChange={v => onUpdate({ commission_type: v })}
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Commission</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="flat_dollar">Flat Dollar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Commission Value</Label>
              <Input
                type="number"
                step="0.01"
                value={material.commission_value || 0}
                onChange={e => onUpdate({ commission_value: Number(e.target.value) })}
                className="text-sm h-8"
                disabled={material.commission_type === 'none'}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EstimateSummaryCard({ services, materials, breakdown, laborTime }) {
  if (services.length === 0 && materials.length === 0) return null;

  const chargeableMats = materials.filter(m => m.chargeable_to_customer);
  const internalMats = materials.filter(m => !m.chargeable_to_customer);

  return (
    <Card className="border-2 border-accent/20 shadow-sm">
      <CardContent className="p-4 space-y-3">
        <h3 className="font-semibold text-sm flex items-center gap-1">
          <DollarSign className="w-4 h-4 text-accent" /> Estimate Summary
        </h3>

        {/* Services */}
        {services.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Services</p>
            {services.map((s, i) => (
              <div key={i} className="flex justify-between text-sm py-0.5">
                <span>{s.service_name}</span>
                <span className="font-medium">${(s.selling_price * s.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Materials */}
        {chargeableMats.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Materials (Customer Chargeable)</p>
            {chargeableMats.map((m, i) => (
              <div key={i} className="flex justify-between text-sm py-0.5">
                <span>{m.material_name}</span>
                <span className="font-medium">${(m.unit_price * m.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        {internalMats.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Internal Materials (Non-Chargeable)</p>
            {internalMats.map((m, i) => (
              <div key={i} className="flex justify-between text-sm py-0.5 text-gray-400">
                <span>{m.material_name}</span>
                <span>Internal</span>
              </div>
            ))}
          </div>
        )}

        {/* Labor */}
        <div className="flex justify-between text-sm py-1 border-t">
          <span className="text-muted-foreground">Total Estimated Time</span>
          <span className="font-medium">{laborTime.display}</span>
        </div>

        {/* Totals */}
        <div className="flex justify-between text-sm py-1">
          <span className="text-muted-foreground">Service Revenue</span>
          <span className="font-medium">${breakdown.serviceRevenue.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm py-1">
          <span className="text-muted-foreground">Material Revenue</span>
          <span className="font-medium">${breakdown.materialRevenue.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-base font-bold py-1 border-t">
          <span>Total</span>
          <span>${breakdown.totalRevenue.toFixed(2)}</span>
        </div>

        {/* Commission Summary */}
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 space-y-1">
          <p className="text-xs font-semibold text-blue-900 uppercase">Commission Summary</p>
          <div className="flex justify-between text-sm">
            <span className="text-blue-700">Service Commission</span>
            <span className="font-medium text-blue-900">${breakdown.serviceCommission.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-blue-700">Material Commission</span>
            <span className="font-medium text-blue-900">${breakdown.materialCommission.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold border-t border-blue-200 pt-1">
            <span className="text-blue-900">Total Technician Commission</span>
            <span className="text-blue-900">${breakdown.totalCommission.toFixed(2)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MaterialAddDialog({ open, onClose, onAdd, defaultMaterialCommissionType, defaultMaterialCommissionValue }) {
  const [form, setForm] = useState({});

  useEffect(() => {
    if (open) {
      setForm({
        material_name: '',
        quantity: 1,
        unit: 'ea',
        unit_price: 0,
        chargeable_to_customer: true,
        customer_visible: true,
        commission_type: defaultMaterialCommissionType || 'none',
        commission_value: defaultMaterialCommissionValue || 0,
      });
    }
  }, [open]);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleAdd = () => {
    if (!form.material_name) return;
    onAdd({ ...form, material_id: '' });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Material</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Material Name *</Label>
            <Input value={form.material_name || ''} onChange={e => set('material_name', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Quantity</Label>
              <Input type="number" value={form.quantity ?? 1} onChange={e => set('quantity', Number(e.target.value))} />
            </div>
            <div>
              <Label>Unit</Label>
              <Input value={form.unit || 'ea'} onChange={e => set('unit', e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Unit Price ($)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.unit_price ?? 0}
              onChange={e => set('unit_price', Number(e.target.value))}
              disabled={!form.chargeable_to_customer}
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1 text-sm cursor-pointer">
              <Switch checked={form.chargeable_to_customer} onCheckedChange={v => set('chargeable_to_customer', v)} />
              Chargeable to Customer
            </label>
            <label className="flex items-center gap-1 text-sm cursor-pointer">
              <Switch
                checked={form.customer_visible}
                onCheckedChange={v => set('customer_visible', v)}
                disabled={!form.chargeable_to_customer}
              />
              Customer Visible
            </label>
          </div>
          {form.chargeable_to_customer && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Commission Type</Label>
                <Select value={form.commission_type} onValueChange={v => set('commission_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Commission</SelectItem>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="flat_dollar">Flat Dollar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Commission Value</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.commission_value ?? 0}
                  onChange={e => set('commission_value', Number(e.target.value))}
                  disabled={form.commission_type === 'none'}
                />
              </div>
            </div>
          )}
          {!form.chargeable_to_customer && (
            <div className="p-2 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600">
              This material will be tracked for inventory, job costing, and profitability but will not appear on the customer estimate or invoice.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleAdd} disabled={!form.material_name}>Add Material</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}