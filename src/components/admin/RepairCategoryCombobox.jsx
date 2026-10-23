import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown, Loader2, Inbox, ExternalLink, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

/**
 * Searchable dropdown for Repair Categories.
 * Loads active records from MasterClassification (classification_type = 'repair_category').
 * Returns the record ID (not the value string) for relationship storage.
 *
 * @param {string} value - Selected MasterClassification record ID
 * @param {string} fallbackName - Display name to show before options load (e.g. from repair_category_name)
 * @param {(id: string, name: string) => void} onChange
 * @param {string} placeholder
 */
export default function RepairCategoryCombobox({ value, fallbackName, onChange, placeholder = 'Search repair categories...' }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true);
    setError(false);
    base44.entities.MasterClassification.filter(
      { classification_type: 'repair_category', is_active: true },
      'sort_order',
      200
    )
      .then(records => {
        setOptions(records.map(r => ({ id: r.id, value: r.value, label: r.label || r.value })));
      })
      .catch(() => {
        setOptions([]);
        setError(true);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const selected = options.find(o => o.id === value);
  const displayLabel = selected ? selected.label : (fallbackName || '');

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
              <span className={cn('truncate flex items-center gap-1.5', !displayLabel && 'text-muted-foreground')}>
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
                {displayLabel || (loading ? 'Loading...' : placeholder)}
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0" align="start">
            <Command>
              <CommandInput placeholder="Search categories..." />
              <CommandList>
                <CommandEmpty>
                  {loading ? 'Loading...' : error ? 'Failed to load.' : 'No matching categories.'}
                </CommandEmpty>
                <CommandGroup>
                  {options.map(opt => (
                    <CommandItem
                      key={opt.id}
                      value={`${opt.label} ${opt.value}`}
                      onSelect={() => {
                        onChange(opt.id, opt.label);
                        setOpen(false);
                      }}
                    >
                      <Check className={cn('mr-2 h-4 w-4', value === opt.id ? 'opacity-100' : 'opacity-0')} />
                      {opt.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={load}
          title="Refresh categories"
          disabled={loading}
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </Button>
      </div>
      {!loading && !error && options.length === 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Inbox className="w-3.5 h-3.5 shrink-0" />
          No active Repair Categories found.{' '}
          <Link to="/admin/master-classification" className="text-primary underline inline-flex items-center gap-0.5">
            Add one in Master Classification Registry <ExternalLink className="w-3 h-3" />
          </Link>
        </p>
      )}
      {error && (
        <p className="text-xs text-destructive">Failed to load categories. Click refresh to retry.</p>
      )}
    </div>
  );
}