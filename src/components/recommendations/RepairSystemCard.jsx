import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Check, X, AlertTriangle, Edit3, MessageSquareX } from 'lucide-react';
import ConfidenceBadge from './ConfidenceBadge';
import EvidencePanel from './EvidencePanel';
import OptionTierSelector from './OptionTierSelector';

function safeParse(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

const SYSTEM_LABELS = {
  crown: 'Crown',
  masonry: 'Masonry',
  liner: 'Liner',
  smoke_chamber: 'Smoke Chamber',
  cap_chase: 'Cap / Chase',
  other: 'Other',
};

export default function RepairSystemCard({ rec, onUpdate }) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(rec.internal_technician_notes || '');

  const options = safeParse(rec.good_better_best_options, []);
  const findings = safeParse(rec.related_findings_detail, []);
  const photos = rec.related_photos || [];
  const selectedTier = rec.selected_option_tier || 'none';

  const handleSelectTier = (tier) => {
    const newTier = selectedTier === tier ? 'none' : tier;
    const selectedOption = options.find(o => o.tier === tier);
    onUpdate(rec.id, {
      selected_option_tier: newTier,
      estimate_status: newTier === 'none' ? 'pending' : 'accepted',
    });
  };

  const accept = () => onUpdate(rec.id, { estimate_status: 'accepted' });
  const remove = () => onUpdate(rec.id, { estimate_status: 'removed' });
  const decline = () => onUpdate(rec.id, { estimate_status: 'customer_declined' });
  const restore = () => onUpdate(rec.id, { estimate_status: 'pending', selected_option_tier: 'none' });

  const saveNotes = () => {
    onUpdate(rec.id, { internal_technician_notes: notes });
    setEditingNotes(false);
  };

  const isRemoved = rec.estimate_status === 'removed';
  const isAccepted = rec.estimate_status === 'accepted' || selectedTier !== 'none';
  const isLowConfidence = rec.requires_review || (rec.confidence_score || 0) < 50;
  const systemLabel = SYSTEM_LABELS[rec.repair_system_type] || 'Other';

  return (
    <div
      className={`border rounded-xl p-4 transition-all ${
        isRemoved ? 'opacity-40 border-border'
        : isAccepted ? 'border-green-300 bg-green-50/30'
        : isLowConfidence ? 'border-amber-300 bg-amber-50/20'
        : 'border-border'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge variant="secondary" className="text-[10px] capitalize">{systemLabel} System</Badge>
            <Badge
              variant="outline"
              className={`text-[10px] capitalize ${
                rec.severity === 'critical' ? 'bg-red-100 text-red-700 border-red-200'
                : rec.severity === 'major' ? 'bg-orange-100 text-orange-700 border-orange-200'
                : rec.severity === 'moderate' ? 'bg-amber-100 text-amber-700 border-amber-200'
                : ''
              }`}
            >
              {rec.severity}
            </Badge>
            {rec.safety_concern && (
              <Badge className="text-[10px] bg-red-100 text-red-700">Safety</Badge>
            )}
            <Badge variant="outline" className="text-[10px]">
              {findings.length} finding{findings.length !== 1 ? 's' : ''}
            </Badge>
            {photos.length > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {photos.length} photo{photos.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <h3 className="font-semibold text-sm leading-tight">{rec.recommendation_title}</h3>
          {rec.recommendation_summary && (
            <p className="text-xs text-muted-foreground mt-0.5">{rec.recommendation_summary}</p>
          )}
        </div>
      </div>

      {/* Confidence */}
      <div className="mt-2">
        <ConfidenceBadge score={rec.confidence_score || 0} reason={rec.confidence_reason} />
      </div>

      {/* Low confidence warning */}
      {isLowConfidence && !isRemoved && (
        <div className="flex items-center gap-1.5 mt-2 p-2 rounded-md bg-amber-50 border border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
          <span className="text-xs text-amber-700">
            Review Required — grouping confidence is low. Technician review needed before acceptance.
          </span>
        </div>
      )}

      {/* Options */}
      {!isRemoved && (
        <div className="mt-3">
          <OptionTierSelector
            options={options}
            selectedTier={selectedTier}
            onSelect={handleSelectTier}
          />
        </div>
      )}

      {/* Evidence Panel */}
      <EvidencePanel repairSystem={rec} />

      {/* Internal Notes Editor */}
      {editingNotes && !isRemoved && (
        <div className="mt-3 space-y-2">
          <Textarea
            placeholder="Internal technician notes..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="text-xs min-h-[60px]"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="default" className="h-7 gap-1" onClick={saveNotes}>
              <Check className="w-3.5 h-3.5" /> Save Notes
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditingNotes(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {isAccepted && (
          <Badge className="bg-green-100 text-green-700 gap-1">
            <Check className="w-3 h-3" /> Accepted
          </Badge>
        )}
        {!isAccepted && !isRemoved && (
          <Button size="sm" variant="default" className="h-7 gap-1 bg-green-600 hover:bg-green-700" onClick={accept}>
            <Check className="w-3.5 h-3.5" /> Accept
          </Button>
        )}
        {!isRemoved && (
          <>
            <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => setEditingNotes(!editingNotes)}>
              <Edit3 className="w-3.5 h-3.5" /> {editingNotes ? 'Close' : 'Edit'}
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-red-600 hover:text-red-700" onClick={remove}>
              <X className="w-3.5 h-3.5" /> Remove
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={decline}>
              <MessageSquareX className="w-3.5 h-3.5" /> Customer Declined
            </Button>
          </>
        )}
        {isRemoved && (
          <Button size="sm" variant="outline" className="h-7 gap-1" onClick={restore}>
            Restore
          </Button>
        )}
      </div>
    </div>
  );
}