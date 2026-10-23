import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, ChevronDown, ChevronRight, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  POLICY_TYPES, ENFORCEMENT_LEVELS, POLICY_REGISTRY_LINK_CONFIG, ACK_FREQUENCY_OPTIONS
} from '@/lib/policyRegistryConstants';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';
import { DEPARTMENTS } from '@/lib/roleRegistryConstants';

const dateFieldDefaults = { effective_date: null, review_date: null };

export default function PolicyFormDialog({ open, onOpenChange, initialData, onSave }) {
  const [data, setData] = useState({ ...dateFieldDefaults, ...initialData });
  const [saving, setSaving] = useState(false);
  const [registryOptions, setRegistryOptions] = useState({});
  const [loadingRegistries, setLoadingRegistries] = useState(false);
  const [expandedSection, setExpandedSection] = useState('basic');
  const [datePicker, setDatePicker] = useState({ field: null, open: false });

  useEffect(() => { setData({ ...dateFieldDefaults, ...initialData }); }, [initialData]);

  useEffect(() => {
    if (!open) return;
    setLoadingRegistries(true);
    Promise.all(
      POLICY_REGISTRY_LINK_CONFIG.map(async (cfg) => {
        try {
          const recs = await base44.entities[cfg.entity].list('-created_date', 200);
          return [cfg.field, recs || []];
        } catch {
          return [cfg.field, []];
        }
      })
    ).then(entries => {
      setRegistryOptions(Object.fromEntries(entries));
      setLoadingRegistries(false);
    });
  }, [open]);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open, initialData]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onOpenChange(false));

  const updateField = (key, value) => { setData(prev => ({ ...prev, [key]: value })); setIsDirty(true); };

  const toggleArrayValue = (key, value) => {
    const current = data[key] || [];
    const exists = current.includes(value);
    updateField(key, exists ? current.filter(v => v !== value) : [...current, value]);
  };

  const handleSave = async () => {
    if (!data.policy_id || !data.policy_name) return;
    setSaving(true);
    try {
      await onSave(data);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDateSelect = (date) => {
    updateField(datePicker.field, date ? format(date, 'yyyy-MM-dd') : null);
    setDatePicker({ field: null, open: false });
  };

  const sections = [
    { id: 'basic', label: 'Basic Info', fields: [
      { key: 'policy_id', label: 'Policy ID', type: 'text', required: true, placeholder: 'WP-001' },
      { key: 'policy_name', label: 'Policy Name', type: 'text', required: true, placeholder: 'Equipment Accountability Policy' },
      { key: 'department', label: 'Department', type: 'select', options: DEPARTMENTS },
      { key: 'policy_type', label: 'Policy Type', type: 'select', options: POLICY_TYPES },
      { key: 'enforcement_level', label: 'Enforcement Level', type: 'select', options: ENFORCEMENT_LEVELS.map(e => e.value) },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Describe the policy...' },
    ]},
    { id: 'ownership', label: 'Ownership & Dates', fields: [
      { key: 'policy_owner', label: 'Policy Owner', type: 'text', placeholder: 'e.g. Director of Operations' },
      { key: 'effective_date', label: 'Effective Date', type: 'date' },
      { key: 'review_date', label: 'Review Date', type: 'date' },
      { key: 'version', label: 'Version', type: 'text', placeholder: '1.0' },
      { key: 'status', label: 'Status', type: 'select', options: ['Draft', 'Active', 'Under Review', 'Retired'] },
      { key: 'trainual_link', label: 'Trainual Link', type: 'text', placeholder: 'https://...' },
    ]},
    { id: 'links', label: 'Relationships', fields: [
      ...POLICY_REGISTRY_LINK_CONFIG.map(cfg => ({
        key: cfg.field, label: cfg.label, type: 'registry_link', config: cfg,
      })),
    ]},
    { id: 'ack', label: 'Acknowledgment', fields: [
      { key: 'requires_acknowledgment', label: 'Requires Employee Acknowledgment', type: 'boolean' },
      { key: 'acknowledgment_frequency', label: 'Acknowledgment Frequency', type: 'select', options: ACK_FREQUENCY_OPTIONS },
    ]},
    { id: 'admin', label: 'Notes', fields: [
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ]},
  ];

  const renderField = (field) => {
    const value = data[field.key];
    switch (field.type) {
      case 'text':
        return <Input value={value || ''} onChange={e => updateField(field.key, e.target.value)} placeholder={field.placeholder} />;
      case 'textarea':
        return <Textarea value={value || ''} onChange={e => updateField(field.key, e.target.value)} placeholder={field.placeholder} rows={3} />;
      case 'select':
        return (
          <Select value={value || ''} onValueChange={v => updateField(field.key, v)}>
            <SelectTrigger><SelectValue placeholder={`Select ${field.label}`} /></SelectTrigger>
            <SelectContent>
              {field.options.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case 'boolean':
        return (
          <div className="flex items-center gap-2">
            <Switch checked={value || false} onCheckedChange={v => updateField(field.key, v)} />
            <span className="text-sm text-muted-foreground">{value ? 'Yes' : 'No'}</span>
          </div>
        );
      case 'date':
        return (
          <Popover open={datePicker.field === field.key} onOpenChange={(o) => setDatePicker({ field: o ? field.key : null, open: o })}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal h-9" disabled={false}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {value ? format(new Date(value), 'MMM d, yyyy') : <span className="text-muted-foreground">Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={value ? new Date(value) : undefined}
                onSelect={handleDateSelect}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        );
      case 'registry_link':
        const options = registryOptions[field.config.field] || [];
        return (
          <div className="rounded-md border border-input p-2 max-h-48 overflow-y-auto space-y-1">
            {loadingRegistries ? (
              <p className="text-xs text-muted-foreground text-center py-2">Loading...</p>
            ) : options.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">No records found</p>
            ) : options.map(opt => {
              const idVal = opt[field.config.idField];
              const labelVal = opt[field.config.labelField];
              const display = `${idVal} — ${labelVal}`;
              const checked = Array.isArray(value) && value.includes(idVal);
              return (
                <div key={opt.id} className="flex items-center gap-2">
                  <Checkbox checked={checked} onCheckedChange={() => toggleArrayValue(field.key, idVal)} />
                  <span className="text-sm truncate">{display}</span>
                </div>
              );
            })}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
...
    </Dialog>
    <DirtyCloseWarning
      open={showWarning}
      onContinueEditing={cancelDiscard}
      onDiscardChanges={confirmDiscard}
    />
    </>
  );
}