import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Check, UserPlus, StickyNote, CheckCheck, XCircle, Zap } from 'lucide-react';
import { PRIORITY_META, CATEGORY_META, QUESTION_ROLES } from '@/lib/inspectionMatrixGapClassifier';
import { GAP_STATUSES, CONFIDENCE_LEVELS, GAP_IMPACT_SYSTEMS } from '@/lib/inspectionGapConfig';
import { QUESTION_PURPOSES, PURPOSE_COLOR, CATEGORY_COLOR } from '@/lib/inspectionMetadataConfig';

function safeParseGap(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

export default function GapDetailDrawer({ gap, open, onOpenChange, onMarkStatus, onAssign, onAddNote }) {
  if (!gap) return null;

  const priMeta = PRIORITY_META[gap.gap_priority];
  const catMeta = CATEGORY_META[gap.gap_category] || { label: gap.gap_category, color: 'gray' };
  const roleMeta = QUESTION_ROLES[gap.question_role] || QUESTION_ROLES.observation;
  const statusMeta = GAP_STATUSES[gap.status] || GAP_STATUSES.new;
  const confMeta = CONFIDENCE_LEVELS[gap.confidence_level] || CONFIDENCE_LEVELS.medium;
  const purposes = safeParseGap(gap.question_purpose, []);
  const impactSet = new Set(gap.impact_systems || []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-orange-500" />
            {gap.gap_type}
          </DialogTitle>
        </DialogHeader>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <Badge className="text-[10px] bg-red-100 text-red-700">{priMeta.label} Priority</Badge>
          <Badge className="text-[10px] bg-blue-100 text-blue-700">{statusMeta.label}</Badge>
          <Badge className={`text-[10px] ${confMeta.color === 'green' ? 'bg-green-100 text-green-700' : confMeta.color === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700'}`}>
            {confMeta.label} Confidence ({gap.confidence_score}%)
          </Badge>
          <Badge variant="outline" className="text-[10px]">{catMeta.label}</Badge>
          <Badge className="text-[10px] bg-blue-100 text-blue-700 capitalize">{roleMeta.label}</Badge>
          {gap.question_category && (
            <Badge className={`text-[10px] ${CATEGORY_COLOR[gap.question_category] || 'bg-gray-100 text-gray-600'}`}>{gap.question_category}</Badge>
          )}
          {purposes.map((p, i) => (
            <Badge key={i} className={`text-[10px] ${PURPOSE_COLOR[p] || 'bg-gray-100 text-gray-600'}`}>{QUESTION_PURPOSES[p]?.label || p}</Badge>
          ))}
          {gap.nfpa_211_question && <Badge className="text-[10px] bg-blue-100 text-blue-700">NFPA</Badge>}
          {gap.safety_concern && <Badge className="text-[10px] bg-red-100 text-red-700">Safety</Badge>}
        </div>

        {/* Confidence reason */}
        {gap.confidence_reason && (
          <div className="p-2 rounded-lg bg-muted/30 border border-border mb-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">Confidence Reasoning</p>
            <p className="text-xs text-foreground/80">{gap.confidence_reason}</p>
          </div>
        )}

        {/* Question */}
        <div className="mb-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">Question</p>
          <p className="text-sm font-medium">{gap.question_text}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{gap.section} · {gap.subsection} · {gap.inspection_type}</p>
        </div>

        {/* Why / Action */}
        <div className="space-y-2 mb-3">
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">Why It Matters</p>
            <p className="text-xs text-foreground/80">{gap.gap_why}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">Recommended Action</p>
            <p className="text-xs text-foreground/80">{gap.gap_action}</p>
          </div>
        </div>

        <Separator className="my-2" />

        {/* Impact Preview */}
        <div className="mb-3">
          <p className="text-xs font-semibold mb-1.5">Impact Preview — Systems Affected</p>
          <div className="grid grid-cols-2 gap-1">
            {GAP_IMPACT_SYSTEMS.map(sys => {
              const impacted = sys.always || impactSet.has(sys.label);
              return (
                <div key={sys.key} className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${impacted ? 'bg-orange-50 text-orange-800 border border-orange-200' : 'bg-muted/20 text-muted-foreground/40 border border-transparent'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${impacted ? 'bg-orange-500' : 'bg-gray-300'}`} />
                  {sys.label}
                </div>
              );
            })}
          </div>
        </div>

        {/* Assignment info */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">Assigned To</p>
            <p className="text-xs">{gap.assigned_to || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">Department</p>
            <p className="text-xs">{gap.department || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">Target Date</p>
            <p className="text-xs">{gap.target_date || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">Reviewed By</p>
            <p className="text-xs">{gap.reviewed_by || '—'}</p>
          </div>
        </div>

        {/* Resolution notes */}
        {gap.resolution_notes && (
          <div className="mb-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">Resolution Notes</p>
            <p className="text-xs text-foreground/80 whitespace-pre-wrap">{gap.resolution_notes}</p>
          </div>
        )}

        <Separator className="my-2" />

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => onMarkStatus(gap, 'reviewed')}>
            <Check className="w-3.5 h-3.5" /> Mark Reviewed
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => onMarkStatus(gap, 'fixed')}>
            <CheckCheck className="w-3.5 h-3.5" /> Mark Fixed
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => onMarkStatus(gap, 'not_applicable')}>
            <XCircle className="w-3.5 h-3.5" /> Not Applicable
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => onAssign(gap)}>
            <UserPlus className="w-3.5 h-3.5" /> Assign
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => onAddNote(gap)}>
            <StickyNote className="w-3.5 h-3.5" /> Add Note
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}