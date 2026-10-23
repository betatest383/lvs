import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';
import { ROOF_PITCH_OPTIONS } from './scopeConstants';

/**
 * Two checkbox options for roof pitch.
 * Only one can be selected unless manager/admin override.
 * Shows safety warning when 6/12 to 12/12 is selected.
 */
export default function RoofPitchSelector({ selected = [], onChange, allowMultiple = false }) {
  const toggle = (value) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
      return;
    }
    if (allowMultiple) {
      onChange([...selected, value]);
    } else {
      onChange([value]);
    }
  };

  const showWarning = selected.includes('6_12_to_12_12');

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Roof Pitch</Label>
      <div className="grid grid-cols-2 gap-2">
        {ROOF_PITCH_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
              selected.includes(opt.value)
                ? 'border-accent bg-accent/10 text-accent-foreground'
                : 'border-input bg-background hover:bg-accent/5'
            }`}
          >
            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
              selected.includes(opt.value) ? 'border-accent bg-accent text-white' : 'border-input'
            }`}>
              {selected.includes(opt.value) && '✓'}
            </span>
            {opt.label}
          </button>
        ))}
      </div>
      {showWarning && (
        <div className="flex items-start gap-1.5 rounded-md bg-amber-50 border border-amber-200 p-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700">
            Steep roof condition selected. Review fall protection and access requirements.
          </p>
        </div>
      )}
    </div>
  );
}