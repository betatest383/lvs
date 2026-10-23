import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Loader2, Lock } from 'lucide-react';

export default function ConflictOverrideDialog({ open, onClose, onConfirm, warnings, saving }) {
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) {
      setName('');
      setReason('');
    }
  }, [open]);

  const handleConfirm = () => {
    if (!name.trim() || !reason.trim()) return;
    onConfirm({
      name: name.trim(),
      reason: reason.trim(),
      timestamp: new Date().toISOString(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-amber-600" /> Override Assignment Conflict
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
              <AlertTriangle className="w-4 h-4" /> Conflict Summary
            </div>
            <ul className="text-xs text-amber-700 list-disc list-inside space-y-0.5 mt-1">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            By overriding, you confirm that this overlapping assignment is intentional. This action will be logged with your name, reason, and timestamp.
          </p>
          <div>
            <Label className="text-sm font-semibold">Override By *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" className="mt-1" />
          </div>
          <div>
            <Label className="text-sm font-semibold">Reason *</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain why the override is needed..." rows={2} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={saving || !name.trim() || !reason.trim()}
            className="gap-1.5"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Apply Override & Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}