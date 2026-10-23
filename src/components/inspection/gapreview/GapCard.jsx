import { Badge } from '@/components/ui/badge';
import {
  FileQuestion, GitBranch, Wrench, Calculator, ClipboardList,
  Check, UserPlus, StickyNote, CheckCheck, XCircle, Eye, Network
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PRIORITY_META, CATEGORY_META, QUESTION_ROLES } from '@/lib/inspectionMatrixGapClassifier';
import { GAP_STATUSES, CONFIDENCE_LEVELS } from '@/lib/inspectionGapConfig';
import { QUESTION_PURPOSES, PURPOSE_COLOR, CATEGORY_COLOR } from '@/lib/inspectionMetadataConfig';

function safeParseGap(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

const PRIORITY_BORDER = {
  critical: 'border-l-red-500 bg-red-50/30',
  high: 'border-l-orange-500 bg-orange-50/30',
  medium: 'border-l-amber-500 bg-amber-50/20',
  low: 'border-l-gray-400 bg-gray-50/20',
};

const PRIORITY_BADGE = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
};

const STATUS_BADGE = {
  new: 'bg-blue-100 text-blue-700',
  reviewed: 'bg-cyan-100 text-cyan-700',
  accepted: 'bg-amber-100 text-amber-700',
  deferred: 'bg-orange-100 text-orange-700',
  not_applicable: 'bg-gray-100 text-gray-600',
  fixed: 'bg-green-100 text-green-700',
};

const CONFIDENCE_BADGE = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-orange-100 text-orange-700',
};

export default function GapCard({ gap, onViewDetail, onMarkStatus, onAssign, onAddNote }) {
  const priMeta = PRIORITY_META[gap.gap_priority];
  const catMeta = CATEGORY_META[gap.gap_category] || { label: gap.gap_category, color: 'gray' };
  const roleMeta = QUESTION_ROLES[gap.question_role] || QUESTION_ROLES.observation;
  const statusMeta = GAP_STATUSES[gap.status] || GAP_STATUSES.new;
  const confMeta = CONFIDENCE_LEVELS[gap.confidence_level] || CONFIDENCE_LEVELS.medium;
  const purposes = safeParseGap(gap.question_purpose, []);
  const effectivePriority = gap.priority_override || gap.gap_priority;

  return (
    <div className={`border-l-4 ${PRIORITY_BORDER[effectivePriority] || PRIORITY_BORDER.low} border-y border-r rounded-lg p-3 hover:shadow-md transition-shadow`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Badges row */}
          <div className="flex items-center gap-1 flex-wrap">
            <Badge className={`text-[10px] ${PRIORITY_BADGE[effectivePriority]}`}>{priMeta.label}</Badge>
            <Badge className={`text-[10px] ${STATUS_BADGE[gap.status]}`}>{statusMeta.label}</Badge>
            <Badge className={`text-[10px] ${CONFIDENCE_BADGE[gap.confidence_level]}`} title={gap.confidence_reason}>
              {confMeta.label} {gap.confidence_score}%
            </Badge>
            {gap.assigned_to && (
              <Badge className="text-[10px] bg-indigo-100 text-indigo-700" title={`Assigned: ${gap.assigned_to}`}>
                {gap.assigned_to}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px]">{catMeta.label}</Badge>
            <Badge className="text-[10px] bg-blue-100 text-blue-700 capitalize">{roleMeta.label}</Badge>
            {gap.question_category && (
              <Badge className={`text-[10px] ${CATEGORY_COLOR[gap.question_category] || 'bg-gray-100 text-gray-600'}`}>
                {gap.question_category}
              </Badge>
            )}
            {purposes.slice(0, 2).map((p, i) => (
              <Badge key={i} className={`text-[10px] ${PURPOSE_COLOR[p] || 'bg-gray-100 text-gray-600'}`}>
                {QUESTION_PURPOSES[p]?.label || p}
              </Badge>
            ))}
            {gap.nfpa_211_question && <Badge className="text-[10px] bg-blue-100 text-blue-700">NFPA</Badge>}
            {gap.safety_concern && <Badge className="text-[10px] bg-red-100 text-red-700">Safety</Badge>}
          </div>

          {/* Gap title and question */}
          <p className="text-sm font-semibold">{gap.gap_type}</p>
          <p className="text-xs text-muted-foreground line-clamp-1">↳ {gap.question_text}</p>

          {/* Why / Action */}
          <div className="flex gap-2">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground/70 w-16 flex-shrink-0">Why</span>
            <p className="text-xs text-foreground/80 line-clamp-2">{gap.gap_why}</p>
          </div>
          <div className="flex gap-2">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground/70 w-16 flex-shrink-0">Action</span>
            <p className="text-xs text-foreground/80 line-clamp-2">{gap.gap_action}</p>
          </div>

          {/* Impact systems */}
          <div className="flex gap-2 items-start">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground/70 w-16 flex-shrink-0 pt-0.5">Impact</span>
            <div className="flex flex-wrap gap-0.5">
              {(gap.impact_systems || []).slice(0, 5).map((sys, i) => (
                <Badge key={i} variant="outline" className="text-[9px] py-0">{sys}</Badge>
              ))}
              {(gap.impact_systems || []).length > 5 && (
                <Badge variant="outline" className="text-[9px] py-0">+{gap.impact_systems.length - 5}</Badge>
              )}
            </div>
          </div>

          {/* Resolution notes preview */}
          {gap.resolution_notes && (
            <div className="flex gap-2">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground/70 w-16 flex-shrink-0">Notes</span>
              <p className="text-xs text-foreground/60 italic line-clamp-1">{gap.resolution_notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/50 flex-wrap">
        <ActionButton icon={Eye} label="Detail" onClick={() => onViewDetail(gap)} />
        <ActionButton icon={Check} label="Reviewed" onClick={() => onMarkStatus(gap, 'reviewed')} />
        <ActionButton icon={CheckCheck} label="Fixed" onClick={() => onMarkStatus(gap, 'fixed')} />
        <ActionButton icon={XCircle} label="N/A" onClick={() => onMarkStatus(gap, 'not_applicable')} />
        <ActionButton icon={UserPlus} label="Assign" onClick={() => onAssign(gap)} />
        <ActionButton icon={StickyNote} label="Note" onClick={() => onAddNote(gap)} />
        <div className="w-px h-5 bg-border mx-0.5" />
        <Link to="/admin/inspection-matrix"><ActionButton icon={FileQuestion} label="Question" /></Link>
        <Link to="/rules-engine/registry"><ActionButton icon={GitBranch} label="Rule" /></Link>
        <Link to="/admin/estimates/pricebook-mapping"><ActionButton icon={Wrench} label="Repair" /></Link>
        <Link to="/admin/estimates/pricebook-mapping"><ActionButton icon={Calculator} label="Material" /></Link>
        <Link to="/admin/estimates/pricebook-mapping"><ActionButton icon={ClipboardList} label="Estimate" /></Link>
        <ActionButton icon={Network} label="Chain" onClick={() => onViewDetail(gap)} />
      </div>
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-1.5 py-1 rounded text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      title={label}
    >
      <Icon className="w-3 h-3" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}