import { useRef, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PenLine, RotateCcw, Loader2, AlertCircle } from 'lucide-react';

export const SIGNATURE_PURPOSES = [
  { value: 'clean_inspection_acknowledgment', label: 'Clean Inspection Acknowledgment' },
  { value: 'estimate_presentation', label: 'Estimate Presentation' },
  { value: 'work_authorization', label: 'Work Authorization' },
  { value: 'completion_acceptance', label: 'Completion Acceptance' },
];

/**
 * CustomerSignatureModal — real canvas signature pad with audit capture.
 *
 * Props:
 *   open: boolean
 *   onClose: () => void  — called on cancel/close (does NOT mark captured)
 *   onSign: (auditData) => Promise<void>  — called only after signature is drawn, uploaded, and saved
 *   defaultSignerName?: string
 *   defaultPurpose?: string  (one of SIGNATURE_PURPOSES values)
 *   title?: string
 *
 * auditData shape:
 *   { signatureUrl, signerName, purpose, purposeLabel, timestamp }
 *
 * Cancel/close never calls onSign — signature is only "captured" when onSign succeeds.
 */
export default function CustomerSignatureModal({
  open,
  onClose,
  onSign,
  defaultSignerName = '',
  defaultPurpose = 'completion_acceptance',
  title = 'Capture Customer Signature',
}) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [purpose, setPurpose] = useState(defaultPurpose);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const lastPos = useRef(null);

  // Reset canvas + fields when modal opens
  useEffect(() => {
    if (open) {
      setSignerName(defaultSignerName);
      setPurpose(defaultPurpose);
      setError(null);
      setHasStrokes(false);
      setTimeout(() => clearCanvas(), 60);
    }
  }, [open, defaultSignerName, defaultPurpose]);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * (canvas.width / rect.width),
      y: (src.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) {
      setError('Signature pad failed to load. Please close and reopen.');
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('Signature pad failed to load. Please close and reopen.');
      return;
    }
    setDrawing(true);
    lastPos.current = getPos(e, canvas);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
    setHasStrokes(true);
  };

  const stopDraw = (e) => {
    e?.preventDefault();
    setDrawing(false);
    lastPos.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  };

  const handleSign = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokes || !signerName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const dataUrl = canvas.toDataURL('image/png');
      // Upload signature image to storage
      const res = await base44.functions.invoke('uploadSignature', { dataUrl });
      const signatureUrl = res.data?.file_url;
      if (!signatureUrl) throw new Error('Failed to save signature image');

      const auditData = {
        signatureUrl,
        signerName: signerName.trim(),
        purpose,
        purposeLabel: SIGNATURE_PURPOSES.find((p) => p.value === purpose)?.label || purpose,
        timestamp: new Date().toISOString(),
      };
      await onSign(auditData);
    } catch (err) {
      setError(err.message || 'Failed to capture signature. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (o) => {
    if (!o) {
      // Closing/cancelling — do NOT mark captured
      setError(null);
      onClose();
    }
  };

  const canSign = hasStrokes && signerName.trim().length > 0 && !saving;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="w-4 h-4" /> {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {/* Signer name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Signer Name <span className="text-red-500">*</span>
            </Label>
            <Input
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Full name of person signing"
              disabled={saving}
            />
          </div>

          {/* Purpose */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Signature Purpose <span className="text-red-500">*</span>
            </Label>
            <Select value={purpose} onValueChange={setPurpose} disabled={saving}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select purpose" />
              </SelectTrigger>
              <SelectContent>
                {SIGNATURE_PURPOSES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Signature pad */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-medium">
                Customer Signature <span className="text-red-500">*</span>
              </p>
              <button
                onClick={clearCanvas}
                disabled={saving}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-3 h-3" /> Clear
              </button>
            </div>
            <div className="border-2 border-dashed border-border rounded-lg bg-white overflow-hidden touch-none select-none">
              <canvas
                ref={canvasRef}
                width={600}
                height={180}
                className="w-full block cursor-crosshair"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={stopDraw}
              />
            </div>
            {!hasStrokes && (
              <p className="text-xs text-muted-foreground mt-1 text-center">
                Customer must draw signature above
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSign} disabled={!canSign} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PenLine className="w-4 h-4 mr-2" />}
            Save Signature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}