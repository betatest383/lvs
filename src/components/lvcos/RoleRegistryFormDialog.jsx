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
import { DEPARTMENTS, PERMISSION_LEVELS, PORTALS, PERMISSION_FLAGS, REGISTRY_LINK_CONFIG, SOFTWARE_OPTIONS, CERTIFICATION_OPTIONS } from '@/lib/roleRegistryConstants';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

export default function RoleRegistryFormDialog({ open, onOpenChange, initialData, onSave, allRoles }) {
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
      REGISTRY_LINK_CONFIG.map(async (cfg) => {
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
    if (!data.role_id || !data.role_name) return;
    setSaving(true);
    try {
      await onSave(data);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const otherRoles = (allRoles || []).filter(r => r.id !== initialData?.id);

  const sections = [
    { id: 'basic', label: 'Basic Info', fields: [
      { key: 'role_id', label: 'Role ID', type: 'text', required: true, placeholder: 'ROLE-001' },
      { key: 'role_name', label: 'Role Name', type: 'text', required: true, placeholder: 'Lead Technician' },
      { key: 'department', label: 'Department', type: 'select', options: DEPARTMENTS },
      { key: 'role_description', label: 'Role Description', type: 'textarea', placeholder: 'Describe the role...' },
    ]},
    { id: 'hierarchy', label: 'Hierarchy & Reports', fields: [
      { key: 'reports_to', label: 'Reports To', type: 'select', options: otherRoles.map(r => r.role_name) },
      { key: 'supervises', label: 'Supervises', type: 'multi_select', options: otherRoles.map(r => r.role_name) },
    ]},
    { id: 'portal', label: 'Portal & Dashboard', fields: [
      { key: 'default_portal', label: 'Default Portal', type: 'select', options: PORTALS.map(p => p.value) },
      { key: 'dashboard', label: 'Dashboard', type: 'text', placeholder: 'e.g. Operations Center' },
      { key: 'home_screen', label: 'Home Screen', type: 'text', placeholder: 'e.g. /tech/dashboard' },
      { key: 'trainual_document', label: 'Trainual Document URL', type: 'text', placeholder: 'https://...' },
    ]},
    { id: 'training', label: 'Training & Requirements', fields: [
      ...REGISTRY_LINK_CONFIG.map(cfg => ({
        key: cfg.field, label: cfg.label, type: 'registry_link', config: cfg,
      })),
      { key: 'required_equipment_package', label: 'Required Equipment Package', type: 'text', placeholder: 'PKG-LT-001' },
      { key: 'required_certifications', label: 'Required Certifications', type: 'multi_select', options: CERTIFICATION_OPTIONS },
      { key: 'required_software', label: 'Required Software', type: 'multi_select', options: SOFTWARE_OPTIONS },
    ]},
    { id: 'permissions', label: 'Permissions', fields: [
      { key: 'permission_level', label: 'Permission Level', type: 'select', options: PERMISSION_LEVELS.map(p => p.value) },
      ...PERMISSION_FLAGS.map(f => ({ key: f.key, label: f.label, type: 'boolean', description: f.description })),
    ]},
    { id: 'career', label: 'Career Path', fields: [
      { key: 'career_path_from', label: 'Promoted From', type: 'multi_select', options: otherRoles.map(r => r.role_name) },
      { key: 'career_path_to', label: 'Promotes To', type: 'multi_select', options: otherRoles.map(r => r.role_name) },
    ]},
    { id: 'admin', label: 'Admin', fields: [
      { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Draft', 'Planned', 'Retired'] },
      { key: 'sort_order', label: 'Sort Order', type: 'text', placeholder: '0' },
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
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Switch checked={value || false} onCheckedChange={v => updateField(field.key, v)} />
              <span className="text-sm text-muted-foreground">{value ? 'Yes' : 'No'}</span>
            </div>
            {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
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
              <p className="text-xs text-muted-foreground text-center py-2">No records found in {field.config.entity}</p>
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