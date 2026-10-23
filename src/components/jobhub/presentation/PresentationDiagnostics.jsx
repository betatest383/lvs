import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Admin diagnostics panel for Customer Presentation.
 * Shows signature, checklist, proposal, and workflow state.
 */
export default function PresentationDiagnostics({
  presentationId,
  signatureRequired,
  signatureCaptured,
  signatureRecordId,
  checklistComplete,
  selectedProposalOption,
  currentSection,
  presentationStatus,
  nextWorkflowStage,
}) {
  const [expanded, setExpanded] = useState(false);

  const rows = [
    { label: 'CustomerPresentation ID', value: presentationId || '—' },
    { label: 'Signature Required', value: signatureRequired ? 'Yes' : 'No', badge: signatureRequired ? 'amber' : 'muted' },
    { label: 'Signature Captured', value: signatureCaptured ? 'Yes' : 'No', badge: signatureCaptured ? 'green' : 'red' },
    { label: 'Signature Record ID', value: signatureRecordId || '—' },
    { label: 'Checklist Complete', value: checklistComplete ? 'Yes' : 'No', badge: checklistComplete ? 'green' : 'red' },
    { label: 'Selected Proposal Option', value: selectedProposalOption || '—' },
    { label: 'Current Presentation Section', value: currentSection || '—' },
    { label: 'Presentation Status', value: presentationStatus || '—' },
    { label: 'Next Workflow Stage', value: nextWorkflowStage || '—' },
  ];

  const badgeVariant = (color) => {
    if (color === 'green') return 'default';
    if (color === 'red') return 'destructive';
    if (color === 'amber') return 'secondary';
    return 'outline';
  };

  return (
    <Card className="border-amber-200 bg-amber-50/50 mt-3">
      <CardContent className="p-3">
        <button
          type="button"
          className="flex items-center gap-1 text-xs font-semibold text-amber-700 w-full"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Admin Diagnostics: Customer Presentation
        </button>
        {expanded && (
          <div className="mt-2 space-y-1 text-xs font-mono">
            {rows.map((row) => (
              <div key={row.label} className="flex gap-2 items-center">
                <span className="text-muted-foreground font-semibold whitespace-nowrap">{row.label}:</span>
                {row.badge ? (
                  <Badge variant={badgeVariant(row.badge)} className="text-[10px]">{row.value}</Badge>
                ) : (
                  <span className="break-all">{String(row.value)}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}