import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const SEVERITIES = [
  { value: 'info', label: 'Info' },
  { value: 'minor', label: 'Minor' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'major', label: 'Major' },
  { value: 'critical', label: 'Critical' },
];

const REPAIR_SYSTEMS = [
  { value: 'none', label: 'None' },
  { value: 'crown', label: 'Crown' },
  { value: 'masonry', label: 'Masonry' },
  { value: 'liner', label: 'Liner' },
  { value: 'smoke_chamber', label: 'Smoke Chamber' },
  { value: 'cap_chase', label: 'Cap / Chase' },
  { value: 'other', label: 'Other' },
];

export default function TabRepairEstimates({ form, set, linkedMappings }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
        <div>
          <p className="text-sm font-medium">Creates Finding</p>
          <p className="text-xs text-muted-foreground">This question produces a deficiency finding when triggered</p>
        </div>
        <Switch checked={!!form.creates_finding} onCheckedChange={v => set('creates_finding', v)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Finding Type</Label>
          <Input value={form.finding_type_config || ''} onChange={e => set('finding_type_config', e.target.value)}
            placeholder="e.g. cracked_crown" />
        </div>
        <div>
          <Label>Severity</Label>
          <Select value={form.severity_config || ''} onValueChange={v => set('severity_config', v)}>
            <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {SEVERITIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Repair System</Label>
          <Select value={form.repair_system_config || 'none'} onValueChange={v => set('repair_system_config', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {REPAIR_SYSTEMS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Confidence Weight</Label>
          <Input type="number" value={form.confidence_weight || 0} onChange={e => set('confidence_weight', Number(e.target.value))} />
        </div>
      </div>

      <div>
        <Label>Suggested Pricebook Item</Label>
        <Input value={form.suggested_pricebook_item || ''} onChange={e => set('suggested_pricebook_item', e.target.value)}
          placeholder="e.g. Crown Seal Repair" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Good Option</Label>
          <Input value={form.good_option || ''} onChange={e => set('good_option', e.target.value)} placeholder="e.g. Crown Seal" />
        </div>
        <div>
          <Label>Better Option</Label>
          <Input value={form.better_option || ''} onChange={e => set('better_option', e.target.value)} placeholder="e.g. Crown Repair" />
        </div>
        <div>
          <Label>Best Option</Label>
          <Input value={form.best_option || ''} onChange={e => set('best_option', e.target.value)} placeholder="e.g. Crown Replace" />
        </div>
      </div>

      <div>
        <Label>Customer Explanation</Label>
        <Textarea rows={2} value={form.customer_explanation || ''} onChange={e => set('customer_explanation', e.target.value)}
          placeholder="Customer-facing description of what this repair addresses" />
      </div>

      <div>
        <Label>Internal Notes</Label>
        <Textarea rows={2} value={form.internal_repair_notes || ''} onChange={e => set('internal_repair_notes', e.target.value)}
          placeholder="Internal notes about this repair configuration" />
      </div>

      {/* Existing Pricebook Mappings (read-only) */}
      {linkedMappings.length > 0 && (
        <div>
          <Label>Existing Pricebook Mappings</Label>
          <div className="mt-1.5 space-y-1.5">
            {linkedMappings.map(m => (
              <div key={m.id} className="flex items-center gap-2 p-2.5 bg-muted/30 rounded-lg border">
                <Badge variant="outline" className="text-[10px] capitalize">{m.option_tier || 'standalone'}</Badge>
                <span className="text-sm font-medium flex-1 truncate">{m.pricebook_item_name}</span>
                <span className="text-xs text-muted-foreground">${m.unit_price || 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}