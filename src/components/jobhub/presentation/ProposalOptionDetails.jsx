import { Badge } from '@/components/ui/badge';
import {
  Clock, Shield, CreditCard, CheckCircle2, Wrench, ShoppingCart, Tag,
} from 'lucide-react';

function safeParseMaterials(materialsStr) {
  if (!materialsStr) return [];
  if (Array.isArray(materialsStr)) return materialsStr;
  try { return JSON.parse(materialsStr) || []; } catch { return []; }
}

function formatDuration(item) {
  const hrs = item.estimated_time_hours || 0;
  const mins = item.estimated_time_minutes || 0;
  if (hrs && mins) return `${hrs}h ${mins}m`;
  if (hrs) return `${hrs}h`;
  if (mins) return `${mins}m`;
  return null;
}

export default function ProposalOptionDetails({ pkg }) {
  const { option, matchedItems } = pkg;

  // Collect customer-visible chargeable materials from matched items
  const allMaterials = matchedItems.flatMap(item => {
    const mats = safeParseMaterials(item.materials);
    return mats.filter(m => m.chargeable_to_customer !== false && m.customer_visible !== false);
  });

  // Price calculations
  const serviceTotal = matchedItems.reduce((sum, i) => sum + (i.service_price || 0), 0);
  const materialTotal = allMaterials.reduce((sum, m) => sum + ((m.unit_price || 0) * (m.quantity || 1)), 0);
  const totalPrice = matchedItems.reduce((sum, i) => sum + (i.total_item_price || 0), 0);
  const membershipTotal = matchedItems.reduce((sum, i) => sum + (i.membership_price || 0), 0);
  const membershipSavings = membershipTotal > 0 ? totalPrice - membershipTotal : 0;

  return (
    <div className="space-y-3 mt-2 pt-2 border-t">
      {/* Included Services */}
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-1">
          <Wrench className="w-3 h-3" /> Included Services
        </p>
        {matchedItems.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No matched services</p>
        ) : (
          matchedItems.map(item => (
            <div key={item.id} className="rounded border p-2 mb-1.5 bg-white/50">
              <div className="flex justify-between items-start gap-2">
                <p className="text-sm font-medium">{item.service_name}</p>
                <span className="text-sm font-semibold whitespace-nowrap">${(item.total_item_price || 0).toFixed(2)}</span>
              </div>
              {(item.customer_description || item.customer_facing_summary) && (
                <p className="text-xs text-muted-foreground mt-0.5">{item.customer_description || item.customer_facing_summary}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-1">
                {formatDuration(item) && (
                  <Badge variant="outline" className="text-[9px] gap-0.5">
                    <Clock className="w-2.5 h-2.5" /> {formatDuration(item)}
                  </Badge>
                )}
                {(item.proposal_warranty_messaging || option.warranty_messaging) && (
                  <Badge variant="outline" className="text-[9px] gap-0.5">
                    <Shield className="w-2.5 h-2.5" /> {item.proposal_warranty_messaging || option.warranty_messaging}
                  </Badge>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Included Materials */}
      {allMaterials.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-1">
            <ShoppingCart className="w-3 h-3" /> Included Materials
          </p>
          {allMaterials.map((m, i) => (
            <div key={i} className="flex justify-between text-xs py-0.5">
              <span>{m.material_name || m.name}{m.quantity > 1 ? ` ×${m.quantity}` : ''}</span>
              <span className="text-muted-foreground">${((m.unit_price || 0) * (m.quantity || 1)).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Benefits */}
      {option.customer_benefits && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Benefits
          </p>
          <p className="text-xs text-green-700">{option.customer_benefits}</p>
        </div>
      )}

      {/* Warranty */}
      {option.warranty_messaging && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-1">
            <Shield className="w-3 h-3" /> Warranty
          </p>
          <p className="text-xs text-muted-foreground">{option.warranty_messaging}</p>
        </div>
      )}

      {/* Estimated Duration */}
      {option.estimated_duration && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Estimated Project Duration
          </p>
          <p className="text-xs">{option.estimated_duration}</p>
        </div>
      )}

      {/* Price Summary */}
      <div className="rounded border p-2 bg-muted/30">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Price Summary</p>
        <div className="space-y-0.5">
          <div className="flex justify-between text-xs">
            <span>Service Total</span>
            <span>${serviceTotal.toFixed(2)}</span>
          </div>
          {materialTotal > 0 && (
            <div className="flex justify-between text-xs">
              <span>Material Total</span>
              <span>${materialTotal.toFixed(2)}</span>
            </div>
          )}
          {membershipSavings > 0 && (
            <div className="flex justify-between text-xs text-green-600">
              <span className="flex items-center gap-0.5"><Tag className="w-2.5 h-2.5" /> Membership Savings</span>
              <span>−${membershipSavings.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-bold pt-1 border-t">
            <span>Total Investment</span>
            <span>${totalPrice.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Financing */}
      {option.financing_available && (
        <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 rounded p-2">
          <CreditCard className="w-3.5 h-3.5" />
          <span>Financing available — estimated <strong>${(totalPrice / 12).toFixed(2)}/mo</strong> for 12 months</span>
        </div>
      )}
    </div>
  );
}