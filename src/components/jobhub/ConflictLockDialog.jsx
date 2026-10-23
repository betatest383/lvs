import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Lock, Eye, Hand, Zap } from 'lucide-react';

export default function ConflictLockDialog({ open, lockInfo, moduleName, onViewOnly, onRequestControl, onTakeOver, onClose }) {
  const [takeoverReason, setTakeoverReason] = useState('');
  const [mode, setMode] = useState(null);

  if (!lockInfo) return null;

  const handleTakeOver = () => {
    onTakeOver(takeoverReason);
    setTakeoverReason('');
    setMode(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setMode(null); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-amber-500" /> Module In Use
          </DialogTitle>
        </DialogHeader>

        {!mode ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{lockInfo.locked_by_name}</span> is currently editing{' '}
              <span className="font-medium">{moduleName}</span>.
            </p>
            <p className="text-xs text-muted-foreground">
              They started at {new Date(lockInfo.locked_at).toLocaleTimeString()}. Choose how to proceed:
            </p>
            <div className="grid grid-cols-1 gap-2 pt-2">
              <Button variant="outline" className="justify-start gap-2 h-auto py-3"
                onClick={() => { onViewOnly(); setMode(null); }}>
                <Eye className="w-4 h-4 text-blue-500" />
                <div className="text-left">
                  <p className="text-sm font-medium">View Only</p>
                  <p className="text-xs text-muted-foreground">Open in read-only mode</p>
                </div>
              </Button>
              <Button variant="outline" className="justify-start gap-2 h-auto py-3"
                onClick={() => { onRequestControl(); setMode(null); }}>
                <Hand className="w-4 h-4 text-indigo-500" />
                <div className="text-left">
                  <p className="text-sm font-medium">Request Control</p>
                  <p className="text-xs text-muted-foreground">Notify them to hand over</p>
                </div>
              </Button>
              <Button variant="outline" className="justify-start gap-2 h-auto py-3 border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => setMode('takeover')}>
                <Zap className="w-4 h-4" />
                <div className="text-left">
                  <p className="text-sm font-medium">Take Over</p>
                  <p className="text-xs text-muted-foreground">Force control (reason required)</p>
                </div>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium">Reason for taking over {moduleName}:</p>
            <Textarea
              value={takeoverReason}
              onChange={e => setTakeoverReason(e.target.value)}
              placeholder="Explain why you need to take control of this module..."
              rows={4}
            />
            <p className="text-xs text-amber-600">This action will be logged and the current editor will be notified.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMode(null)}>Cancel</Button>
              <Button
                disabled={!takeoverReason.trim()}
                className="bg-red-600 hover:bg-red-700"
                onClick={handleTakeOver}
              >
                Confirm Take Over
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}