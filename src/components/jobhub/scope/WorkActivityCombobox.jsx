import { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty, CommandGroup } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { X, Plus, Search } from 'lucide-react';
import { WORK_ACTIVITIES } from './scopeConstants';

/**
 * Searchable multi-select for work activities.
 * Selected activities appear as removable chips.
 * Technicians can add custom activities not in the list.
 */
export default function WorkActivityCombobox({ selected = [], onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return WORK_ACTIVITIES;
    return WORK_ACTIVITIES.filter(a => a.toLowerCase().includes(q));
  }, [search]);

  const toggle = (activity) => {
    if (selected.includes(activity)) {
      onChange(selected.filter(a => a !== activity));
    } else {
      onChange([...selected, activity]);
    }
  };

  const addCustom = () => {
    const trimmed = search.trim();
    if (!trimmed) return;
    if (selected.includes(trimmed)) return;
    onChange([...selected, trimmed]);
    setSearch('');
  };

  const showAddCustom = search.trim() && !WORK_ACTIVITIES.some(a => a.toLowerCase() === search.trim().toLowerCase());

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {selected.map(act => (
          <span key={act} className="inline-flex items-center gap-1 rounded-md bg-accent/15 px-2 py-0.5 text-xs font-medium">
            {act}
            <button type="button" onClick={() => toggle(act)} className="text-muted-foreground hover:text-destructive">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-start text-xs gap-1.5 h-8">
            <Search className="w-3.5 h-3.5" />
            {selected.length > 0 ? 'Add more activities...' : 'Search work activities...'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search or type a custom activity..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList className="max-h-48">
              <CommandEmpty>
                {showAddCustom ? (
                  <button type="button" onClick={addCustom} className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs hover:bg-accent rounded">
                    <Plus className="w-3.5 h-3.5" /> Add "{search.trim()}"
                  </button>
                ) : 'No activities found.'}
              </CommandEmpty>
              <CommandGroup>
                {filtered.map(act => (
                  <CommandItem
                    key={act}
                    onSelect={() => toggle(act)}
                    className="text-xs"
                  >
                    <span className="flex-1">{act}</span>
                    {selected.includes(act) && <span className="text-accent">✓</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
              {showAddCustom && (
                <CommandGroup>
                  <CommandItem onSelect={addCustom} className="text-xs">
                    <Plus className="w-3.5 h-3.5" /> Add "{search.trim()}" as custom activity
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}