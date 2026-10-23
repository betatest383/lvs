import { useState } from 'react';
import { Plus, X, Check, Circle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Reusable inline editor for an array of strings.
 * Shows existing items with remove buttons + an add input.
 */
export default function ArrayField({ label, items = [], onChange, placeholder }) {
  const [value, setValue] = useState('');

  const add = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onChange([...(items || []), trimmed]);
    setValue('');
  };

  const remove = (idx) => {
    onChange((items || []).filter((_, i) => i !== idx));
  };

  const hasItems = (items || []).length > 0;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {hasItems ? (
          <Check className="w-4 h-4 text-green-500" />
        ) : (
          <Circle className="w-4 h-4 text-muted-foreground/40" />
        )}
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground ml-auto">{items?.length || 0}</span>
      </div>
      <div className="space-y-1.5">
        {(items || []).map((item, idx) => (
          <div key={idx} className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
            <span className="text-sm flex-1 truncate">{item}</span>
            <button
              onClick={() => remove(idx)}
              className="text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <div className="flex gap-1.5">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder={placeholder || `Add ${label.toLowerCase()}...`}
            className="h-8 text-sm"
          />
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={add} disabled={!value.trim()}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}