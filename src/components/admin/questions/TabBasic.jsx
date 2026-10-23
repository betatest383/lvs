import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PURPOSE_COLOR } from '@/lib/inspectionMetadataConfig';
import { sectionLabel, getSectionPosition, computeNextSortOrder } from '@/lib/inspectionQuestionOrdering';
import { INSPECTION_MODULES } from '@/lib/inspectionModules';

const MODULES = INSPECTION_MODULES.map(m => ({ value: m.key, label: m.label }));

const QUESTION_TYPES = [
  { value: 'yes_no', label: 'Yes/No' },
  { value: 'select', label: 'Single Select' },
  { value: 'multi_select', label: 'Multi Select' },
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'photo', label: 'Photo' },
  { value: 'rating', label: 'Rating (1-5)' },
];

const SECTIONS = [
  { value: 'general_info', label: 'General Info' },
  { value: 'exterior', label: 'Exterior' },
  { value: 'interior', label: 'Interior' },
  { value: 'firebox', label: 'Firebox' },
  { value: 'damper', label: 'Damper' },
  { value: 'flue', label: 'Flue' },
  { value: 'chimney_cap', label: 'Chimney Cap' },
  { value: 'crown', label: 'Crown' },
  { value: 'flashing', label: 'Flashing' },
  { value: 'smoke_chamber', label: 'Smoke Chamber' },
  { value: 'liner', label: 'Liner' },
  { value: 'hearth', label: 'Hearth' },
  { value: 'clearances', label: 'Clearances' },
  { value: 'carbon_monoxide', label: 'Carbon Monoxide' },
  { value: 'water_damage', label: 'Water Damage' },
  { value: 'structural', label: 'Structural' },
  { value: 'other', label: 'Other' },
];

const ROLES = [
  { value: 'observation', label: 'Observation' },
  { value: 'measurement', label: 'Measurement' },
  { value: 'photo', label: 'Photo' },
  { value: 'calculation_input', label: 'Calculation Input' },
  { value: 'derived_result', label: 'Derived Result' },
  { value: 'verification', label: 'Verification' },
  { value: 'customer_information', label: 'Customer Information' },
  { value: 'administrative', label: 'Administrative' },
];

const CATEGORIES = [
  'Clearance to Combustibles','Chimney Crown','Chimney Cap','Chase Cover','Flashing',
  'Brick / Masonry','Mortar Joints','Chimney Liner','Smoke Chamber','Firebox',
  'Damper','Hearth Extension','Appliance Venting','Wood Stove','Gas Appliance',
  'Pellet Appliance','Boiler / Furnace Venting','Water Intrusion','Animal Entry',
  'Structural Stability','Roof Access','Safety Equipment','Customer Concern',
  'Measurements','Photos','Administrative',
];

const PURPOSES = [
  'safety','nfpa_code_compliance','documentation','customer_education',
  'estimate_generation','material_calculation','repair_recommendation',
  'before_after_gallery','before_gallery','after_gallery','customer_presentation',
  'internal_technician_notes','sales_opportunity','warranty','membership',
  'scheduling','warehouse_planning','fleet_planning','analytics','administrative',
];

