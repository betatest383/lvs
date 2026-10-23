import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const PHOTO_REQUIREMENT_MODES = [
  { value: 'not_required', label: 'Not Required', desc: 'No photo enforcement' },
  { value: 'optional', label: 'Optional', desc: 'Photos allowed but not enforced' },
  { value: 'required_on_pass', label: 'Required on Pass', desc: 'Photos required when answer is Pass / Yes' },
  { value: 'required_on_fail', label: 'Required on Fail', desc: 'Photos required when answer is Fail / No / Deficient' },
  { value: 'always_required', label: 'Always Required', desc: 'Photos required regardless of answer' },
  { value: 'specific_answers', label: 'Required for Selected Answer(s)', desc: 'Photos required only when the answer matches a selected value' },
];

/**
 * Parses answer_options (comma-separated string) into a clean array.
 */
function parseAnswerOptions(form) {
  const raw = form.answer_options || '';
  return raw.split(',').map(o => o.trim()).filter(Boolean);
}

/**
 * Multi-select checkbox list for choosing which answer values trigger the photo requirement.
 */
function AnswerValueSelector({ form, set }) {
  const options = parseAnswerOptions(form);
  const selected = Array.isArray(form.photo_required_answer_values)
    ? form.photo_required_answer_values
    : [];

  const toggle = (value) => {
    const normalized = value.toLowerCase().trim();
    const current = selected.map(v => String(v).toLowerCase().trim());
    const next = current.includes(normalized)
      ? selected.filter((_, i) => current[i] !== normalized)
      : [...selected, value];
    set('photo_required_answer_values', next);
  };

  if (options.length === 0) {
    return (
      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
        No answer options configured for this question. Add answer options (comma-separated) on the Basic tab to enable answer-specific photo requirements.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">
        Select which answer value(s) will trigger the photo requirement. The technician's answer is compared case-insensitively.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {options.map(opt => {
          const isSelected = selected.some(v => String(v).toLowerCase().trim() === opt.toLowerCase().trim());
          return (
            <label
              key={opt}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                isSelected ? 'bg-primary/10 border-primary' : 'border-input hover:bg-muted/50'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(opt)}
                className="rounded"
              />
              <span>{opt}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function PhotoToggle({ form, set, field, label, desc, disabled }) {
  return (
    <div className={`flex items-center justify-between p-3 bg-muted/50 rounded-lg border ${disabled ? 'opacity-50' : ''}`}>
      <div>
        <p className="text-sm font-medium">{label}</p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      <Switch checked={!!form[field]} onCheckedChange={v => set(field, v)} disabled={disabled} />
    </div>
  );
}

export default function TabPhotos({ form, set }) {
  const mode = form.photo_requirement || 'not_required';
  const modeConfig = PHOTO_REQUIREMENT_MODES.find(m => m.value === mode);
  const isEnforced = mode !== 'not_required' && mode !== 'optional';

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
        Photo requirements are configurable independently of the question type. Any question (Yes/No, Pass/Fail, Multiple Choice, Number, Measurement, Text, Dropdown) can require photos.
      </div>

      {/* Photo Requirement */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Photo Requirement</Label>
        <Select value={mode} onValueChange={v => set('photo_requirement', v)}>
          <SelectTrigger>
            <SelectValue placeholder="Select photo requirement" />
          </SelectTrigger>
          <SelectContent>
            {PHOTO_REQUIREMENT_MODES.map(m => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {modeConfig?.desc && <p className="text-xs text-muted-foreground">{modeConfig.desc}</p>}
      </div>

      {/* Answer-value selector for specific_answers mode */}
      {mode === 'specific_answers' && (
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Required Answer Value(s)</Label>
          <AnswerValueSelector form={form} set={set} />
        </div>
      )}

      {/* Minimum / Maximum Photos */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Minimum Photos</Label>
          <Input
            type="number"
            min="0"
            value={form.minimum_photos ?? 0}
            onChange={e => set('minimum_photos', Math.max(0, Number(e.target.value) || 0))}
            disabled={!isEnforced}
          />
          <p className="text-xs text-muted-foreground">Whole number. Default 0.</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Maximum Photos</Label>
          <Input
            type="number"
            min="0"
            value={form.maximum_photos ?? ''}
            onChange={e => set('maximum_photos', e.target.value ? Number(e.target.value) : null)}
            placeholder="No limit"
          />
          <p className="text-xs text-muted-foreground">Optional. Blank = no limit.</p>
        </div>
      </div>

      {/* Caption / Annotation / Measurement Photo */}
      <div className="grid grid-cols-1 gap-2">
        <PhotoToggle form={form} set={set} field="require_caption" label="Require Caption" desc="Each attached photo must include a text caption" disabled={!isEnforced} />
        <PhotoToggle form={form} set={set} field="require_annotation" label="Require Annotation" desc="Each attached photo must be annotated" disabled={!isEnforced} />
        <PhotoToggle form={form} set={set} field="require_measurement_photo" label="Require Measurement Photo" desc="At least one photo must be a measurement photo" disabled={!isEnforced} />
      </div>

      {/* Enforcement */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
        <p className="text-sm font-medium text-amber-900">Enforcement</p>
        <PhotoToggle form={form} set={set} field="allow_photo_override" label="Allow Manager Override" desc="When off, the technician cannot bypass the photo requirement" disabled={!isEnforced} />
        <PhotoToggle form={form} set={set} field="photo_override_reason_required" label="Override Reason Required" desc="When on, a manager override must include a written reason" disabled={!isEnforced || !form.allow_photo_override} />
        {!isEnforced && (
          <p className="text-xs text-amber-700">Photo requirement is not enforced for the current mode.</p>
        )}
      </div>

      {/* Legacy toggle (kept for backward compatibility) */}
      <details className="rounded-lg border p-3">
        <summary className="text-sm font-medium cursor-pointer">Advanced / Legacy Photo Settings</summary>
        <div className="space-y-3 mt-3">
          <PhotoToggle form={form} set={set} field="photo_required" label="Photo Required (legacy flag)" desc="Legacy boolean. Prefer the Photo Requirement mode above." />
          <PhotoToggle form={form} set={set} field="allow_annotation" label="Allow Annotation" desc="Technician can annotate photos" />
          <PhotoToggle form={form} set={set} field="photo_description_required" label="Photo Description Required" desc="Technician must add a text description" />
          <div>
            <Label>Photo Labels</Label>
            <Input value={form.photo_labels_config || ''} onChange={e => set('photo_labels_config', e.target.value)}
              placeholder="e.g. Overview, Close-up, Angle shot" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <PhotoToggle form={form} set={set} field="photo_customer_visible" label="Customer Visible" />
            <PhotoToggle form={form} set={set} field="photo_internal_only" label="Internal Only" />
            <PhotoToggle form={form} set={set} field="photo_before_gallery" label="Before Gallery" />
            <PhotoToggle form={form} set={set} field="photo_after_gallery" label="After Gallery" />
            <PhotoToggle form={form} set={set} field="photo_customer_presentation" label="Customer Presentation" />
          </div>
        </div>
      </details>
    </div>
  );
}