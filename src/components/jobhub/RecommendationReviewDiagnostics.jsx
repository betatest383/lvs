import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChevronDown, ChevronUp, Bug, Activity,
} from 'lucide-react';

export default function RecommendationReviewDiagnostics({
  appointmentId, inspectionId, deficiencyCount, reviewStatus,
  reviewedCount, estimateRequiredCount, repairRecCount, estimateLineItemCount,
  nextAction,
}) {
  const [expanded, setExpanded] = useState(false);

  const rows = [
    { label: 'Appointment ID', value: appointmentId || '—' },
    { label: 'Inspection ID', value: inspectionId || '—' },
    { label: 'Deficiency Count', value: deficiencyCount },
    { label: 'Recommendation Review Status', value: reviewStatus || 'not_started' },
    { label: 'Reviewed Count', value: reviewedCount },
    { label: 'Estimate Required Count', value: estimateRequiredCount },
    { label: 'Repair Recommendation Count', value: repairRecCount },
    { label: 'Estimate Line Item Count', value: estimateLineItemCount },
    { label: 'Current Next Action', value: nextAction || '—' },
  ];

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 w-full text-left"
        >
          <Bug className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold flex-1">Recommendation Review Diagnostics</span>
          <Badge variant="outline" className="text-xs">
            <Activity className="w-3 h-3 mr-1" />
            {reviewStatus || 'not_started'}
          </Badge>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {expanded && (
          <div className="mt-3 space-y-1">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-muted/50 last:border-0">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-mono font-medium text-right max-w-[60%] truncate">{String(row.value)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}