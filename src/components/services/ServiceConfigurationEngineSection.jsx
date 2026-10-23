import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ChevronDown, Settings2, DollarSign, Users, Wrench, ClipboardList, FileText } from 'lucide-react';

/**
 * Collapsible "Service Configuration Engine" section for the Service Catalog edit form.
 * Exposes pricing, labor, equipment, scope of work, and proposal configuration fields.
 * All JSON-string fields use Textareas with format hints.
 */
export default function ServiceConfigurationEngineSection({ form, set }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-purple-200 bg-purple-50/30 overflow-hidden">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between p-3 hover:bg-purple-50/50 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Settings2 className="w-4 h-4 text-purple-600" />
            Service Configuration Engine
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="p-3 pt-0 space-y-5">
          {/* Pricing */}
          <SubGroup icon={<DollarSign className="w-3.5 h-3.5 text-green-600" />} title="Pricing">
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <Label>Internal Cost ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.internal_cost ?? 0}
                  onChange={e => set('internal_cost', Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground mt-1">Single source of truth for cost.</p>
              </div>
              <div>
                <Label>Membership Price ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.membership_price ?? 0}
                  onChange={e => set('membership_price', Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Default Discount (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.default_discount_percent ?? 0}
                  onChange={e => set('default_discount_percent', Number(e.target.value))}
                />
              </div>
            </div>
          </SubGroup>

          {/* Labor */}
          <SubGroup icon={<Users className="w-3.5 h-3.5 text-blue-600" />} title="Labor">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Crew Size Required</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.crew_size_required ?? 1}
                  onChange={e => set('crew_size_required', Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground mt-1">Minimum crew size needed.</p>
              </div>
              <div>
                <Label>Labor Phases (JSON)</Label>
                <Textarea
                  value={form.labor_phases || ''}
                  onChange={e => set('labor_phases', e.target.value)}
                  rows={4}
                  className="font-mono text-xs"
                  placeholder='[{"phase_name":"Setup","estimated_hours":1,"tasks":["Prep area"]}]'
                />
                <p className="text-xs text-muted-foreground mt-1">Array of phase breakdowns.</p>
              </div>
            </div>
          </SubGroup>

          {/* Equipment */}
          <SubGroup icon={<Wrench className="w-3.5 h-3.5 text-orange-600" />} title="Equipment">
            <div className="space-y-3">
              <div>
                <Label>Required Equipment (JSON)</Label>
                <Textarea
                  value={form.required_equipment || ''}
                  onChange={e => set('required_equipment', e.target.value)}
                  rows={3}
                  className="font-mono text-xs"
                  placeholder='[{"equipment_master_id":"","item_name":"Ladder","quantity":1,"notes":""}]'
                />
              </div>
              <div>
                <Label>Optional Equipment (JSON)</Label>
                <Textarea
                  value={form.optional_equipment || ''}
                  onChange={e => set('optional_equipment', e.target.value)}
                  rows={3}
                  className="font-mono text-xs"
                  placeholder='[{"equipment_master_id":"","item_name":"Camera","quantity":1,"notes":""}]'
                />
              </div>
              <div>
                <Label>Truck Requirements</Label>
                <Input
                  value={form.truck_requirements || ''}
                  onChange={e => set('truck_requirements', e.target.value)}
                  placeholder="e.g. Bucket Truck, Standard Van"
                />
              </div>
            </div>
          </SubGroup>

          {/* Scope of Work */}
          <SubGroup icon={<ClipboardList className="w-3.5 h-3.5 text-indigo-600" />} title="Scope of Work">
            <div>
              <Label>Scope of Work Template (JSON)</Label>
              <Textarea
                value={form.scope_of_work_template || ''}
                onChange={e => set('scope_of_work_template', e.target.value)}
                rows={5}
                className="font-mono text-xs"
                placeholder='{"work_phases":[],"safety_notes":[],"cleanup_tasks":[],"internal_notes":""}'
              />
              <p className="text-xs text-muted-foreground mt-1">
                Defines work phases, safety notes, cleanup tasks, and internal notes.
              </p>
            </div>
          </SubGroup>

          {/* Proposal Configuration */}
          <SubGroup icon={<FileText className="w-3.5 h-3.5 text-pink-600" />} title="Proposal Configuration">
            <div className="space-y-3">
              <div>
                <Label>Default Proposal Tier</Label>
                <Select
                  value={form.proposal_tier || 'standalone'}
                  onValueChange={v => set('proposal_tier', v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="better">Better</SelectItem>
                    <SelectItem value="best">Best</SelectItem>
                    <SelectItem value="standalone">None (Standalone)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Customer Benefits</Label>
                <Textarea
                  value={form.proposal_customer_benefits || ''}
                  onChange={e => set('proposal_customer_benefits', e.target.value)}
                  rows={2}
                  placeholder="Customer-facing benefits text for proposals"
                />
              </div>
              <div>
                <Label>Warranty Messaging</Label>
                <Textarea
                  value={form.proposal_warranty_messaging || ''}
                  onChange={e => set('proposal_warranty_messaging', e.target.value)}
                  rows={2}
                  placeholder="Warranty information shown to customer"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Estimated Duration</Label>
                  <Input
                    value={form.proposal_estimated_duration || ''}
                    onChange={e => set('proposal_estimated_duration', e.target.value)}
                    placeholder="e.g. Half day, 1-2 days"
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    checked={form.proposal_financing_available ?? false}
                    onCheckedChange={v => set('proposal_financing_available', v)}
                  />
                  <Label>Financing Available</Label>
                </div>
              </div>
            </div>
          </SubGroup>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SubGroup({ icon, title, children }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        {icon}
        {title}
      </div>
      <div className="rounded-md bg-background/60 p-2">{children}</div>
    </div>
  );
}