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
  TRAINING_TYPES, RENEWAL_FREQUENCY_OPTIONS, TRAINING_REGISTRY_LINK_CONFIG, CERTIFICATION_OPTIONS
} from '@/lib/trainingRegistryConstants';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';
import { DEPARTMENTS } from '@/lib/roleRegistryConstants';

export default function TrainingFormDialog({ open, onOpenChange, initialData, onSave }) {
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
      TRAINING_REGISTRY_LINK_CONFIG.map(async (cfg) => {
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
    if (!data.training_id || !data.training_name) return;
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
      { key: 'training_id', label: 'Training ID', type: 'text', required: true, placeholder: 'TRN-001' },
      { key: 'training_name', label: 'Training Name', type: 'text', required: true, placeholder: 'LVC OS Foundations' },
      { key: 'department', label: 'Department', type: 'select', options: DEPARTMENTS },
      { key: 'training_type', label: 'Training Type', type: 'select', options: TRAINING_TYPES },
      { key: 'estimated_completion_time', label: 'Estimated Completion Time', type: 'text', placeholder: 'e.g. 30 min, 2 hours' },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Describe the training...' },
    ]},
    { id: 'ownership', label: 'Ownership & Status', fields: [
      { key: 'training_owner', label: 'Training Owner', type: 'text', placeholder: 'e.g. Director of Operations' },
      { key: 'status', label: 'Status', type: 'select', options: ['Draft', 'Active', 'Under Review', 'Retired'] },
      { key: 'version', label: 'Version', type: 'text', placeholder: '1.0' },
      { key: 'trainual_link', label: 'Trainual Link', type: 'text', placeholder: 'https://...' },
    ]},
    { id: 'links', label: 'Relationships', fields: [
      ...TRAINING_REGISTRY_LINK_CONFIG.map(cfg => ({
        key: cfg.field, label: cfg.label, type: 'registry_link', config: cfg,
      })),
      { key: 'related_certifications', label: 'Related Certifications', type: 'multi_select', options: CERTIFICATION_OPTIONS },
    ]},
    { id: 'quiz', label: 'Quiz & Renewal', fields: [
      { key: 'quiz_required', label: 'Quiz Required', type: 'boolean' },
      { key: 'passing_score', label: 'Passing Score (%)', type: 'number' },
      { key: 'renewal_required', label: 'Renewal Required', type: 'boolean' },
      { key: 'renewal_frequency', label: 'Renewal Frequency', type: 'select', options: RENEWAL_FREQUENCY_OPTIONS },
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
        return <Input type="number" value={value ?? ''} onChange={e => updateField(field.key, e.target.value ? Number(e.target.value) : null)} placeholder="e.g. 80" />;
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
      case 'multi_select':
        return (
          <div className="grid grid-cols-2 gap-2 rounded-md border border-input p-3 max-h-40 overflow-y-auto">
            {field.options.map(opt => {
              const checked = Array.isArray(value) && value.includes(opt);
              return (
                <div key={opt} className="flex items-center gap-2">
                  <Checkbox checked={checked} onCheckedChange={() => toggleArrayValue(field.key, opt)} />
                  <span className="text-sm">{opt}</span>
                </div>
              );
            })}
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