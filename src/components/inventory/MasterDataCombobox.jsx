import { useState, useEffect, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, ChevronDown, Plus, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * Reusable searchable combobox for master data entities.
 * Supports inline "Add New" creation with duplicate prevention.
 *
 * Props:
 * - entityName: SDK entity name (e.g. "WarehouseLocation")
 * - value: selected record ID
 * - onChange: (id, displayName) => void
 * - displayField: field to show (default "name")
 * - placeholder: string
 * - filter: query filter object for the entity list
 * - dependsOn: value that, when changed, clears selection (e.g. warehouse ID for bins)
 * - canCreate: boolean — whether inline add is allowed
 * - createExtraFields: extra fields to set when creating (e.g. { inventory_type: 'Consumable' })
 * - otherOption: boolean — show "Other / Request New" option
 */
export default function MasterDataCombobox({
  entityName,
  value,
  onChange,
  displayField = 'name',
  placeholder = 'Select...',
  filter = {},
  dependsOn,
  canCreate = true,
  createExtraFields = {},
  otherOption = false,
  className,
}) {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const entity = base44.entities[entityName];
  const filterKey = JSON.stringify(filter) + (dependsOn || '');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!entity) return;
      setLoading(true);
      try {
        const recs = await entity.filter(filter, 'sort_order', 500);
        if (!cancelled) setRecords(recs);
      } catch {
        if (!cancelled) setRecords([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [entityName, filterKey]);

  // Clear selection when dependency changes
  useEffect(() => {
    if (dependsOn !== undefined && dependsOn !== '') {
      // Don't auto-clear; parent handles this
    }
  }, [dependsOn]);

  const selectedRecord = useMemo(() => {
    return records.find(r => r.id === value);
  }, [records, value]);

  const filtered = useMemo(() => {
    if (!search) return records;
    const q = search.toLowerCase();
    return records.filter(r => {
      const name = (r[displayField] || '').toLowerCase();
      return name.includes(q);
    });
  }, [records, search, displayField]);

  // Duplicate check: case-insensitive, trimmed match
  const findDuplicate = (name) => {
    const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ');
    return records.find(r => {
      const existing = (r[displayField] || '').trim().toLowerCase().replace(/\s+/g, ' ');
      return existing === normalized;
    });
  };

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      toast.error('Name is required');
      return;
    }

    // Duplicate prevention
    const dup = findDuplicate(trimmed);
    if (dup) {
      toast.info(`"${dup[displayField]}" already exists — selecting it instead.`);
      onChange(dup.id, dup[displayField]);
      setAddingNew(false);
      setNewName('');
      setSearch('');
      setOpen(false);
      return;
    }

    setCreating(true);
    try {
      const created = await entity.create({
        [displayField]: trimmed,
        is_active: true,
        ...createExtraFields,
      });
      setRecords(prev => [...prev, created]);
      onChange(created.id, created[displayField]);
      setAddingNew(false);
      setNewName('');
      setSearch('');
      setOpen(false);
      toast.success('Created successfully');
    } catch {
      toast.error('Failed to create record');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', !selectedRecord && 'text-muted-foreground', className)}
        >
          {selectedRecord ? selectedRecord[displayField] : placeholder}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {loading ? 'Loading...' : 'No results found.'}
            </CommandEmpty>
            {!addingNew && filtered.length > 0 && (
              <CommandGroup>
                {filtered.map(record => (
                  <CommandItem
                    key={record.id}
                    value={record.id}
                    onSelect={() => {
                      onChange(record.id, record[displayField]);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === record.id ? 'opacity-100' : 'opacity-0')} />
                    {record[displayField]}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {otherOption && !addingNew && (
              <CommandGroup>
                <CommandItem
                  value="__other__"
                  onSelect={() => {
                    onChange('__other__', 'Other / Request New');
                    setOpen(false);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4 opacity-50" />
                  Other / Request New
                </CommandItem>
              </CommandGroup>
            )}

            {/* Add new section */}
            {canCreate && !addingNew && (
              <CommandGroup>
                <CommandItem
                  value="__add_new__"
                  onSelect={() => setAddingNew(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add new...
                </CommandItem>
              </CommandGroup>
            )}

            {/* Inline add form */}
            {addingNew && (
              <CommandGroup>
                <div className="flex flex-col gap-2 p-2">
                  <Input
                    autoFocus
                    placeholder={`Enter new ${displayField}...`}
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreate();
                      }
                      if (e.key === 'Escape') {
                        setAddingNew(false);
                        setNewName('');
                      }
                    }}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => { setAddingNew(false); setNewName(''); }}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleCreate} disabled={creating}>
                      {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Add
                    </Button>
                  </div>
                </div>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}