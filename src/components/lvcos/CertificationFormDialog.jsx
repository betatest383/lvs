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
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import {
  CERTIFICATION_TYPES, RENEWAL_FREQUENCY_OPTIONS, CERTIFICATION_REGISTRY_LINK_CONFIG
} from '@/lib/certificationRegistryConstants';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';
import { DEPARTMENTS } from '@/lib/roleRegistryConstants';

export default function CertificationFormDialog({ open, onOpenChange, initialData, onSave }) {
  const [data, setData] = useState(initialData || {});
  const [saving, setSaving] = useState(false);
  const [registryOptions, setRegistryOptions] = useState({});
  const [loadingRegistries, setLoadingRegistries] = useState(false);
  const [expandedSection, setExpandedSection] = useState('basic');

  useEffect(() => { setData(initialData || {}); }, [initialData]);

  useEffect(() => {
    if (!open) return;
    setLoadingRegistries(true);
    Promise.all(
      CERTIFICATION_REGISTRY_LINK_CONFIG.map(async (cfg) => {
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
    if (!data.certification_id || !data.certification_name) return;
    setSaving(true);
    try {
      await onSave(data);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const sections = [
    { id: 'basic', label: 'Basic Info', fields: [
      { key: 'certification_id', label: 'Certification ID', type: 'text', required: true, placeholder: 'CERT-001' },
      { key: 'certification_name', label: 'Certification Name', type: 'text', required: true, placeholder: 'Forklift Certification' },
      { key: 'department', label: 'Department', type: 'select', options: DEPARTMENTS },
      { key: 'certification_type', label: 'Certification Type', type: 'select', options: CERTIFICATION_TYPES },
      { key: 'issuing_organization', label: 'Issuing Organization', type: 'text', placeholder: 'e.g. OSHA, manufacturer' },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Describe the certification...' },
    ]},
    { id: 'renewal', label: 'Renewal & Expiration', fields: [
      { key: 'renewal_required', label: 'Renewal Required', type: 'boolean' },
      { key: 'renewal_frequency', label: 'Renewal Frequency', type: 'select', options: RENEWAL_FREQUENCY_OPTIONS },
      { key: 'expiration_tracking_required', label: 'Expiration Tracking Required', type: 'boolean' },
      { key: 'default_validity_period', label: 'Default Validity Period (Months)', type: 'number' },
    ]},
    { id: 'ownership', label: 'Ownership & Status', fields: [
      { key: 'status', label: 'Status', type: 'select', options: ['Draft', 'Active', 'Under Review', 'Retired'] },
      { key: 'trainual_link', label: 'Trainual Link', type: 'text', placeholder: 'https://...' },
    ]},
    { id: 'links', label: 'Relationships', fields: [
      ...CERTIFICATION_REGISTRY_LINK_CONFIG.map(cfg => ({
        key: cfg.field, label: cfg.label, type: 'registry_link', config: cfg,
      })),
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
      case 'number':
        return <Input type="number" value={value ?? ''} onChange={e => updateField(field.key, e.target.value ? Number(e.target.value) : null)} placeholder="e.g. 12" />;
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