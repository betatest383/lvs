import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Eraser, Check } from 'lucide-react';
import { OVERRIDE_REASONS } from '@/lib/jobHubDailyConfig';

export default function ManagerOverrideDialog({ open, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [signing, setSigning] = useState(false);
  const [signatureData, setSignatureData] = useState(null);
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setCustomReason('');
      setSignatureData(null);
      setSigning(false);
    }
  }, [open]);

  useEffect(() => {
    if (signing && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
    }
  }, [signing]);

  const startDraw = (e) => {
    drawing.current = true;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDraw = () => {
    drawing.current = false;
    if (canvasRef.current) {
      setSignatureData(canvasRef.current.toDataURL());
    }
  };

  const clearSignature = () => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      setSignatureData(null);
    }
  };

  const handleConfirm = () => {
    const finalReason = reason === OVERRIDE_REASONS[OVERRIDE_REASONS.length - 1]
      ? customReason
      : reason;
    if (!finalReason) return;
    onConfirm(finalReason, signatureData);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5" /> Manager Override Required
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
            Dispatch requirements are not met. A manager override requires a reason and signature.
            The override will be logged and auditable.
          </div>

          <div>
            <Label className="text-sm font-medium">Override Reason *</Label>
            <div className="space-y-1.5 mt-1.5">
              {OVERRIDE_REASONS.map(r => (
                <button
                  key={r}
                  type="button"
                  className={`w-full text-left px-3 py-2 rounded-md text-xs border transition-colors ${
                    reason === r ? 'border-accent bg-accent/5' : 'border-input hover:bg-muted/50'
                  }`}
                  onClick={() => setReason(r)}
                >
                  {r}
                </button>
              ))}
            </div>
            {reason === OVERRIDE_REASONS[OVERRIDE_REASONS.length - 1] && (
              <Textarea
                className="mt-2 text-xs"
                placeholder="Specify reason..."
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
              />
            )}
          </div>

          <div>
            <Label className="text-sm font-medium">Manager Signature *</Label>
            {!signing ? (
              <Button variant="outline" className="w-full mt-1.5" onClick={() => setSigning(true)}>
                Click to Sign
              </Button>
            ) : (
              <div className="space-y-2 mt-1.5">
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={120}
                  className="w-full border-2 border-dashed border-input rounded-md bg-white cursor-crosshair touch-none"
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={stopDraw}
                  onMouseLeave={stopDraw}
                />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1" onClick={clearSignature}>
                    <Eraser className="w-3.5 h-3.5" /> Clear
                  </Button>
                  {signatureData && (
                    <Badge className="bg-green-100 text-green-700 gap-1">
                      <Check className="w-3 h-3" /> Signed
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!reason || (!signatureData && signing)}
            onClick={handleConfirm}
          >
            Confirm Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}