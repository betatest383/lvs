import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Palette, CheckCircle2 } from 'lucide-react';
import { buildFinishConfiguration } from '@/lib/capFinishPricingEngine';

/**
 * Cap Finish Color Picker
 *
 * Displays available CapFinishColor records as swatches for the technician
 * to select when the resolved cap product has a powder-coated finish.
 *
 * Calls onFinishConfigChange with the full finish configuration object
 * (color, pricing, material/service IDs) whenever the color changes.
 *
 * @param {object} product - resolved cap product from capResolverEngine
 * @param {function} onFinishConfigChange - callback receiving the finish configuration
 * @param {string|null} selectedColorId - currently selected color ID (for controlled usage)
 */
export default function CapFinishColorPicker({ product, onFinishConfigChange, selectedColorId }) {
  const [colors, setColors] = useState([]);
  const [pricingEntries, setPricingEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [localSelectedId, setLocalSelectedId] = useState(null);

  useEffect(() => {
    if (product?.finish !== 'powder_coated') return;
    setLoading(true);
    Promise.all([
      base44.entities.CapFinishColor.filter({ is_active: true }, 'sort_order', 100),
      base44.entities.CapFinishPricing.filter({ is_active: true, finish_type: 'powder_coated' }, '-priority', 100),
    ])
      .then(([colorData, pricingData]) => {
        setColors(colorData || []);
        setPricingEntries(pricingData || []);
      })
      .catch(() => {
        setColors([]);
        setPricingEntries([]);
      })
      .finally(() => setLoading(false));
  }, [product]);

  const effectiveSelectedId = selectedColorId || localSelectedId;

  const [currentConfig, setCurrentConfig] = useState(null);

  const handleSelect = (color) => {
    setLocalSelectedId(color.id);
    const config = buildFinishConfiguration(product, color, pricingEntries);
    setCurrentConfig(config);
    onFinishConfigChange?.(config);
  };

  if (!product || product.finish !== 'powder_coated') return null;

  if (loading) {
    return (
      <Card className="border-blue-300">
        <CardContent className="p-4 text-sm text-muted-foreground">Loading finish colors…</CardContent>
      </Card>
    );
  }

  if (colors.length === 0) {
    return (
      <Card className="border-amber-300">
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Palette className="h-4 w-4" /> Finish Color Required</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-amber-600">No finish colors are configured. Please ask an admin to add Cap Finish Colors before proceeding.</p>
        </CardContent>
      </Card>
    );
  }

  const selectedColor = colors.find(c => c.id === effectiveSelectedId);

  return (
    <Card className="border-blue-300">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Palette className="h-4 w-4 text-blue-600" /> Select Finish Color
          <Badge variant="outline" className="text-[10px] text-blue-700 border-blue-300 ml-auto">Powder-Coated</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          The base steel-cap material/SKU is retained. The powder-coat finish material and service will be added to the proposal and scope of work.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {colors.map(c => {
            const swatch = c.hex_value || '#CCCCCC';
            const isSelected = c.id === effectiveSelectedId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelect(c)}
                className={`rounded-lg border-2 p-2 text-left transition-all ${
                  isSelected ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50' : 'border-border hover:border-blue-300'
                }`}
              >
                <div className="w-full h-10 rounded mb-1 border" style={{ backgroundColor: swatch }} />
                <p className="text-xs font-medium truncate">{c.display_name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{c.manufacturer_color_code || '—'}</p>
                {c.additional_cost > 0 && (
                  <p className="text-[10px] text-green-700">+${c.additional_cost}</p>
                )}
                {c.lead_time_adjustment_days > 0 && (
                  <p className="text-[10px] text-amber-600">+{c.lead_time_adjustment_days}d lead</p>
                )}
              </button>
            );
          })}
        </div>

        {selectedColor && (
          <div className="border-t pt-3 space-y-1 text-xs">
            <div className="flex items-center gap-1 text-green-700">
              <CheckCircle2 className="h-3 w-3" />
              <span className="font-medium">{selectedColor.display_name}</span>
              <span className="text-muted-foreground">({selectedColor.manufacturer_color_code || 'no code'})</span>
            </div>
            <p className="text-muted-foreground">
              Color name and manufacturer code will appear on the technician confirmation, customer proposal, scope of work, material order, and installation work order.
            </p>
            {currentConfig && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-muted-foreground">Finish pricing:</span>
                {currentConfig.matched ? (
                  <Badge variant="outline" className="text-green-700 border-green-300">+${currentConfig.finish_additional_price.toFixed(2)} ({currentConfig.pricing_tier})</Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-700 border-amber-300">Unresolved — no pricing rule matched</Badge>
                )}
                {currentConfig.color_additional_cost > 0 && (
                  <Badge variant="outline" className="text-green-700">Color +${currentConfig.color_additional_cost}</Badge>
                )}
              </div>
            )}
            {(!product.finish_material_id || !product.finish_service_id) && (
              <p className="text-red-600">⚠ Finish material/service mapping missing — contact admin.</p>
            )}
            {selectedColor.lead_time_adjustment_days > 0 && (
              <p className="text-amber-600">Lead time increases by {selectedColor.lead_time_adjustment_days} day(s).</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}