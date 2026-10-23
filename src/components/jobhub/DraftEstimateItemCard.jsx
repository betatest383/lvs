import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CheckCircle2, ChevronDown, ChevronUp, Trash2, Plus, DollarSign,
  Ban, Clock3, Package, Wrench,
} from 'lucide-react';
import { calculateLineCommission, formatTimeDisplay } from '@/lib/commissionEngine';

const STATUS_CONFIG = {
  ready: { label: 'Ready', class: 'bg-green-100 text-green-700' },
  suggested_service: { label: 'Suggested Service — Review Required', class: 'bg-blue-100 text-blue-700' },
  manual_review: { label: 'Manual Review Required', class: 'bg-amber-100 text-amber-700' },
  missing_price: { label: 'Missing Price', class: 'bg-orange-100 text-orange-700' },
  approved: { label: 'Added to Estimate', class: 'bg-green-200 text-green-800' },
  deferred: { label: 'Saved for Later', class: 'bg-gray-100 text-gray-600' },
  rejected: { label: 'Not Applicable', class: 'bg-red-100 text-red-700' },
};

const SEVERITY_STYLES = {
  info: 'bg-blue-100 text-blue-700',
  minor: 'bg-yellow-100 text-yellow-700',
  moderate: 'bg-orange-100 text-orange-700',
  major: 'bg-red-100 text-red-700',
  critical: 'bg-red-200 text-red-800',
};

function safeParse(str, fallback) {
  if (!str) return fallback;
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
}