const PURPOSE_LABELS = {
  safety: 'Safety', nfpa_code_compliance: 'NFPA / Code Compliance', documentation: 'Documentation',
  customer_education: 'Customer Education', estimate_generation: 'Estimate Generation',
  material_calculation: 'Material Calculation', repair_recommendation: 'Repair Recommendation',
  before_after_gallery: 'Before / After Gallery', before_gallery: 'Before Gallery',
  after_gallery: 'After Gallery', customer_presentation: 'Customer Presentation',
  internal_technician_notes: 'Internal Technician Notes', sales_opportunity: 'Sales Opportunity',
  warranty: 'Warranty', membership: 'Membership', scheduling: 'Scheduling',
  warehouse_planning: 'Warehouse Planning', fleet_planning: 'Fleet Planning',
  analytics: 'Analytics', administrative: 'Administrative',
  };

  const PLACEMENT_MODES = [
  { value: 'standard_sort', label: 'Standard Sort Order' },
  { value: 'fixed_after_selected', label: 'Fixed After Selected Question' },
  { value: 'after_last_visible_trigger', label: 'After Last Visible Triggering Dependency' },
  ];

  export default function TabBasic({ form, set, questions }) {
  const purposes = form.question_purpose || [];
  const placementMode = form.placement_mode || 'standard_sort';
  const anchorEnabled = placementMode === 'fixed_after_selected';
  const sortInformational = placementMode === 'after_last_visible_trigger';

  const togglePurpose = (p) => {
    const next = purposes.includes(p) ? purposes.filter(x => x !== p) : [...purposes, p];
    set('question_purpose', next);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Question Text *</Label>
        <Textarea rows={2} value={form.question_text || ''} onChange={e => set('question_text', e.target.value)}
          placeholder="e.g. Is there visible cracking in the firebox?" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Section</Label>
          <Select value={form.category || 'other'} onValueChange={v => set('category', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SECTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Subsection</Label>
          <Input value={form.subsection || ''} onChange={e => set('subsection', e.target.value)} placeholder="e.g. Firebox — Back Wall" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Interior / Exterior / Both</Label>
          <Select value={form.inspection_type || 'interior'} onValueChange={v => set('inspection_type', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="interior">Interior</SelectItem>
              <SelectItem value="exterior">Exterior</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Question Type</Label>
          <Select value={form.question_type || 'yes_no'} onValueChange={v => set('question_type', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {QUESTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {['select', 'multi_select'].includes(form.question_type) && (
        <div>
          <Label>Answer Options <span className="text-muted-foreground font-normal">(comma separated)</span></Label>
          <Input value={form.answer_options || ''} onChange={e => set('answer_options', e.target.value)} placeholder="Good, Fair, Poor, Damaged" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Sort Order {sortInformational && <span className="text-muted-foreground font-normal">(informational only)</span>}</Label>
          <Input type="number" value={form.sort_order || (questions ? computeNextSortOrder(questions, form.inspection_type, form.category) : 0)} onChange={e => set('sort_order', Number(e.target.value))} />
          {questions && (
            <p className="text-xs text-muted-foreground mt-1">
              {form.id ? 'Position' : 'Will be'}: Question {getSectionPosition(questions, form)} in {sectionLabel(form.category)}
            </p>
          )}
          {sortInformational && (
            <p className="text-xs text-amber-600 mt-1">
              Placement is computed dynamically in this mode — Sort Order only breaks ties among siblings.
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 pt-6">
          <Switch checked={!!form.required_flag} onCheckedChange={v => set('required_flag', v)} />
          <Label>Required</Label>
        </div>
      </div>

      <div>
        <Label>Placement Mode</Label>
        <Select value={placementMode} onValueChange={v => set('placement_mode', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {PLACEMENT_MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          Choose how this question is positioned. "Standard Sort Order" uses Sort Order. "Fixed After Selected Question" pins it below a chosen anchor. "After Last Visible Triggering Dependency" renders it immediately after the last visible referenced dependency whose condition is met — for follow-ups with multiple possible triggers (e.g. a firebox photo triggered by any of several firebox questions).
        </p>
      </div>

      <div className={anchorEnabled ? '' : 'opacity-50 pointer-events-none'}>
        <Label>Display After (Anchor) <span className="text-muted-foreground font-normal">(used only with Fixed mode)</span></Label>
        <Select disabled={!anchorEnabled} value={form.display_after_question_id || 'none'} onValueChange={v => set('display_after_question_id', v === 'none' ? '' : v)}>
          <SelectTrigger><SelectValue placeholder="Use Sort Order (no anchor)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Use Sort Order (no anchor) —</SelectItem>
            {(questions || [])
              .filter(q => q.id !== form.id && (q.inspection_type === 'both' || (q.inspection_type || 'interior') === (form.inspection_type || 'interior')))
              .sort((a, b) => (Number(a.sort_order) || Infinity) - (Number(b.sort_order) || Infinity) || String(a.question_text || '').localeCompare(String(b.question_text || '')))
              .map(q => (
                <SelectItem key={q.id} value={q.id}>
                  {(q.sort_order != null && q.sort_order !== 0 ? `${q.sort_order}. ` : '')}{q.question_text || '(untitled)'}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          Used with "Fixed After Selected Question" mode. This question renders directly below the selected anchor whenever its own visibility condition is met — even if Sort Order would place it elsewhere. Sort Order then only orders siblings sharing the same anchor.
        </p>
      </div>

      <div>
        <Label>Help Text</Label>
        <Input value={form.help_text || ''} onChange={e => set('help_text', e.target.value)} placeholder="Optional hint shown to technician" />
      </div>

      <div>
        <Label>Inspection Module</Label>
        <Select value={form.inspection_module || 'interior'} onValueChange={v => set('inspection_module', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {MODULES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">Every question belongs to ONE module. Shared questions (property info, customer concerns, authorization) belong to Inspection Setup.</p>
      </div>

      <div>
        <Label>Question Role</Label>
        <Select value={form.question_role || 'observation'} onValueChange={v => set('question_role', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Question Category</Label>
        <Select value={form.question_category || ''} onValueChange={v => set('question_category', v)}>
          <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Question Purpose <span className="text-muted-foreground font-normal">(multi-select)</span></Label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {PURPOSES.map(p => {
            const active = purposes.includes(p);
            return (
              <button key={p} type="button" onClick={() => togglePurpose(p)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? `${PURPOSE_COLOR[p] || 'bg-primary text-primary-foreground'} border-transparent`
                    : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                }`}>
                {PURPOSE_LABELS[p]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Switch checked={form.is_active !== false} onCheckedChange={v => set('is_active', v)} />
        <Label>Active (visible on inspection form)</Label>
      </div>
    </div>
  );
}