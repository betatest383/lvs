import { useState } from 'react';
import { ChevronDown, ChevronRight, Code } from 'lucide-react';
import { getTimelineEventMeta } from '@/lib/inventoryTimelineConstants';
import { formatRelativeTime, buildReasonContext, deriveSourceModule } from '@/lib/auditUtils';
import PerformedByBadge from './PerformedByBadge';
import InventoryChangeDiff from './InventoryChangeDiff';
import RelatedRecords from './RelatedRecords';

/**
 * A single timeline event card with:
 * - Header: Event Icon, Transaction Type, Date, Time, Relative Time
 * - Performed By (resolved employee or System Automation)
 * - Rich Reason context (job, customer, technician, truck, qty)
 * - Related Records (clickable links)
 * - Inventory Changes (before → after, highlighted)
 * - Expandable Developer Details (raw IDs, source module, metadata)
 */
export default function TimelineEventCard({ event, item, employeeMap, developerMode }) {
  const [expanded, setExpanded] = useState(false);
  const txn = event.txn;
  const meta = getTimelineEventMeta(txn.transaction_type);
  const Icon = meta.icon;
  const reasonLines = buildReasonContext(txn);
  const date = event.date;

  return (
    <div className="relative pl-8 pb-4">
      <div className={`absolute left-0.5 top-2 w-3 h-3 rounded-full ${meta.dot} ring-4 ring-background z-10`} />
      <div className="rounded-lg border p-3 space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${meta.color}`}>{meta.label}</span>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">
              {date ? new Date(date).toLocaleDateString() : '—'} · {date ? new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
            </p>
            <p className="text-xs text-muted-foreground italic">{formatRelativeTime(date)}</p>
          </div>
        </div>

        {/* Performed By */}
        <PerformedByBadge txn={txn} employeeMap={employeeMap} developerMode={developerMode} />

        {/* Reason context */}
        {reasonLines.length > 0 && (
          <div className="text-xs space-y-0.5 border-l-2 border-muted pl-2">
            {reasonLines.map((line, i) => (
              <p key={i} className={i === 0 ? 'font-medium' : 'text-muted-foreground'}>{line}</p>
            ))}
          </div>
        )}

        {/* Related Records */}
        <RelatedRecords txn={txn} />

        {/* Inventory Changes */}
        <InventoryChangeDiff txn={txn} item={item} />

        {/* Expandable Developer Details */}
        {developerMode && (
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <Code className="w-3 h-3" /> Developer Details
          </button>
        )}
        {developerMode && expanded && (
          <div className="rounded border bg-muted/30 p-2 space-y-0.5 text-xs font-mono overflow-x-auto">
            <div><span className="text-muted-foreground">Transaction ID:</span> {txn.transaction_id || '—'}</div>
            <div><span className="text-muted-foreground">Record ID:</span> {txn.id || '—'}</div>
            <div><span className="text-muted-foreground">Created By:</span> {txn.created_by || '—'}</div>
            <div><span className="text-muted-foreground">Source Module:</span> {deriveSourceModule(txn)}</div>
            <div><span className="text-muted-foreground">Audit Ref:</span> {txn.audit_reference || '—'}</div>
            <div><span className="text-muted-foreground">Status:</span> {txn.status || '—'}</div>
            <div><span className="text-muted-foreground">Approved By:</span> {txn.approved_by || '—'}</div>
          </div>
        )}
      </div>
    </div>
  );
}