import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

function SearchSelect({ value, options, placeholder, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={selected ? '' : 'text-muted-foreground'}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map(opt => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => { onChange(opt.value); setOpen(false); }}
                >
                  <Check className={cn('mr-1 h-4 w-4', value === opt.value ? 'opacity-100' : 'opacity-0')} />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function EntityFormDialog({ open, onOpenChange, title, fields, initialData, onSave }) {
  const [data, setData] = useState(initialData || {});
  const [saving, setSaving] = useState(false);

  // Reset data when initialData changes (e.g. clicking a different row)
  useEffect(() => {
    setData(initialData || {});
  }, [initialData]);

  // Dirty-state tracking: compare current data vs initial data
  const isDirty = useMemo(
    () => JSON.stringify(data) !== JSON.stringify(initialData || {}),
    [data, initialData]
  );

  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(
    isDirty,
    () => onOpenChange(false)
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(data);
      onOpenChange(false);
    } catch (error) {
      const backendMsg = error?.response?.data?.detail || error?.response?.data?.error || error?.message || 'Unknown error';
      toast.error(`Save failed: ${backendMsg}`);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (key, value) => setData(prev => ({ ...prev, [key]: value }));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" onCloseAttempt={handleCloseAttempt}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {fields.map(field => (
              <div key={field.key} className="space-y-1.5">
                <Label className="text-sm font-medium">{field.label}</Label>
                {field.type === 'text' && (
                  <Input value={data[field.key] || ''} onChange={e => updateField(field.key, e.target.value)} placeholder={field.placeholder} />
                )}
                {field.type === 'textarea' && (
                  <Textarea value={data[field.key] || ''} onChange={e => updateField(field.key, e.target.value)} placeholder={field.placeholder} rows={3} />
                )}
                {field.type === 'number' && (
                  <Input type="number" step="any" value={data[field.key] || ''} onChange={e => updateField(field.key, parseFloat(e.target.value) || 0)} />
                )}
                {field.type === 'date' && (
                  <Input type="date" value={data[field.key] || ''} onChange={e => updateField(field.key, e.target.value)} />
                )}
                {field.type === 'select' && (
                  <Select value={data[field.key] || ''} onValueChange={v => updateField(field.key, v)}>
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${field.label}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options?.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {field.type === 'search_select' && (
                  <SearchSelect
                    value={data[field.key] || ''}
                    options={field.options || []}
                    placeholder={`Search ${field.label}`}
                    onChange={v => updateField(field.key, v)}
                  />
                )}
                {field.type === 'boolean' && (
                  <div className="flex items-center gap-2">
                    <Switch checked={data[field.key] || false} onCheckedChange={v => updateField(field.key, v)} />
                    <span className="text-sm text-muted-foreground">{data[field.key] ? 'Yes' : 'No'}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseAttempt}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DirtyCloseWarning
        open={showWarning}
        onContinueEditing={cancelDiscard}
        onDiscardChanges={confirmDiscard}
      />
    </>
  );
}