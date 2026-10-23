import SearchableEntitySelect from '@/components/shared/SearchableEntitySelect';
import { base44 } from '@/api/base44Client';

/**
 * Reusable searchable picker for ProductResource relationship linking.
 * Searches any of the 7 supported entity types via the backend.
 *
 * Props:
 * - entityType: string (e.g. 'InventoryMaster', 'Manufacturer')
 * - onSelect: (item: { id, name, sub }) => void
 * - excludeIds: string[] — IDs already linked (prevents duplicate selection)
 * - placeholder: string
 */
export default function SearchableEntityPicker({
  entityType,
  onSelect,
  excludeIds = [],
  placeholder = 'Search...',
}) {
  const searchFn = async (searchTerm) => {
    const res = await base44.functions.invoke('manageProductResource', {
      action: 'search_entities',
      entity_type: entityType,
      search: searchTerm,
      limit: 20,
    });
    if (res.data?.success) return res.data.results || [];
    return [];
  };

  return (
    <SearchableEntitySelect
      searchFn={searchFn}
      getItemId={(item) => item.id}
      renderItem={(item) => (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{item.name}</p>
            {item.sub && <p className="text-xs text-muted-foreground truncate">{item.sub}</p>}
          </div>
        </div>
      )}
      onSelect={onSelect}
      excludeIds={excludeIds}
      placeholder={placeholder}
    />
  );
}