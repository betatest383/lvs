import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, PenLine, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import { useDeveloperMode } from '@/hooks/useDeveloperMode';

/**
 * SignatureBlockDialog — shown when a required signature is missing before
 * the technician can advance past a workflow stage.
 *
 * Props:
 *   open: boolean
 *   validation: { missingSignatures, blockingStage, requiredSignatures, capturedSignatures }
 *   appointmentId: string
 *   onCaptureSignature: () => void  — opens the signature modal
 *   onClose: () => void
 */
export default function SignatureBlockDialog({
  open, validation, appointmentId, onCaptureSignature, onClose,
}) {
  const { isDevToolsVisible } = useDeveloperMode();
  const [diagExpanded, setDiagExpanded] = useState(false);

  if (!validation) return null;

  const { missingSignatures, blockingStage, requiredSignatures, capturedSignatures } = validation;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5" /> Signature Required
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            A required signature is missing before this step can be completed.
          </p>

          {missingSignatures.map((sig, i) => (
            <Card key={i} className="border-red-200 bg-red-50/50">
              <CardContent className="p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <PenLine className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <p className="text-sm font-semibold text-red-800">{sig.label}</p>
                </div>
                <p className="text-xs text-muted-foreground">{sig.description}</p>
                <div className="flex items-center gap-1 text-xs text-blue-700 mt-1">
                  <span className="font-medium">Capture at:</span>
                  <span>{sig.captureLocation}</span>
                </div>
                {sig.managerOverrideAllowed && (
                  <Badge variant="outline" className="text-[10px] mt-1">Manager override allowed</Badge>
                )}
              </CardContent>
            </Card>
          ))}

          {capturedSignatures.length > 0 && (
            <div className="text-xs text-green-700 flex items-center gap-1">
              <span className="font-medium">Already captured:</span>
              {capturedSignatures.map(s => s.label).join(', ')}
            </div>
          )}
        </div>

        {/* Admin Diagnostics */}
        {isDevToolsVisible && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="p-3">
              <button
                className="flex items-center gap-1 text-xs font-semibold text-amber-700 w-full"
                onClick={() => setDiagExpanded(!diagExpanded)}
              >
                {diagExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Admin Diagnostics: Signature Validation
              </button>
              {diagExpanded && (
                <div className="mt-2 space-y-1 text-xs font-mono">
                  <div><span className="text-muted-foreground font-semibold">appointment_id:</span> {appointmentId || '—'}</div>
                  <div><span className="text-muted-foreground font-semibold">blocking_stage:</span> {blockingStage}</div>
                  <div><span className="text-muted-foreground font-semibold">required_signatures:</span> {requiredSignatures.map(s => s.key).join(', ') || 'none'}</div>
                  <div><span className="text-muted-foreground font-semibold">captured_signatures:</span> {capturedSignatures.map(s => s.key).join(', ') || 'none'}</div>
                  <div><span className="text-muted-foreground font-semibold">missing_signatures:</span> {missingSignatures.map(s => s.key).join(', ') || 'none'}</div>
                  <div><span className="text-muted-foreground font-semibold">override_status:</span> {missingSignatures.some(s => s.managerOverrideAllowed) ? 'manager override available' : 'no override available'}</div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button className="gap-1" onClick={() => { onClose(); onCaptureSignature(); }}>
            <PenLine className="w-4 h-4" /> Capture Signature Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}