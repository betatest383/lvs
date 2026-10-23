import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AUTHORITY_COLORS, RISK_FLAGS } from '@/lib/inspectionStandardConstants';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

function safeParseJSON(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

function MultiSelect({ value, options, onChange }) {
  const arr = Array.isArray(value) ? value : [];
  const toggle = (opt) => {
    if (arr.includes(opt)) onChange(arr.filter(x => x !== opt));
    else onChange([...arr, opt]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => {
        const active = arr.includes(opt);
        const colorClass = AUTHORITY_COLORS[opt] || 'bg-primary text-primary-foreground';
        return (
          <button key={opt} type="button" onClick={() => toggle(opt)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              active ? `${colorClass} border-transparent` : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
            }`}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function AuthorityEditor({ value, onChange }) {
  const details = safeParseJSON(value, []);
  const update = (idx, field, val) => {
    const next = [...details];
    next[idx] = { ...next[idx], [field]: val };
    onChange(JSON.stringify(next));
  };
  const addRow = () => onChange(JSON.stringify([...details, { authority_name: '', section: '', paragraph: '', url: '', reference_notes: '' }]));
  const removeRow = (idx) => onChange(JSON.stringify(details.filter((_, i) => i !== idx)));

  return (
    <div className="space-y-2">
      {details.map((d, idx) => (
        <div key={idx} className="p-3 border rounded-lg space-y-2 bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Reference {idx + 1}</span>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRow(idx)}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Authority Name (e.g. NFPA 211)" value={d.authority_name || ''} onChange={e => update(idx, 'authority_name', e.target.value)} className="h-8 text-sm" />
            <Input placeholder="Section (e.g. §13.1.1)" value={d.section || ''} onChange={e => update(idx, 'section', e.target.value)} className="h-8 text-sm" />
          </div>
          <Input placeholder="Paragraph / Clause" value={d.paragraph || ''} onChange={e => update(idx, 'paragraph', e.target.value)} className="h-8 text-sm" />
          <Input placeholder="URL or Reference" value={d.url || ''} onChange={e => update(idx, 'url', e.target.value)} className="h-8 text-sm" />
          <Textarea placeholder="Reference Notes" value={d.reference_notes || ''} onChange={e => update(idx, 'reference_notes', e.target.value)} rows={2} className="text-sm" />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1">
        <Plus className="w-3 h-3" /> Add Authority Reference
      </Button>
    </div>
  );
}

function RiskFlags({ form, set }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      {RISK_FLAGS.map(flag => {
        const active = !!form[flag.key];
        return (
          <label key={flag.key} className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition-colors ${active ? flag.color : 'border-border hover:bg-muted/50'}`}>
            <Switch checked={active} onCheckedChange={v => set(flag.key, v)} />
            <span className="text-xs font-medium">{flag.label}</span>
          </label>
        );
      })}
    </div>
  );
}

export default function StandardField({ field, form, set }) {
  const value = form[field.key];
  const isFull = field.full;

  const wrapperClass = isFull ? 'space-y-1' : 'space-y-1';

  const renderInput = () => {
    switch (field.type) {
      case 'textarea':
        return <Textarea rows={3} value={value || ''} onChange={e => set(field.key, e.target.value)} placeholder={field.placeholder || ''} className="text-sm" />;
      case 'select':
        return (
          <Select value={value || ''} onValueChange={v => set(field.key, v)}>
            <SelectTrigger><SelectValue placeholder={field.placeholder || 'Select...'} /></SelectTrigger>
            <SelectContent>
              {field.options.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'multiselect':
        return <MultiSelect value={value || []} options={field.options} onChange={v => set(field.key, v)} />;
      case 'number':
        return <Input type="number" value={value ?? ''} onChange={e => set(field.key, e.target.value === '' ? null : Number(e.target.value))} placeholder={field.placeholder || ''} />;
      case 'date':
        return <Input type="date" value={value || ''} onChange={e => set(field.key, e.target.value)} />;
      case 'authority_editor':
        return <AuthorityEditor value={value || ''} onChange={v => set(field.key, v)} />;
      case 'risk_flags':
        return <RiskFlags form={form} set={set} />;
      default:
        return <Input value={value || ''} onChange={e => set(field.key, e.target.value)} placeholder={field.placeholder || ''} />;
    }
  };

  return (
    <div className={wrapperClass}>
      <Label className="text-xs font-medium">
        {field.label}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {renderInput()}
    </div>
  );
}