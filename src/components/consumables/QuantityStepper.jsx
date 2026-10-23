import { Minus, Plus } from 'lucide-react';

export default function QuantityStepper({ value, onChange, min = 0 }) {
  const val = value || 0;
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, val - 1))}
        disabled={val <= min}
        className="w-9 h-9 rounded-full border border-border flex items-center justify-center active:bg-primary/10 transition-colors disabled:opacity-30 shrink-0"
      >
        <Minus className="w-4 h-4" />
      </button>
      <span className="w-8 text-center text-lg font-bold tabular-nums">{val}</span>
      <button
        type="button"
        onClick={() => onChange(val + 1)}
        className="w-9 h-9 rounded-full border border-border flex items-center justify-center active:bg-primary/10 transition-colors shrink-0"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}