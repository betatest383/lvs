import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, History, Calendar, AlertTriangle, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import WebhookTimeline from '@/components/servicetitan/WebhookTimeline';
import { isStaleProcessing, formatProcessingAge } from '@/lib/staleProcessingUtils';

const REPLAY_STATUS_COLORS = {
  processed: 'bg-green-100 text-green-800',
  ignored: 'bg-gray-100 text-gray-600',
  failed: 'bg-red-100 text-red-800',
};

/**
 * Displays a stored webhook event's full payload as formatted JSON,
 * along with all metadata fields, replay audit trail, and replay history.
 * Used by the ServiceTitan Webhook Monitor.
 */
export default function WebhookPayloadDialog({ event, open, onOpenChange }) {
  const navigate = useNavigate();
  const [replays, setReplays] = useState([]);
  const [loadingReplays, setLoadingReplays] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showTimeline, setShowTimeline] = useState(true);
  const [syncMeta, setSyncMeta] = useState(null);

  // Fetch the latest handler_finished timeline entry to extract sync metadata
  useEffect(() => {
    if (!event?.id || !open) return;
    setSyncMeta(null);
    base44.entities.ServiceTitanWebhookTimeline.filter(
      { webhook_event_id: event.id, stage: 'handler_finished' },
      '-timestamp',
      1
    )
      .then(entries => {
        if (entries.length > 0 && entries[0].metadata_json) {
          try {
            const meta = JSON.parse(entries[0].metadata_json);
            setSyncMeta(meta);
          } catch {
            setSyncMeta(null);
          }
        }
      })
      .catch(() => setSyncMeta(null));
  }, [event?.id, open]);

  // Determine if this is an appointment/technician domain event
  const isAppointmentDomain = useMemo(() => {
    if (!event?.event_type) return false;
    const parts = event.event_type.toLowerCase().split('_');
    return parts.includes('appointment') || parts.includes('technician');
  }, [event?.event_type]);

  const formattedPayload = useMemo(() => {
    if (!event?.payload_json) return '';
    try {
      return JSON.stringify(JSON.parse(event.payload_json), null, 2);
    } catch {
      return event.payload_json || '';
    }
  }, [event]);

  useEffect(() => {
    if (!event?.id || !showHistory) return;
    setLoadingReplays(true);
    base44.entities.ServiceTitanWebhookReplay.filter(
      { webhook_event_id: event.id },
      '-replayed_at',
      50
    )
      .then(setReplays)
      .catch(() => setReplays([]))
      .finally(() => setLoadingReplays(false));
  }, [event?.id, showHistory]);

  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Webhook Event Payload</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Core metadata */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">Event ID:</span> <code className="text-xs">{event.event_id || '(none)'}</code></div>
            <div><span className="text-muted-foreground">Event Type:</span> <code className="text-xs">{event.event_type}</code></div>
            <div><span className="text-muted-foreground">Object Type:</span> {event.object_type}</div>
            <div><span className="text-muted-foreground">Object ID:</span> <code className="text-xs">{event.object_id || '—'}</code></div>
            <div><span className="text-muted-foreground">Status:</span> {event.processing_status}</div>
            <div><span className="text-muted-foreground">Attempts:</span> {event.processing_attempts}</div>
            <div><span className="text-muted-foreground">Received:</span> {event.received_at ? format(new Date(event.received_at), 'MMM d, yyyy HH:mm:ss') : '—'}</div>
            <div><span className="text-muted-foreground">Processed:</span> {event.processed_at ? format(new Date(event.processed_at), 'MMM d, yyyy HH:mm:ss') : '—'}</div>
            {event.tenant_id && <div><span className="text-muted-foreground">Tenant:</span> <code className="text-xs">{event.tenant_id}</code></div>}
            {event.next_retry_at && <div><span className="text-muted-foreground">Next Retry:</span> {format(new Date(event.next_retry_at), 'MMM d, yyyy HH:mm')}</div>}
            <div className="col-span-2"><span className="text-muted-foreground">Payload Hash:</span> <code className="text-xs break-all">{event.payload_hash}</code></div>
            {event.last_error && (
              <div className="col-span-2"><span className="text-muted-foreground">Last Error:</span> <span className="text-red-600 text-xs">{event.last_error}</span></div>
            )}
          </div>

          {/* Processing Metadata */}
          {(event.processing_status === 'processing' || (event.processing_recovery_count || 0) > 0 || event.processing_claim_id) && (
            <div className="border-t pt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">Processing Metadata</span>
                {event.processing_status === 'processing' && isStaleProcessing(event) && (
                  <Badge className="bg-orange-100 text-orange-800 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Stale
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {event.processing_started_at && (
                  <div><span className="text-muted-foreground">Started At:</span> {format(new Date(event.processing_started_at), 'MMM d, HH:mm:ss')}</div>
                )}
                {event.processing_status === 'processing' && (
                  <div>
                    <span className="text-muted-foreground">Processing Age:</span>{' '}
                    <span className={isStaleProcessing(event) ? 'text-orange-600 font-medium' : ''}>{formatProcessingAge(event)}</span>
                  </div>
                )}
                {event.processing_claim_id && (
                  <div className="col-span-2"><span className="text-muted-foreground">Claim ID:</span> <code className="text-xs break-all">{event.processing_claim_id}</code></div>
                )}
                {event.processing_claimed_by && (
                  <div><span className="text-muted-foreground">Claimed By:</span> {event.processing_claimed_by}</div>
                )}
                {(event.processing_recovery_count || 0) > 0 && (
                  <div><span className="text-muted-foreground">Recovery Count:</span> <Badge className="bg-purple-100 text-purple-800">{event.processing_recovery_count}</Badge></div>
                )}
                {event.processing_recovered_at && (
                  <div><span className="text-muted-foreground">Recovered At:</span> {format(new Date(event.processing_recovered_at), 'MMM d, HH:mm:ss')}</div>
                )}
                {event.processing_recovered_by && (
                  <div><span className="text-muted-foreground">Recovered By:</span> {event.processing_recovered_by}</div>
                )}
                {event.processing_recovery_reason && (
                  <div className="col-span-2"><span className="text-muted-foreground">Recovery Reason:</span> {event.processing_recovery_reason}</div>
                )}
              </div>
            </div>
          )}

          {/* Appointment Sync Metadata */}
          {isAppointmentDomain && (
            <div className="border-t pt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">Appointment Sync</span>
                {syncMeta?.local_appointment_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={() => navigate('/tasks/calendar')}
                  >
                    <Calendar className="w-3.5 h-3.5 mr-1" /> Open Calendar
                  </Button>
                )}
              </div>
              {!syncMeta ? (
                <div className="text-xs text-muted-foreground py-1">No sync metadata available.</div>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Sync Action:</span>{' '}
                    {syncMeta.sync_action && (
                      <Badge className={
                        syncMeta.sync_action === 'created' ? 'bg-green-100 text-green-800' :
                        syncMeta.sync_action === 'updated' ? 'bg-blue-100 text-blue-800' :
                        syncMeta.sync_action === 'rescheduled' ? 'bg-indigo-100 text-indigo-800' :
                        syncMeta.sync_action === 'unchanged' ? 'bg-gray-100 text-gray-600' :
                        syncMeta.sync_action === 'canceled' ? 'bg-red-100 text-red-800' :
                        syncMeta.sync_action === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                        syncMeta.sync_action === 'stale_ignored' ? 'bg-amber-100 text-amber-800' :
                        syncMeta.sync_action === 'unmatched' ? 'bg-orange-100 text-orange-800' :
                        syncMeta.sync_action === 'technician_mapping_failed' ? 'bg-orange-100 text-orange-800' :
                        'bg-gray-100'
                      }>{syncMeta.sync_action}</Badge>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Technician Mapping:</span>{' '}
                    {syncMeta.technician_mapping && (
                      <Badge className={
                        syncMeta.technician_mapping === 'matched' ? 'bg-green-100 text-green-800' :
                        syncMeta.technician_mapping === 'unmatched' ? 'bg-amber-100 text-amber-800' :
                        'bg-gray-100 text-gray-600'
                      }>{syncMeta.technician_mapping}</Badge>
                    )}
                  </div>
                  {syncMeta.local_appointment_id && (
                    <div><span className="text-muted-foreground">Local Appt ID:</span> <code className="text-xs">{syncMeta.local_appointment_id.substring(0, 12)}...</code></div>
                  )}
                  {syncMeta.servicetitan_appointment_id && (
                    <div><span className="text-muted-foreground">ST Appt ID:</span> <code className="text-xs">{syncMeta.servicetitan_appointment_id}</code></div>
                  )}
                  {syncMeta.changed_fields && syncMeta.changed_fields.length > 0 && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Changed Fields:</span>{' '}
                      {syncMeta.changed_fields.map(f => (
                        <Badge key={f} variant="outline" className="mr-1 mb-0.5 text-xs">{f}</Badge>
                      ))}
                    </div>
                  )}
                  {syncMeta.previous_start && (
                    <div className="col-span-2 text-xs">
                      <span className="text-muted-foreground">Previous Start:</span> {syncMeta.previous_start} → <span className="text-muted-foreground">New:</span> {syncMeta.new_start}
                    </div>
                  )}
                  {syncMeta.previous_end && (
                    <div className="col-span-2 text-xs">
                      <span className="text-muted-foreground">Previous End:</span> {syncMeta.previous_end} → <span className="text-muted-foreground">New:</span> {syncMeta.new_end}
                    </div>
                  )}
                  {syncMeta.is_reassignment && (
                    <div className="col-span-2 text-xs">
                      <Badge className="bg-purple-100 text-purple-800">Technician Reassignment</Badge>
                    </div>
                  )}
                  {syncMeta.incoming_event_at && syncMeta.existing_event_at && (
                    <div className="col-span-2 text-xs">
                      <span className="text-muted-foreground">Event Ordering:</span>{' '}
                      <span className="text-amber-700">Incoming: {syncMeta.incoming_event_at}</span>
                      {' → '}
                      <span className="text-blue-700">Existing: {syncMeta.existing_event_at}</span>
                    </div>
                  )}
                </div>
              )}
              {/* Warnings */}
              {syncMeta.warnings && syncMeta.warnings.length > 0 && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs">
                  <div className="flex items-center gap-1 mb-1 text-amber-800 font-medium">
                    <AlertTriangle className="w-3 h-3" /> Warnings
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-amber-700">
                    {syncMeta.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Replay audit trail */}
          <div className="border-t pt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">Replay History</span>
              <Button variant="ghost" size="sm" className="h-7" onClick={() => setShowHistory(!showHistory)}>
                <History className="w-3.5 h-3.5 mr-1" />
                {showHistory ? 'Hide' : 'Show'} History
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Replay Count:</span> {event.replay_count || 0}</div>
              <div><span className="text-muted-foreground">Last Replay:</span> {event.last_replay_at ? format(new Date(event.last_replay_at), 'MMM d, yyyy HH:mm') : '—'}</div>
              <div><span className="text-muted-foreground">Last Replay By:</span> {event.last_replay_by || '—'}</div>
              <div><span className="text-muted-foreground">Last Result:</span> {event.last_replay_result || '—'}</div>
            </div>
          </div>

          {/* Replay history table */}
          {showHistory && (
            <div className="border rounded">
              {loadingReplays ? (
                <div className="flex justify-center p-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
              ) : replays.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">No replay records found.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-1.5">Attempt</th>
                      <th className="p-1.5">Replayed At</th>
                      <th className="p-1.5">By</th>
                      <th className="p-1.5">Handler</th>
                      <th className="p-1.5">Status</th>
                      <th className="p-1.5">Duration</th>
                      <th className="p-1.5">Result / Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {replays.map(r => (
                      <tr key={r.id} className="border-b">
                        <td className="p-1.5 text-center">{r.processing_attempt}</td>
                        <td className="p-1.5 whitespace-nowrap">{r.replayed_at ? format(new Date(r.replayed_at), 'MMM d, HH:mm:ss') : '—'}</td>
                        <td className="p-1.5 truncate max-w-[100px]">{r.replayed_by}</td>
                        <td className="p-1.5 font-mono">{r.handler_name}</td>
                        <td className="p-1.5"><Badge className={REPLAY_STATUS_COLORS[r.final_status] || 'bg-gray-100'}>{r.final_status}</Badge></td>
                        <td className="p-1.5">{r.duration_ms} ms</td>
                        <td className="p-1.5 text-xs truncate max-w-[200px]" title={r.error || r.result}>
                          {r.success ? r.result : <span className="text-red-600">{r.error}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Processing Timeline */}
          <div className="border-t pt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">Processing Timeline</span>
              <Button variant="ghost" size="sm" className="h-7" onClick={() => setShowTimeline(!showTimeline)}>
                {showTimeline ? 'Hide' : 'Show'} Timeline
              </Button>
            </div>
            {showTimeline && event?.id && (
              <WebhookTimeline webhookEventId={event.id} />
            )}
          </div>

          {/* Payload JSON */}
          <div>
            <div className="text-sm font-medium mb-1">Payload:</div>
            <pre className="bg-muted p-3 rounded text-xs overflow-x-auto max-h-96">{formattedPayload}</pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}