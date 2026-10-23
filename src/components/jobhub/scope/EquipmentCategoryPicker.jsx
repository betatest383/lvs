import { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty, CommandGroup } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Search, Wrench } from 'lucide-react';
import { EQUIPMENT_CATEGORIES } from './scopeConstants';

/**
 * Category-based equipment picker with searchable dropdowns.
 * Selected equipment appears as removable chips.
 */
export default function EquipmentCategoryPicker({ selected = [], onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const flatItems = useMemo(() => {
    const result = [];
    for (const cat of EQUIPMENT_CATEGORIES) {
      for (const item of cat.items) {
        result.push({ item, category: cat.label });
      }
    }
    return result;
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return flatItems;
    return flatItems.filter(f => f.item.toLowerCase().includes(q) || f.category.toLowerCase().includes(q));
  }, [search, flatItems]);

  const grouped = useMemo(() => {
    const map = {};
    for (const f of filtered) {
      if (!map[f.category]) map[f.category] = [];
      map[f.category].push(f.item);
    }
    return map;
  }, [filtered]);

  const toggle = (item) => {
    if (selected.includes(item)) {
      onChange(selected.filter(i => i !== item));
    } else {
      onChange([...selected, item]);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {selected.length === 0 ? (
          <p className="text-xs text-muted-foreground">No equipment selected.</p>
        ) : (
          selected.map(item => (
            <Badge key={item} variant="secondary" className="text-[10px] gap-1">
              <Wrench className="w-2.5 h-2.5" />
              {item}
              <button type="button" onClick={() => toggle(item)} className="text-muted-foreground hover:text-destructive ml-0.5">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))
        )}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-start text-xs gap-1.5 h-8">
            <Search className="w-3.5 h-3.5" />
            Add equipment...
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search equipment by name or category..." value={search} onValueChange={setSearch} />
            <CommandList className="max-h-64">
              <CommandEmpty>No equipment found.</CommandEmpty>
              {Object.entries(grouped).map(([category, items]) => (
                <CommandGroup key={category} heading={category}>
                  {items.map(item => (
                    <CommandItem key={item} onSelect={() => toggle(item)} className="text-xs">
                      <span className="flex-1">{item}</span>
                      {selected.includes(item) && <span className="text-accent">✓</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}