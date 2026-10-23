import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export default function CompletionEvidenceSection({ data, updateField, templateDefaults }) {
  const isTemplateDerived = (field) => templateDefaults && templateDefaults[field] !== undefined;

  const toggles = [
    { key: 'require_completion_evidence', label: 'Photo Evidence Required' },
    { key: 'requires_notes', label: 'Notes Required' },
    { key: 'requires_signature', label: 'Signature Required' },
    { key: 'requires_record_id', label: 'Record ID Required' },
    { key: 'requires_manager_verification', label: 'Manager Verification Required' },
    { key: 'training_required_before_start', label: 'Training Completion Required' },
  ];

  return (
    <div className="space-y-3">
      {toggles.map(({ key, label }) => (
        <div key={key} className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs">{label}</span>
            {isTemplateDerived(key) && <Badge variant="secondary" className="text-xs">T</Badge>}
          </div>
          <Switch
            checked={data[key] || false}
            onCheckedChange={v => updateField(key, v)}
          />
        </div>
      ))}

      {data.require_completion_evidence && (
        <div className="space-y-1.5">
          <Label className="text-xs">Minimum Photo Count</Label>
          <Input
            type="number"
            min="0"
            value={data.minimum_photo_count || 0}
            onChange={e => updateField('minimum_photo_count', parseInt(e.target.value) || 0)}
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground italic">
        Completion requirements are validated server-side. A task cannot be completed without satisfying all enabled conditions.
      </p>
    </div>
  );
}