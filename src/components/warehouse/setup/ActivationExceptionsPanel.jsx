import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ExternalLink, RotateCw, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { resolveActivationException } from '@/lib/warehouseSetupSession';

/**
 * ActivationExceptionsPanel
 * Shows only unresolved, production-classified activation failures
 * that have a valid session_id and warehouse_location_name.
 *
 * Each exception row exposes: Session ID, Warehouse, Item, Failure reason,
 * Date, Status, Retry, Resolve, Open Session.
 */
export default function ActivationExceptionsPanel({ exceptions, onRefresh }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [resolving, setResolving] = useState(null);
  const [expanded, setExpanded] = useState(null);

  if (!exceptions || exceptions.length === 0) {
    return (
      <div className="p-4 rounded-lg border bg-card flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="w-4 h-4 text-green-600" />
        No unresolved activation exceptions.
      </div>
    );
  }

  const handleResolve = async (exc) => {
    setResolving(exc.item_id);
    try {
      await resolveActivationException(exc.session_record_id, exc.item_id, 'Resolved from Activation Exceptions panel');
      toast({ title: 'Exception resolved', description: `${exc.item_name} marked as resolved.` });
      onRefresh();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Resolve failed', description: e.response?.data?.error || e.message });
    } finally {
      setResolving(null);
    }
  };

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-red-200 bg-red-100/50">
        <h3 className="text-sm font-semibold text-red-900 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4" />
          Activation Exceptions ({exceptions.length} unresolved)
        </h3>
      </div>
      <div className="divide-y">
        {exceptions.map((exc) => {
          const isExpanded = expanded === exc.item_id;
          return (
            <div key={`${exc.session_record_id}:${exc.item_id}`} className="p-3 hover:bg-red-50">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="font-mono text-xs font-medium text-red-900">{exc.session_id}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-sm font-medium">{exc.item_name}</span>
                    {exc.count > 0 && (
                      <span className="text-xs text-muted-foreground">(Qty: {exc.count})</span>
                    )}
                  </div>
                  <p className="text-xs text-red-700">{exc.failure_message}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Warehouse: {exc.warehouse || '—'}</span>
                    {exc.date && <span>Date: {exc.date}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => navigate(`/warehouse/setup/${exc.session_record_id}`)}
                  >
                    <ExternalLink className="w-3 h-3" /> Open
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setExpanded(isExpanded ? null : exc.item_id)}
                  >
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleResolve(exc)}
                    disabled={resolving === exc.item_id}
                  >
                    {resolving === exc.item_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                    Resolve
                  </Button>
                </div>
              </div>
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-red-200/50 space-y-1 text-xs text-muted-foreground">
                  <p><span className="font-medium text-foreground">Session Record ID:</span> {exc.session_record_id}</p>
                  <p><span className="font-medium text-foreground">Inventory Item ID:</span> {exc.item_id}</p>
                  <p><span className="font-medium text-foreground">Idempotency Key:</span> {exc.idempotency_key || '—'}</p>
                  <p><span className="font-medium text-foreground">Failure Type:</span> {exc.failure_type || 'activation_error'}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}