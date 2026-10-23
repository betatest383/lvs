import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, ChevronsUpDown, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDeveloperMode } from '@/hooks/useDeveloperMode';

/**
 * Searchable dropdown that pulls options from the Master Classification Registry.
 * Supports single-select and multi-select modes.
 *
 * @param {string} classificationType - canonical type (e.g. 'inspection_category', 'deficiency_type')
 * @param {string} parentValue - optional single parent for hierarchical filtering
 * @param {string[]} parentValues - optional array of parent values for multi-parent filtering
 * @param {string} value - selected value (single-select mode)
 * @param {string[]} multiValue - selected values (multi-select mode)
 * @param {boolean} multi - enable multi-select
 * @param {function} onChange - callback(value) for single, callback(values[]) for multi
 * @param {string} placeholder
 */
export default function ClassificationCombobox({
  classificationType,
  parentValue = null,
  parentValues = null,
  value = '',
  multiValue = [],
  multi = false,
  onChange,
  placeholder = 'Select...',
  allowClear = true,
}) {
  const { isDevToolsVisible } = useDeveloperMode();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rawCount, setRawCount] = useState(0);
  const [error, setError] = useState(null);

  // Stable dependency for parentValues array
  const parentValuesKey = parentValues ? parentValues.join(',') : '';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const query = { classification_type: classificationType, is_active: true };
    base44.entities.MasterClassification.filter(query, 'sort_order', 200)
      .then(records => {
        if (cancelled) return;
        setRawCount(records.length);
        const mapped = records.map(r => ({
          value: r.value,
          label: r.label || r.value,
          parent_value: r.parent_value,
        }));
        let filtered;
        if (parentValues && parentValues.length > 0) {
          // Multi-parent: show sections linked to any selected form
          filtered = mapped.filter(r => parentValues.includes(r.parent_value));
        } else if (parentValue) {
          // Single parent: exact match
          filtered = mapped.filter(r => r.parent_value === parentValue);
        } else {
          // No parent filter: show all
          filtered = mapped;
        }
        setOptions(filtered);
      })
      .catch(err => {
        if (!cancelled) {
          setOptions([]);
          setRawCount(0);
          setError(err?.message || 'Failed to load');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [classificationType, parentValue, parentValuesKey]);

  const selectedValues = multi ? (multiValue || []) : (value ? [value] : []);

  const handleSelect = (val) => {
    if (multi) {
      const current = multiValue || [];
      const next = current.includes(val)
        ? current.filter(v => v !== val)
        : [...current, val];
      onChange(next);
    } else {
      onChange(val === value && allowClear ? '' : val);
      setOpen(false);
    }
  };

  const displayLabel = useMemo(() => {
    if (multi) {
      return (multiValue || []).length > 0
        ? `${multiValue.length} selected`
        : placeholder;
    }
    const opt = options.find(o => o.value === value);
    return opt ? opt.label : placeholder;
  }, [multi, multiValue, value, options, placeholder]);

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className={cn('truncate flex items-center gap-1.5', !value && (multi ? !(multiValue?.length) : true) && 'text-muted-foreground')}>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
              {displayLabel}
            </span>
            {multi && (multiValue || []).length > 0 ? (
              <X
                className="h-4 w-4 shrink-0 opacity-50 hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); onChange([]); }}
              />
            ) : (
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0" align="start">
          <Command>
            <CommandInput placeholder="Search..." />
            <CommandList>
              <CommandEmpty>
                {loading ? 'Loading...' : error ? `Error: ${error}` : `No options found. (${rawCount} records for type "${classificationType}")`}
              </CommandEmpty>
              <CommandGroup>
                {options.map(opt => {
                  const isSelected = selectedValues.includes(opt.value);
                  return (
                    <CommandItem
                      key={opt.value + (opt.parent_value || '')}
                      value={`${opt.label} ${opt.value}`}
                      onSelect={() => handleSelect(opt.value)}
                    >
                      <Check className={cn('mr-2 h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                      <span className="flex-1">{opt.label}</span>
                      {opt.parent_value && (
                        <Badge variant="outline" className="text-[10px] ml-1">{opt.parent_value}</Badge>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {isDevToolsVisible && (
        <p className="text-[10px] text-muted-foreground mt-1 font-mono">
          type={classificationType} · records={rawCount} · options={options.length}
          {parentValue && ` · parent=${parentValue}`}
          {parentValues && parentValues.length > 0 && ` · parents=${parentValues.join(',')}`}
        </p>
      )}
    </div>
  );
}