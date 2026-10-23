import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, Search, Edit, Trash2, DollarSign, Clock, Percent, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { formatTimeDisplay, formatCommission } from '@/lib/commissionEngine';
import { ServiceThumbnail, ServiceImageField } from '@/components/services/ServiceImage';
import { downloadServicesCsv } from '@/lib/serviceCatalogImportExport';
import ServiceImportDialog from '@/components/services/ServiceImportDialog';
import ServiceConfigurationEngineSection from '@/components/services/ServiceConfigurationEngineSection';
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import LinkedResourcesPanel from '@/components/resources/LinkedResourcesPanel';

export default function ServiceCatalogPage() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editOpen, setEditOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await base44.entities.ServiceCatalog.list('sort_order', 200);
      setServices(data);
    } catch (e) {
      console.error('Failed to load services:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const categories = [...new Set(services.map(s => s.category).filter(Boolean))];

  const filtered = services.filter(s => {
    const matchSearch = !search ||
      s.service_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.service_code?.toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryFilter === 'all' || s.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  const handleNew = () => {
    setEditingService(null);
    setEditOpen(true);
  };

  const handleEdit = (service) => {
    setEditingService(service);
    setEditOpen(true);
  };

  const handleToggleActive = async (service) => {
    try {
      await base44.entities.ServiceCatalog.update(service.id, { is_active: !service.is_active });
      await load();
    } catch (e) { console.error('Toggle failed:', e); }
  };

  const handleDelete = async (service) => {
    if (!confirm(`Delete "${service.service_name}"?`)) return;
    try {
      await base44.entities.ServiceCatalog.delete(service.id);
      await load();
    } catch (e) { console.error('Delete failed:', e); }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Service Catalog</h1>
          <p className="text-sm text-muted-foreground">Manage services for the estimate builder</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={() => downloadServicesCsv(services)}>
            <Download className="w-4 h-4" /> Export
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4" /> Import
          </Button>
          <Button onClick={handleNew} className="gap-1">
            <Plus className="w-4 h-4" /> New Service
          </Button>
        </div>
      </div>

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

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center text-muted-foreground">
            No services found. Click "New Service" to create one.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(svc => (
            <ServiceCard
              key={svc.id}
              service={svc}
              onEdit={() => handleEdit(svc)}
              onToggle={() => handleToggleActive(svc)}
              onDelete={() => handleDelete(svc)}
            />
          ))}
        </div>
      )}

      <ServiceEditDialog
        open={editOpen}
        service={editingService}
        saving={saving}
        onSave={async (data) => {
          setSaving(true);
          try {
            if (editingService) {
              await base44.entities.ServiceCatalog.update(editingService.id, data);
            } else {
              await base44.entities.ServiceCatalog.create(data);
            }
            setEditOpen(false);
            await load();
          } catch (e) {
            const backendMsg = e?.response?.data?.detail || e?.response?.data?.error || e.message;
            toast.error('Failed to save service: ' + backendMsg);
          } finally {
            setSaving(false);
          }
        }}
        onClose={() => setEditOpen(false)}
      />

      <ServiceImportDialog
        open={importOpen}
        existingServices={services}
        onImport={async (mode, existing, data) => {
          if (mode === 'update') {
            await base44.entities.ServiceCatalog.update(existing.id, data);
          } else {
            await base44.entities.ServiceCatalog.create(data);
          }
        }}
        onClose={() => { setImportOpen(false); load(); }}
      />
    </div>
  );
}

