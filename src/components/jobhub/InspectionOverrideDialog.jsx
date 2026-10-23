import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

/**
 * InspectionOverrideDialog — lets an authorized manager waive SPECIFIC
 * missing-photo requirements. Only the explicitly selected requirements
 * are waived; unrelated inspection problems remain blocking. Calls the
 * server-authoritative validateInspectionCompletion (action: apply_override),
 * which is idempotent by requirement_id — repeated clicks create no duplicates.
 */
export default function InspectionOverrideDialog({ open, onClose, blockingRequirements, onApplied }) {
  const [selected, setSelected] = useState(new Set());
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset selection when the dialog opens / blocking set changes
  useEffect(() => {
    if (open) {
      const all = new Set(blockingRequirements.map(r => r.requirement_id));
      setSelected(all); // default: select all blocking (manager can deselect)
      setReason('');
    }
  }, [open, blockingRequirements]);

  const toggle = (rid) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(rid)) next.delete(rid); else next.add(rid);
      return next;
    });
  };

  const handleApply = async () => {
    if (!reason.trim()) return;
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      await onApplied({ requirement_ids: Array.from(selected), override_reason: reason.trim() });
      setReason('');
      onClose();
    } catch (e) {
      console.error('Override apply failed:', e);
    }
    setSubmitting(false);
  };

  const photoBlockers = blockingRequirements.filter(r => r.requirement_type === 'photo');
  const overrideDisabledBlockers = photoBlockers.filter(r => r.allow_override === false);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-600" />
            Manager Override — Missing Photos
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            Select the specific missing-photo requirements to waive. Unrelated inspection problems remain blocking. A written reason is required.
          </div>

          {overrideDisabledBlockers.length > 0 && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{overrideDisabledBlockers.length} requirement(s) have manager override disabled and cannot be waived — photos are mandatory.</p>
            </div>
          )}

          <ScrollArea className="max-h-[280px] pr-2">
            <div className="space-y-2">
              {photoBlockers.map(r => (
                <label key={r.requirement_id} className={`flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer ${r.allow_override === false ? 'opacity-50 cursor-not-allowed' : selected.has(r.requirement_id) ? 'bg-amber-50 border-amber-300' : 'bg-card'}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    disabled={r.allow_override === false}
                    checked={selected.has(r.requirement_id)}
                    onChange={() => toggle(r.requirement_id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{r.question_text}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.actual_count}/{r.required_count} photos · {r.missing_count} missing · {r.inspection_type}
                    </p>
                  </div>
                  <Badge variant="destructive" className="text-[10px] shrink-0">{r.missing_count} missing</Badge>
                </label>
              ))}
            </div>
          </ScrollArea>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide">Override Reason <span className="text-destructive">*</span></Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why the selected missing photos are being waived..."
              rows={3}
              className="text-sm"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="gap-1.5 bg-amber-600 hover:bg-amber-700"
            onClick={handleApply}
            disabled={submitting || !reason.trim() || selected.size === 0}
          >
            <ShieldCheck className="w-4 h-4" /> {submitting ? 'Applying...' : `Waive ${selected.size} Requirement${selected.size !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}