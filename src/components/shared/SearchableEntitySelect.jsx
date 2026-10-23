import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Loader2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Reusable searchable dropdown with server-side debounced search,
 * keyboard navigation, scrollable results, and loading/error states.
 *
 * Props:
 * - searchFn: async (searchTerm: string) => results[]
 * - getItemId: (item) => string
 * - renderItem: (item) => ReactNode
 * - onSelect: (item) => void
 * - placeholder: string
 * - excludeIds: string[]  — IDs to exclude (prevents duplicate selections)
 * - className: string
 */
export default function SearchableEntitySelect({
  searchFn,
  getItemId = (item) => item.id,
  renderItem,
  onSelect,
  placeholder = 'Search...',
  excludeIds = [],
  className = '',
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [error, setError] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const requestIdRef = useRef(0);
  const hasLoadedRef = useRef(false);

  const doSearch = useCallback(async (term) => {
    const trimmed = term.trim();
    console.log('[SearchableEntitySelect] Searching:', { term: trimmed });

    setError(false);
    setLoading(true);

    const reqId = ++requestIdRef.current;
    try {
      const searchResults = await searchFn(trimmed);
      if (reqId !== requestIdRef.current) return;

      console.log('[SearchableEntitySelect] Results:', { term: trimmed, count: searchResults.length });
      setResults(searchResults);
      setHighlightedIndex(0);
    } catch (err) {
      if (reqId !== requestIdRef.current) return;
      console.error('[SearchableEntitySelect] Search failed:', err);
      setError(true);
      setResults([]);
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [searchFn]);

  // Load initial results on first open (before user types)
  useEffect(() => {
    if (open && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      doSearch('');
    }
  }, [open, doSearch]);

  // Debounced search when search text changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!search) return; // empty search — initial results already in state
    debounceRef.current = setTimeout(() => {
      doSearch(search);
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, doSearch]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const visibleResults = results.filter(r => !excludeIds.includes(getItemId(r)));

  const handleSelect = (item) => {
    const id = getItemId(item);
    if (excludeIds.includes(id)) return;
    console.log('[SearchableEntitySelect] Selected:', { id });
    onSelect(item);
    setSearch('');
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      e.preventDefault();
      return;
    }
    if (!open) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.min(prev + 1, visibleResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (visibleResults[highlightedIndex]) {
        handleSelect(visibleResults[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const handleClear = () => {
    setSearch('');
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full h-9 pl-9 pr-9 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {search && !loading && (
          <button type="button" onClick={handleClear} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
        )}
        {!search && !loading && (
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
          <div className="max-h-[350px] overflow-y-auto">
            {error ? (
              <div className="p-3 text-sm text-red-600">Unable to load results. Please try again.</div>
            ) : loading && visibleResults.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">Searching...</div>
            ) : visibleResults.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">
                {search ? 'No results found.' : 'Start typing to search...'}
              </div>
            ) : (
              visibleResults.map((item, idx) => (
                <button
                  key={getItemId(item)}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 border-b last:border-0 hover:bg-accent transition-colors',
                    idx === highlightedIndex && 'bg-accent'
                  )}
                >
                  {renderItem(item)}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}