import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';

/**
 * ReplayDialog — two-phase dialog for replaying a stored webhook event.
 *
 * Phase 1 (confirm): "Replay this webhook? ..."
 * Phase 2 (result): Shows handler name, duration, success/failure.
 *
 * Props:
 *   event — the ServiceTitanWebhookEvent record to replay
 *   open — whether the dialog is visible
 *   onOpenChange — callback to close
 *   onReplayed — callback after a completed replay (to refresh data)
 */
export default function ReplayDialog({ event, open, onOpenChange, onReplayed }) {
  const [phase, setPhase] = useState('confirm'); // confirm | loading | result
  const [result, setResult] = useState(null);

  const handleReplay = async () => {
    setPhase('loading');
    try {
      const response = await fetch('/functions/replayServiceTitanWebhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook_event_id: event.id }),
      });
      const data = await response.json();
      setResult(data);
      setPhase('result');
      if (data.success !== false) {
        onReplayed?.();
      }
    } catch (err) {
      setResult({
        success: false,
        error: err.message || 'Network error during replay',
        handler_name: '—',
        duration_ms: 0,
      });
      setPhase('result');
    }
  };

  const handleClose = () => {
    setPhase('confirm');
    setResult(null);
    onOpenChange(false);
  };

  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        {phase === 'confirm' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                Replay Webhook?
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                This will execute the original event handler using the stored payload.
                No duplicate webhook record will be created.
              </p>
              <div className="bg-muted rounded p-3 space-y-1 text-xs">
                <div><span className="text-muted-foreground">Event Type:</span> <code>{event.event_type}</code></div>
                <div><span className="text-muted-foreground">Object ID:</span> <code>{event.object_id || '—'}</code></div>
                <div><span className="text-muted-foreground">Received:</span> {event.received_at ? new Date(event.received_at).toLocaleString() : '—'}</div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleReplay}>Replay</Button>
            </DialogFooter>
          </>
        )}

        {phase === 'loading' && (
          <div className="flex flex-col items-center py-8 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Replaying webhook event...</p>
          </div>
        )}

        {phase === 'result' && result && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {result.success ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
                {result.success ? 'Replay Successful' : 'Replay Failed'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="bg-muted rounded p-3 space-y-1.5 text-sm">
                <div><span className="text-muted-foreground">Handler:</span> {result.handler_name || '—'}</div>
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Duration: {result.duration_ms || 0} ms</span>
                </div>
                <div><span className="text-muted-foreground">Status:</span> {result.success ? 'Success' : 'Failed'}</div>
                {result.result && (
                  <div className="pt-1 border-t">
                    <span className="text-muted-foreground">Summary:</span>
                    <p className="mt-0.5">{result.result}</p>
                  </div>
                )}
                {!result.success && result.error && (
                  <div className="pt-1 border-t">
                    <span className="text-red-600 font-medium">Error:</span>
                    <p className="mt-0.5 text-red-600">{result.error}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Retry available.</p>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              {!result.success && (
                <Button variant="outline" onClick={() => { setPhase('confirm'); setResult(null); }}>
                  Retry
                </Button>
              )}
              <Button onClick={handleClose}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}