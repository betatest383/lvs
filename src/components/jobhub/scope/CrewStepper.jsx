import { Minus, Plus } from 'lucide-react';

/**
 * Plus/minus quantity stepper for crew requirements.
 * Prevents negative values.
 */
export default function CrewStepper({ label, value, onChange }) {
  const val = value || 0;
  const dec = () => onChange(Math.max(0, val - 1));
  const inc = () => onChange(val + 1);

  return (
    <div>
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={dec}
          disabled={val <= 0}
          className="w-8 h-8 flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent disabled:opacity-40 disabled:pointer-events-none"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="w-8 text-center text-sm font-semibold">{val}</span>
        <button
          type="button"
          onClick={inc}
          className="w-8 h-8 flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}