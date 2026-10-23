import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import SearchableEntitySelect from '@/components/shared/SearchableEntitySelect';

/**
 * Searchable ServiceCatalog picker using server-side searchServiceCatalog.
 * Searches across service_name, service_code, category, description, pricebook_item_id.
 *
 * Props:
 * - value: array of selected service objects [{ service_catalog_id, service_name, ... }]
 * - onChange: (newArray) => void
 * - multi: boolean (default true) — false = single select
 * - placeholder: string
 * - showInactiveToggle: boolean (default true)
 */
export default function ServicePicker({
  value = [],
  onChange,
  multi = true,
  placeholder = 'Search services...',
  showInactiveToggle = true,
}) {
  const [showInactive, setShowInactive] = useState(false);

  const selectedIds = useMemo(
    () => new Set((value || []).map(s => s.service_catalog_id)),
    [value]
  );

  const excludeIds = useMemo(
    () => (value || []).map(s => s.service_catalog_id).filter(Boolean),
    [value]
  );

  const serviceSearchFn = async (searchTerm) => {
    const res = await base44.functions.invoke('searchServiceCatalog', {
      search: searchTerm,
      includeInactive: showInactive,
      limit: 50,
    });
    return res.data?.items || [];
  };

  const toggle = (svc) => {
    const obj = {
      service_catalog_id: svc.id,
      service_name: svc.service_name,
      service_code: svc.service_code || '',
      category: svc.category || '',
      default_price: svc.default_selling_price || 0,
    };
    console.log('[ServicePicker] Selected:', { id: svc.id, name: svc.service_name });
    if (multi) {
      if (selectedIds.has(svc.id)) {
        onChange((value || []).filter(s => s.service_catalog_id !== svc.id));
      } else {
        onChange([...(value || []), obj]);
      }
    } else {
      onChange([obj]);
    }
  };

  const remove = (id) => {
    onChange((value || []).filter(s => s.service_catalog_id !== id));
  };

  const formatTime = (svc) => {
    const hrs = svc.estimated_time_hours || 0;
    const mins = svc.estimated_time_minutes || 0;
    if (hrs && mins) return `${hrs}h ${mins}m`;
    if (hrs) return `${hrs}h`;
    if (mins) return `${mins}m`;
    return null;
  };

  return (
    <div className="space-y-2">
      {/* Selected chips */}
      {(value || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(value || []).map(svc => (
            <Badge key={svc.service_catalog_id} variant="secondary" className="gap-1 pr-1">
              {svc.service_name}
              {svc.default_price ? <span className="text-muted-foreground">${svc.default_price}</span> : null}
              <button type="button" onClick={() => remove(svc.service_catalog_id)} className="ml-0.5 hover:text-destructive">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <SearchableEntitySelect
        searchFn={serviceSearchFn}
        getItemId={(item) => item.id}
        excludeIds={multi ? excludeIds : []}
        onSelect={toggle}
        placeholder={placeholder}
        renderItem={(svc) => {
          const selected = selectedIds.has(svc.id);
          const time = formatTime(svc);
          return (
            <div className="flex items-start gap-2 min-w-0">
              <Check className={cn('h-4 w-4 mt-0.5 shrink-0', selected ? 'opacity-100 text-green-600' : 'opacity-0')} />
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-sm">{svc.service_name}</span>
                  {svc.service_code && <span className="text-muted-foreground font-mono text-xs">{svc.service_code}</span>}
                  {svc.is_active === false && <Badge variant="outline" className="text-[9px] py-0 px-1">Inactive</Badge>}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {svc.category && <span>{svc.category}</span>}
                  {svc.default_selling_price ? <span>${svc.default_selling_price}</span> : null}
                  {time && <span>⏱ {time}</span>}
                </div>
              </div>
            </div>
          );
        }}
      />

      {showInactiveToggle && (
        <div className="flex items-center gap-2">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} id="show-inactive-svc" />
          <label htmlFor="show-inactive-svc" className="text-xs cursor-pointer">Show inactive services</label>
        </div>
      )}
    </div>
  );
}