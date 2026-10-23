import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Wrench, Calendar, Clock, XCircle, ChevronDown, ChevronUp,
} from 'lucide-react';

function DecisionDiagnostics({ diagnostics }) {
  const [expanded, setExpanded] = useState(false);
  if (!diagnostics) return null;
  return (
    <Card className="border-amber-200 bg-amber-50/50 mt-3">
      <CardContent className="p-3">
        <button
          className="flex items-center gap-1 text-xs font-semibold text-amber-700 w-full"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Admin Diagnostics: Decision Recording
        </button>
        {expanded && (
          <div className="mt-2 space-y-1 text-xs font-mono">
            {Object.entries(diagnostics).map(([key, val]) => (
              <div key={key} className="flex gap-2">
                <span className="text-muted-foreground font-semibold whitespace-nowrap">{key}:</span>
                <span className="break-all">{typeof val === 'object' ? JSON.stringify(val) : String(val)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const DECISION_OPTIONS = [
  { value: 'perform_work_today', label: 'Perform Work Today', icon: Wrench, color: 'border-green-400 bg-green-50 hover:bg-green-100' },
  { value: 'schedule_for_later', label: 'Schedule for Later', icon: Calendar, color: 'border-blue-400 bg-blue-50 hover:bg-blue-100' },
  { value: 'think_about_it', label: 'Think About It', icon: Clock, color: 'border-amber-400 bg-amber-50 hover:bg-amber-100' },
  { value: 'declined', label: 'Declined', icon: XCircle, color: 'border-red-400 bg-red-50 hover:bg-red-100' },
];

export default function PresentationCustomerDecision({
  selectedDecision, decisionNotes, onSelectDecision, onNotesChange, diagnostics,
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Customer Decision</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {DECISION_OPTIONS.map(opt => {
            const Icon = opt.icon;
            const isSelected = selectedDecision === opt.value;
            return (
              <Button
                key={opt.value}
                variant="outline"
                className={`h-auto py-3 flex-col gap-1 border-2 ${opt.color} ${isSelected ? 'ring-2 ring-accent' : ''}`}
                onClick={() => onSelectDecision(opt.value)}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium text-center">{opt.label}</span>
              </Button>
            );
          })}
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Decision Notes
          </Label>
          <Textarea
            value={decisionNotes || ''}
            onChange={e => onNotesChange(e.target.value)}
            placeholder="Any additional context about the customer's decision..."
            rows={2}
            className="text-sm"
          />
        </div>
        <DecisionDiagnostics diagnostics={diagnostics} />
      </CardContent>
    </Card>
  );
}