import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import { STAGING_TEMPLATES, normalizeEquipmentItems } from './scopeConstants';

/**
 * Staging sequence textarea per day.
 * Auto-populates staging items based on selected equipment.
 */
export default function StagingSequenceField({ value, onChange, equipmentItems = [] }) {
  const items = normalizeEquipmentItems(equipmentItems);
  const applicableTemplates = items
    .map(i => STAGING_TEMPLATES[i])
    .filter(Boolean);

  const hasTemplates = applicableTemplates.length > 0;

  const autoPopulate = () => {
    const lines = [];
    for (const template of applicableTemplates) {
      lines.push(...template);
    }
    const existing = (value || '').trim();
    const newLines = lines.filter(l => !existing.includes(l));
    if (newLines.length === 0) return;
    const combined = existing
      ? existing + '\n' + newLines.join('\n')
      : newLines.join('\n');
    onChange(combined);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Staging Sequence</Label>
        {hasTemplates && (
          <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={autoPopulate}>
            <Sparkles className="w-3 h-3" /> Auto-fill from equipment
          </Button>
        )}
      </div>
      <Textarea
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder="What needs to be staged this day? (e.g. Stage scaffold on driveway side, Stage crown materials near chimney...)"
        rows={3}
        className="text-sm"
      />
    </div>
  );
}