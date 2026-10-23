import { useState, useEffect, useRef, useCallback } from 'react';
import { Check, ChevronsUpDown, Search, X, Loader2, AlertCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * RegistrySearchCombobox — Reusable server-side searchable combobox.
 *
 * Props:
 * - value: string | string[] (single ID or array of IDs)
 * - onChange: (value) => void  — receives canonical IDs
 * - displayValue: string (optional override for the selected display label)
 * - searchFn: async (query, page, filters) => { items, hasMore }  — server search function
 * - resolveFn: async (ids) => { [id]: { label, secondary } }  — resolve IDs to labels for editing
 * - multi: boolean — enable multiple selection
 * - placeholder: string
 * - labelKey: string — field in search results used for the primary label (default 'label')
 * - secondaryKey: string — field for secondary metadata (default 'secondary')
 * - idKey: string — field for canonical ID (default 'id')
 * - pageSize: number (default 20)
 * - extraFilters: object — passed to searchFn as filters
 * - excludeArchived: boolean (default true)
 * - disabled: boolean
 * - clearable: boolean (default true)
 * - onOpenRecord: (id) => void — optional, shows an "open" link when a record is selected
 * - permissionDenied: boolean — when true, shows locked state
 */
export default function RegistrySearchCombobox({
  value,
  onChange,
  displayValue: displayOverride,
  searchFn,
  resolveFn,
  multi = false,
  placeholder = 'Search…',
  labelKey = 'label',
  secondaryKey = 'secondary',
  idKey = 'id',
  pageSize = 20,
  extraFilters = {},
  excludeArchived = true,
  disabled = false,
  clearable = true,
  onOpenRecord,
  permissionDenied = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [resolved, setResolved] = useState({});
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  const selectedIds = multi ? (Array.isArray(value) ? value : []) : (value ? [value] : []);

  // Resolve selected IDs to labels when not searching
  useEffect(() => {
    if (!resolveFn || selectedIds.length === 0) return;
    const unresolved = selectedIds.filter(id => !resolved[id]);
    if (unresolved.length === 0) return;
    let active = true;
    resolveFn(unresolved).then(result => {
      if (active) setResolved(prev => ({ ...prev, ...result }));
    }).catch(() => {});
    return () => { active = false; };
  }, [value]);

  const doSearch = useCallback(async (searchQuery, pageNum) => {
    if (abortRef.current) abortRef.current.abort = true;
    const myAbort = { abort: false };
    abortRef.current = myAbort;

    setLoading(true);
    setError(false);
    try {
      const result = await searchFn(searchQuery, pageNum, { ...extraFilters, excludeArchived });
      if (myAbort.abort) return;
      const newItems = result.items || [];
      setItems(prev => pageNum === 0 ? newItems : [...prev, ...newItems]);
      setHasMore(result.hasMore || false);
      setPage(pageNum);
    } catch (e) {
      if (!myAbort.abort) setError(true);
    } finally {
      if (!myAbort.abort) setLoading(false);
    }
  }, [searchFn, JSON.stringify(extraFilters), excludeArchived]);

  // Debounced search on query change
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query, 0), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open]);

  // Initial load when opened
  useEffect(() => {
    if (open && items.length === 0 && !loading && !error) {
      doSearch('', 0);
    }
  }, [open]);

  const handleSelect = (item) => {
    const id = item[idKey];
    if (multi) {
      const current = Array.isArray(value) ? value : [];
      if (current.includes(id)) {
        onChange(current.filter(v => v !== id));
      } else {
        onChange([...current, id]);
        setResolved(prev => ({ ...prev, [id]: { label: item[labelKey], secondary: item[secondaryKey] } }));
      }
    } else {
      onChange(id);
      setResolved(prev => ({ ...prev, [id]: { label: item[labelKey], secondary: item[secondaryKey] } }));
      setOpen(false);
    }
  };

  const handleRemove = (id, e) => {
    e.stopPropagation();
    if (multi) {
      onChange((Array.isArray(value) ? value : []).filter(v => v !== id));
    } else {
      onChange(null);
    }
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange(multi ? [] : null);
  };

  const handleLoadMore = () => doSearch(query, page + 1);

  const getDisplayLabel = (id) => {
    if (displayOverride && !multi) return displayOverride;
    const r = resolved[id];
    return r ? r.label : id;
  };

  const getSecondary = (id) => {
    const r = resolved[id];
    return r?.secondary || '';
  };

  if (permissionDenied) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-muted/50 text-muted-foreground text-sm">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>Not authorized to search this registry</span>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn("w-full justify-between font-normal", selectedIds.length === 0 && "text-muted-foreground")}
          >
            {selectedIds.length === 0 ? (
              <span className="truncate">{placeholder}</span>
            ) : multi ? (
              <div className="flex items-center gap-1 flex-wrap min-h-0">
                {selectedIds.slice(0, 3).map(id => (
                  <Badge key={id} variant="secondary" className="text-xs gap-0.5 pr-1">
                    <span className="max-w-24 truncate">{getDisplayLabel(id)}</span>
                    {clearable && <X className="w-3 h-3 cursor-pointer hover:text-destructive" onClick={(e) => handleRemove(id, e)} />}
                  </Badge>
                ))}
                {selectedIds.length > 3 && <span className="text-xs text-muted-foreground">+{selectedIds.length - 3} more</span>}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className="truncate">{getDisplayLabel(selectedIds[0])}</span>
                {getSecondary(selectedIds[0]) && <span className="text-xs text-muted-foreground truncate">— {getSecondary(selectedIds[0])}</span>}
                {clearable && <X className="w-3.5 h-3.5 shrink-0 hover:text-destructive" onClick={handleClear} />}
              </div>
            )}
            <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[300px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={placeholder}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-64">
              {loading && items.length === 0 && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {error && (
                <div className="py-4 px-3 text-center text-sm text-destructive">
                  Search failed. Try again.
                </div>
              )}
              {!loading && !error && items.length === 0 && (
                <CommandEmpty>{query ? 'No results found.' : 'Type to search…'}</CommandEmpty>
              )}
              {!error && items.length > 0 && (
                <CommandGroup>
                  {items.map(item => {
                    const id = item[idKey];
                    const isSelected = selectedIds.includes(id);
                    return (
                      <CommandItem
                        key={id}
                        value={id}
                        onSelect={() => handleSelect(item)}
                        className="gap-2"
                      >
                        <Check className={cn("w-3.5 h-3.5 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="truncate text-sm">{item[labelKey]}</span>
                          {item[secondaryKey] && <span className="text-xs text-muted-foreground truncate">{item[secondaryKey]}</span>}
                        </div>
                      </CommandItem>
                    );
                  })}
                  {hasMore && (
                    <CommandItem onSelect={handleLoadMore} className="justify-center text-xs text-muted-foreground">
                      {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                      Load more…
                    </CommandItem>
                  )}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {!multi && selectedIds.length === 1 && onOpenRecord && (
        <button
          type="button"
          onClick={() => onOpenRecord(selectedIds[0])}
          className="text-xs text-accent hover:underline mt-1"
        >
          Open record →
        </button>
      )}
    </div>
  );
}