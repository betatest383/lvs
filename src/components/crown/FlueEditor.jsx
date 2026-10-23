import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2 } from 'lucide-react';

/**
 * Repeatable flue section with Add Flue.
 * Each flue has length and width in inches.
 * Shows the calculated foam for each flue: (2×L) + (2×W) + 6
 */
export default function FlueEditor({ flues = [], onChange }) {
  const addFlue = () => onChange([...flues, { length: '', width: '' }]);

  const updateFlue = (idx, field, val) =>
    onChange(flues.map((f, i) => (i === idx ? { ...f, [field]: val } : f)));

  const removeFlue = (idx) =>
    onChange(flues.filter((_, i) => i !== idx));

  const calcFoam = (f) => {
    const l = Number(f.length) || 0;
    const w = Number(f.width) || 0;
    return (2 * l + 2 * w + 6) || 0;
  };

  const calcArea = (f) => {
    const l = Number(f.length) || 0;
    const w = Number(f.width) || 0;
    return (l * w) || 0;
  };

  return (
    <div className="space-y-2">
      {flues.length === 0 && (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          No flues added. Click "Add Flue" to add flue tile dimensions.
        </div>
      )}

      {flues.map((flue, idx) => (
        <div key={idx} className="flex flex-wrap items-end gap-3 rounded-lg border p-3 bg-muted/20">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="h-6 w-6 justify-center p-0 text-xs">#{idx + 1}</Badge>
          </div>
          <div className="flex-1 min-w-[120px]">
            <Label className="text-xs text-muted-foreground">Length (in)</Label>
            <Input
              type="number"
              step="0.01"
              className="h-9"
              value={flue.length}
              onChange={(e) => updateFlue(idx, 'length', e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <Label className="text-xs text-muted-foreground">Width (in)</Label>
            <Input
              type="number"
              step="0.01"
              className="h-9"
              value={flue.width}
              onChange={(e) => updateFlue(idx, 'width', e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="text-xs text-muted-foreground space-y-0.5 pb-2 min-w-[100px]">
            <p>Area: <span className="font-medium text-foreground">{calcArea(flue).toFixed(2)} sq in</span></p>
            <p>Foam: <span className="font-medium text-foreground">{calcFoam(flue)} in</span></p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="text-red-600 hover:text-red-700 h-9 w-9"
            onClick={() => removeFlue(idx)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={addFlue} className="gap-1.5">
        <Plus className="w-4 h-4" /> Add Flue
      </Button>
    </div>
  );
}