function ServiceCard({ service, onEdit, onToggle, onDelete }) {
  return (
    <Card className={`border-0 shadow-sm ${!service.is_active ? 'opacity-60' : ''}`}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex gap-3 flex-1">
            <ServiceThumbnail src={service.service_image} alt={service.service_name} size="md" />
            <div>
              <h3 className="font-semibold">{service.service_name}</h3>
              {service.service_code && (
                <p className="text-xs text-muted-foreground font-mono">{service.service_code}</p>
              )}
            </div>
          </div>
          <Badge variant={service.is_active ? 'default' : 'secondary'}>
            {service.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>

        {service.category && (
          <Badge variant="outline" className="text-xs">{service.category}</Badge>
        )}

        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
            ${(service.default_selling_price || 0).toFixed(2)}
          </span>
          {(service.estimated_time_hours > 0 || service.estimated_time_minutes > 0) && (
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              {formatTimeDisplay(service.estimated_time_hours, service.estimated_time_minutes)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Percent className="w-3 h-3" />
            {formatCommission(service.service_commission_type, service.service_commission_value)}
          </span>
          <Badge variant="outline" className="text-xs capitalize">
            {service.pricing_type?.replace(/_/g, ' ')}
          </Badge>
        </div>

        {service.materials_required && (
          <Badge variant="outline" className="text-xs bg-blue-50">Materials Required</Badge>
        )}

        <div className="flex gap-1 pt-1">
          <Button size="sm" variant="outline" className="gap-1 text-xs flex-1" onClick={onEdit}>
            <Edit className="w-3 h-3" /> Edit
          </Button>
          <Button size="sm" variant="outline" className="text-xs" onClick={onToggle}>
            {service.is_active ? 'Disable' : 'Enable'}
          </Button>
          <Button size="sm" variant="outline" className="text-destructive" onClick={onDelete}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ServiceEditDialog({ open, service, saving, onSave, onClose }) {
  const [form, setForm] = useState({});

  useEffect(() => {
    const defaults = {
      service_name: '',
      service_code: '',
      category: '',
      service_image: '',
      is_active: true,
      description: '',
      customer_description: '',
      internal_notes: '',
      estimated_time_hours: 0,
      estimated_time_minutes: 0,
      default_selling_price: 0,
      pricing_type: 'fixed_price',
      materials_required: false,
      default_labor_hours: 0,
      allow_labor_adjustment: true,
      minimum_labor_hours: 0,
      maximum_labor_hours: 0,
      service_commission_type: 'none',
      service_commission_value: 0,
      material_commission_type: 'none',
      material_commission_value: 0,
      sort_order: 0,
      internal_cost: 0,
      membership_price: 0,
      default_discount_percent: 0,
      crew_size_required: 1,
      labor_phases: '',
      required_equipment: '',
      optional_equipment: '',
      truck_requirements: '',
      scope_of_work_template: '',
      proposal_tier: 'standalone',
      proposal_customer_benefits: '',
      proposal_warranty_messaging: '',
      proposal_estimated_duration: '',
      proposal_financing_available: false,
    };
    if (open) {
      setForm(service ? { ...defaults, ...service } : { ...defaults });
    }
  }, [open, service]);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSave = () => {
    if (!form.service_name?.trim()) {
      toast.error('Service Name is required');
      return;
    }
    const hrs = Number(form.estimated_time_hours);
    if (form.estimated_time_hours === '' || form.estimated_time_hours === null || form.estimated_time_hours === undefined || isNaN(hrs) || hrs < 0) {
      toast.error('Estimated Hours is required and must be 0 or greater');
      return;
    }
    const data = { ...form };
    delete data.id;
    delete data.created_date;
    delete data.updated_date;
    delete data.created_by_id;
    onSave(data);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{service ? 'Edit Service' : 'New Service'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* General Info */}
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Service Name *</Label>
                <Input value={form.service_name || ''} onChange={e => set('service_name', e.target.value)} />
              </div>
              <div>
                <Label>Service Code</Label>
                <Input value={form.service_code || ''} onChange={e => set('service_code', e.target.value)} placeholder="SVC-001" />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Input value={form.category || ''} onChange={e => set('category', e.target.value)} placeholder="Inspection, Repair, etc." />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={form.is_active} onCheckedChange={v => set('is_active', v)} />
                <Label>Active</Label>
              </div>
            </div>
            <ServiceImageField
              value={form.service_image || ''}
              onChange={url => set('service_image', url)}
              label="Image"
            />
            <div>
              <Label>Description</Label>
              <Textarea value={form.description || ''} onChange={e => set('description', e.target.value)} rows={2} />
            </div>
            <div>
              <Label>Customer Description</Label>
              <Textarea value={form.customer_description || ''} onChange={e => set('customer_description', e.target.value)} rows={2} />
            </div>
            <div>
              <Label>Internal Notes</Label>
              <Textarea value={form.internal_notes || ''} onChange={e => set('internal_notes', e.target.value)} rows={2} />
            </div>
          </div>

          {/* Time */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Estimated Time (Hours)</Label>
              <Input type="number" value={form.estimated_time_hours ?? 0} onChange={e => set('estimated_time_hours', Number(e.target.value))} />
            </div>
            <div>
              <Label>Estimated Time (Minutes)</Label>
              <Input type="number" value={form.estimated_time_minutes ?? 0} onChange={e => set('estimated_time_minutes', Number(e.target.value))} />
            </div>
          </div>
          {(form.estimated_time_hours > 0 || form.estimated_time_minutes > 0) && (
            <p className="text-xs text-muted-foreground">Display: {formatTimeDisplay(form.estimated_time_hours, form.estimated_time_minutes)}</p>
          )}

          {/* Pricing */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Default Selling Price ($) *</Label>
              <Input type="number" step="0.01" value={form.default_selling_price ?? 0} onChange={e => set('default_selling_price', Number(e.target.value))} />
            </div>
            <div>
              <Label>Pricing Type</Label>
              <Select value={form.pricing_type} onValueChange={v => set('pricing_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed_price">Fixed Price</SelectItem>
                  <SelectItem value="dynamic_price">Dynamic Price</SelectItem>
                  <SelectItem value="manual_price">Manual Price</SelectItem>
                  <SelectItem value="pricebook_linked">Pricebook Linked</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.pricing_type === 'pricebook_linked' && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Pricebook Item ID</Label>
                <Input value={form.pricebook_item_id || ''} onChange={e => set('pricebook_item_id', e.target.value)} />
              </div>
              <div>
                <Label>Pricebook Item Name</Label>
                <Input value={form.pricebook_item_name || ''} onChange={e => set('pricebook_item_name', e.target.value)} />
              </div>
            </div>
          )}

          {/* Materials */}
          <div className="flex items-center gap-2">
            <Switch checked={form.materials_required} onCheckedChange={v => set('materials_required', v)} />
            <Label>Materials Required</Label>
          </div>

          {/* Labor */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Default Labor Hours</Label>
              <Input type="number" step="0.25" value={form.default_labor_hours ?? 0} onChange={e => set('default_labor_hours', Number(e.target.value))} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={form.allow_labor_adjustment} onCheckedChange={v => set('allow_labor_adjustment', v)} />
              <Label>Allow Labor Adjustment</Label>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Minimum Labor Hours</Label>
              <Input type="number" step="0.25" value={form.minimum_labor_hours ?? 0} onChange={e => set('minimum_labor_hours', Number(e.target.value))} />
            </div>
            <div>
              <Label>Maximum Labor Hours</Label>
              <Input type="number" step="0.25" value={form.maximum_labor_hours ?? 0} onChange={e => set('maximum_labor_hours', Number(e.target.value))} />
            </div>
          </div>

          {/* Service Commission */}
          <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/50 space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-1">
              <Percent className="w-4 h-4 text-blue-600" /> Service Commission
            </h4>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Commission Type</Label>
                <Select value={form.service_commission_type} onValueChange={v => set('service_commission_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Commission</SelectItem>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="flat_dollar">Flat Dollar Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Commission Value</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.service_commission_value ?? 0}
                  onChange={e => set('service_commission_value', Number(e.target.value))}
                  disabled={form.service_commission_type === 'none'}
                  placeholder={form.service_commission_type === 'percentage' ? 'e.g. 10' : 'e.g. 20.00'}
                />
              </div>
            </div>
          </div>

          {/* Material Commission (default for materials on this service) */}
          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/50 space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-1">
              <DollarSign className="w-4 h-4 text-amber-600" /> Default Material Commission
            </h4>
            <p className="text-xs text-muted-foreground">Default commission for materials attached to this service. Can be overridden per-material in the estimate builder.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Commission Type</Label>
                <Select value={form.material_commission_type} onValueChange={v => set('material_commission_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Commission</SelectItem>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="flat_dollar">Flat Dollar Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Commission Value</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.material_commission_value ?? 0}
                  onChange={e => set('material_commission_value', Number(e.target.value))}
                  disabled={form.material_commission_type === 'none'}
                />
              </div>
            </div>
          </div>

          {/* Service Configuration Engine */}
          <ErrorBoundary message="Service editor failed to load. Check service configuration fields.">
            <ServiceConfigurationEngineSection form={form} set={set} />
          </ErrorBoundary>

          <div>
            <Label>Sort Order</Label>
            <Input type="number" value={form.sort_order ?? 0} onChange={e => set('sort_order', Number(e.target.value))} />
          </div>

          {service?.id && (
            <LinkedResourcesPanel entityType="ServiceCatalog" entityId={service.id} title="Product Resources" />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.service_name}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}