export default function DraftEstimateItemCard({ item, serviceCatalog, onUpdate, onAction }) {
  const [expanded, setExpanded] = useState(false);
  const materials = safeParse(item.materials, []);
  const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.manual_review;
  const isResolved = ['ready', 'approved', 'deferred', 'rejected'].includes(item.status);

  const handleServiceChange = (serviceId) => {
    const svc = serviceCatalog.find(s => s.id === serviceId);
    if (!svc) return;

    const servicePrice = svc.default_selling_price || 0;
    const serviceCommission = calculateLineCommission({
      commission_type: svc.service_commission_type,
      commission_value: svc.service_commission_value,
      price: servicePrice,
      quantity: 1,
    });

    let newMaterials = [];
    try {
      newMaterials = JSON.parse(svc.default_materials || '[]');
      if (!Array.isArray(newMaterials)) newMaterials = [];
    } catch { /* ignore */ }

    const chargeableTotal = newMaterials
      .filter(m => m.chargeable_to_customer !== false)
      .reduce((sum, m) => sum + (m.unit_price || 0) * (m.quantity || 1), 0);
    const materialCommission = newMaterials
      .filter(m => m.chargeable_to_customer !== false)
      .reduce((sum, m) => sum + calculateLineCommission({
        commission_type: m.commission_type || svc.material_commission_type || 'none',
        commission_value: m.commission_value || svc.material_commission_value || 0,
        price: m.unit_price || 0,
        quantity: m.quantity || 1,
      }), 0);

    const totalPrice = servicePrice + chargeableTotal;
    const hasDescription = !!(svc.customer_description || svc.description);
    const hasTime = (svc.estimated_time_hours || 0) > 0 || (svc.estimated_time_minutes || 0) > 0;

    let newStatus = item.status;
    if (!['approved', 'deferred', 'rejected'].includes(item.status)) {
      if (servicePrice > 0 && hasDescription && hasTime) newStatus = 'ready';
      else if (servicePrice === 0 && hasDescription) newStatus = 'missing_price';
      else newStatus = 'manual_review';
    }

    onUpdate(item.id, {
      service_catalog_id: svc.id,
      service_name: svc.service_name,
      service_code: svc.service_code || '',
      service_description: svc.description || '',
      customer_facing_summary: svc.customer_description || item.customer_facing_summary || '',
      estimated_time_hours: svc.estimated_time_hours || 0,
      estimated_time_minutes: svc.estimated_time_minutes || 0,
      service_price: servicePrice,
      service_commission_type: svc.service_commission_type || 'none',
      service_commission_value: svc.service_commission_value || 0,
      service_commission_amount: serviceCommission,
      materials: JSON.stringify(newMaterials),
      chargeable_materials_total: chargeableTotal,
      internal_materials_total: 0,
      material_commission_amount: materialCommission,
      total_item_price: totalPrice,
      is_service_only: newMaterials.length === 0,
      status: newStatus,
    });
  };

  const handlePriceChange = (price) => {
    const servicePrice = parseFloat(price) || 0;
    const serviceCommission = calculateLineCommission({
      commission_type: item.service_commission_type,
      commission_value: item.service_commission_value,
      price: servicePrice,
      quantity: 1,
    });
    const totalPrice = servicePrice + (item.chargeable_materials_total || 0);

    let newStatus = item.status;
    if (!['approved', 'deferred', 'rejected'].includes(item.status)) {
      if (servicePrice > 0 && (item.customer_facing_summary || item.service_description)) newStatus = 'ready';
      else if (servicePrice === 0) newStatus = 'missing_price';
      else newStatus = 'manual_review';
    }

    onUpdate(item.id, {
      service_price: servicePrice,
      service_commission_amount: serviceCommission,
      total_item_price: totalPrice,
      status: newStatus,
    });
  };

  const handleUpdateMaterials = (newMaterials) => {
    const chargeableTotal = newMaterials
      .filter(m => m.chargeable_to_customer !== false)
      .reduce((sum, m) => sum + (m.unit_price || 0) * (m.quantity || 1), 0);
    const internalTotal = newMaterials
      .filter(m => m.chargeable_to_customer === false)
      .reduce((sum, m) => sum + (m.unit_price || 0) * (m.quantity || 1), 0);
    const materialCommission = newMaterials
      .filter(m => m.chargeable_to_customer !== false)
      .reduce((sum, m) => sum + calculateLineCommission({
        commission_type: m.commission_type || 'none',
        commission_value: m.commission_value || 0,
        price: m.unit_price || 0,
        quantity: m.quantity || 1,
      }), 0);
    const totalPrice = (item.service_price || 0) + chargeableTotal;

    onUpdate(item.id, {
      materials: JSON.stringify(newMaterials),
      chargeable_materials_total: chargeableTotal,
      internal_materials_total: internalTotal,
      material_commission_amount: materialCommission,
      total_item_price: totalPrice,
      is_service_only: newMaterials.length === 0,
    });
  };

  return (
    <div className={`rounded-lg border ${isResolved ? 'border-green-200' : 'border-amber-200'} overflow-hidden`}>
      <div className="p-3 space-y-2">
        {/* Header: status + source */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge className={`${statusConfig.class} text-[9px]`}>{statusConfig.label}</Badge>
              {item.severity && (
                <Badge className={`${SEVERITY_STYLES[item.severity] || ''} text-[9px]`}>{item.severity}</Badge>
              )}
              {item.deficiency_type && (
                <Badge variant="outline" className="text-[9px]">{item.deficiency_type}</Badge>
              )}
              {item.is_service_only && (
                <Badge variant="outline" className="text-[9px]"><Package className="w-2.5 h-2.5 mr-0.5" />Service Only</Badge>
              )}
            </div>
            <p className="text-sm font-medium mt-1">{item.service_name || item.source_title}</p>
            {item.source_title && item.service_name && item.source_title !== item.service_name && (
              <p className="text-[10px] text-muted-foreground">Source: {item.source_title}</p>
            )}
          </div>
          <p className="text-sm font-bold flex-shrink-0">${(item.total_item_price || 0).toFixed(2)}</p>
        </div>

        {/* Service + Price */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground">Service</label>
            <Select value={item.service_catalog_id} onValueChange={handleServiceChange}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Select service..." />
              </SelectTrigger>
              <SelectContent>
                {serviceCatalog.map(svc => (
                  <SelectItem key={svc.id} value={svc.id} className="text-xs">
                    {svc.service_name} (${(svc.default_selling_price || 0).toFixed(2)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Service Price</label>
            <Input
              type="number"
              value={item.service_price || 0}
              onChange={e => handlePriceChange(e.target.value)}
              className="h-7 text-sm"
            />
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-2 text-[10px]">
          <div>
            <span className="text-muted-foreground">Chargeable Mats</span>
            <p className="font-medium">${(item.chargeable_materials_total || 0).toFixed(2)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Internal Mats</span>
            <p className="font-medium">${(item.internal_materials_total || 0).toFixed(2)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Commission</span>
            <p className="font-medium">${((item.service_commission_amount || 0) + (item.material_commission_amount || 0)).toFixed(2)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Est. Time</span>
            <p className="font-medium">{formatTimeDisplay(item.estimated_time_hours, item.estimated_time_minutes)}</p>
          </div>
        </div>

        {/* Customer summary */}
        {item.customer_facing_summary && (
          <p className="text-xs text-muted-foreground line-clamp-2">{item.customer_facing_summary}</p>
        )}

        {/* Actions */}
        <div className="flex gap-1 flex-wrap pt-1">
          {item.status !== 'approved' && (
            <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 text-green-700 border-green-300" onClick={() => onAction(item.id, 'approved')}>
              <CheckCircle2 className="w-3 h-3" /> Add to Estimate
            </Button>
          )}
          {item.status !== 'deferred' && (
            <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 text-gray-600" onClick={() => onAction(item.id, 'deferred')}>
              <Clock3 className="w-3 h-3" /> Save for Later
            </Button>
          )}
          {item.status !== 'rejected' && (
            <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 text-red-600 border-red-300" onClick={() => onAction(item.id, 'rejected')}>
              <Ban className="w-3 h-3" /> Not Applicable
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 ml-auto" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Hide' : 'Edit'} Details
          </Button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t bg-muted/20 p-3 space-y-3">
          {/* Materials */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Materials ({materials.length})</p>
              <Button size="sm" variant="ghost" className="h-5 text-[10px] gap-1" onClick={() => {
                handleUpdateMaterials([...materials, { material_name: '', quantity: 1, unit: 'ea', unit_price: 0, chargeable_to_customer: true, customer_visible: true, commission_type: 'none', commission_value: 0 }]);
              }}>
                <Plus className="w-3 h-3" /> Add Material
              </Button>
            </div>
            {materials.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">No materials. This is a Service Only item.</p>
            ) : (
              <div className="space-y-1">
                {materials.map((m, i) => (
                  <MaterialRow
                    key={i}
                    material={m}
                    onChange={(updated) => {
                      const newMats = [...materials];
                      newMats[i] = updated;
                      handleUpdateMaterials(newMats);
                    }}
                    onRemove={() => handleUpdateMaterials(materials.filter((_, idx) => idx !== i))}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Customer-facing summary */}
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Customer-Facing Summary</label>
            <Textarea
              value={item.customer_facing_summary || ''}
              onChange={e => onUpdate(item.id, { customer_facing_summary: e.target.value })}
              className="text-xs mt-1 min-h-[50px]"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MaterialRow({ material, onChange, onRemove }) {
  return (
    <div className="flex items-center gap-1">
      <Input
        value={material.material_name || ''}
        onChange={e => onChange({ ...material, material_name: e.target.value })}
        className="h-6 text-[10px] flex-1"
        placeholder="Material name"
      />
      <Input
        type="number"
        value={material.quantity || 1}
        onChange={e => onChange({ ...material, quantity: parseFloat(e.target.value) || 0 })}
        className="h-6 text-[10px] w-12"
      />
      <Input
        type="number"
        value={material.unit_price || 0}
        onChange={e => onChange({ ...material, unit_price: parseFloat(e.target.value) || 0 })}
        className="h-6 text-[10px] w-16"
      />
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 p-0"
        onClick={() => onChange({ ...material, chargeable_to_customer: !material.chargeable_to_customer })}
        title={material.chargeable_to_customer ? 'Chargeable to customer' : 'Internal only'}
      >
        {material.chargeable_to_customer !== false
          ? <DollarSign className="w-3 h-3 text-green-600" />
          : <Wrench className="w-3 h-3 text-gray-400" />}
      </Button>
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500" onClick={onRemove}>
        <Trash2 className="w-3 h-3" />
      </Button>
    </div>
  );
}