import { useState } from 'react';
import { Bug, ChevronDown, ChevronUp } from 'lucide-react';

export default function EstimateReviewDiagnostics({ diagnostic }) {
  const [expanded, setExpanded] = useState(false);
  if (!diagnostic) return null;

  const fields = [
    { label: 'Job ID', value: diagnostic.job_id },
    { label: 'Inspection ID', value: diagnostic.inspection_id },
    { label: 'Recommendation Review ID', value: diagnostic.recommendation_review_id },
    { label: 'Repair System Rec Count', value: diagnostic.repair_system_recommendation_count ?? '—' },
    { label: 'DraftEstimate ID', value: diagnostic.draft_estimate_id },
    { label: 'DraftEstimate Status', value: diagnostic.draft_estimate_status || '—' },
    { label: 'DraftEstimateItem Count', value: diagnostic.draft_estimate_item_count ?? '—' },
    { label: 'Resolved Item Count', value: diagnostic.resolved_item_count ?? '—' },
    { label: 'Unresolved Item Count', value: diagnostic.unresolved_item_count ?? '—' },
    { label: 'Items Ready', value: diagnostic.items_ready ?? '—' },
    { label: 'Items Suggested', value: diagnostic.items_suggested ?? '—' },
    { label: 'Items Manual Review', value: diagnostic.items_manual_review ?? '—' },
    { label: 'Items Missing Price', value: diagnostic.items_missing_price ?? '—' },
    { label: 'Items Approved', value: diagnostic.items_approved ?? '—' },
    { label: 'Items Deferred', value: diagnostic.items_deferred ?? '—' },
    { label: 'Items Rejected', value: diagnostic.items_rejected ?? '—' },
    { label: 'Current Workflow Stage', value: diagnostic.current_workflow_stage || '—' },
    { label: 'Next Workflow Stage', value: diagnostic.next_workflow_stage || '—' },
    { label: 'Computed Next Action', value: diagnostic.computed_next_action || '—' },
    { label: 'Navigation Target', value: diagnostic.navigation_target || '—' },
  ];

  return (
    <div className="rounded-lg border border-dashed border-purple-300 bg-purple-50/30 p-3 space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-medium text-purple-700 w-full"
      >
        <Bug className="w-4 h-4" />
        Admin Diagnostics: Draft Estimate Auto-Build
        {expanded ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
      </button>
      {expanded && (
        <>
          <div className="grid grid-cols-2 gap-2 text-xs text-purple-900">
            {fields.map(f => (
              <div key={f.label} className="rounded border p-2">
                <p className="font-medium">{f.label}</p>
                <p className="text-[10px] font-mono break-all">{f.value || '—'}</p>
              </div>
            ))}
          </div>
          {diagnostic.errors?.length > 0 && (
            <div className="rounded border border-red-300 bg-red-50 p-2">
              <p className="font-medium text-red-800 text-xs">Errors:</p>
              <ul className="mt-1 space-y-0.5 text-[10px] text-red-700">
                {diagnostic.errors.map((err, i) => <li key={i}>• {err}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}