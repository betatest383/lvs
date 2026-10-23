import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useCurrentRole } from '@/hooks/useCurrentRole';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw, Play, Eye, RotateCcw, Ban, FlaskConical, History, AlertTriangle, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import WebhookPayloadDialog from '@/components/servicetitan/WebhookPayloadDialog';
import ReplayDialog from '@/components/servicetitan/ReplayDialog';
import DeadLetterQueue from '@/components/servicetitan/DeadLetterQueue';
import WebhookAnalytics from '@/components/servicetitan/WebhookAnalytics';
import RecoverProcessingDialog from '@/components/servicetitan/RecoverProcessingDialog';
import { isStaleProcessing, formatProcessingAge } from '@/lib/staleProcessingUtils';

const STATUS_COLORS = {
  received: 'bg-blue-100 text-blue-800',
  processing: 'bg-yellow-100 text-yellow-800',
  processed: 'bg-green-100 text-green-800',
  ignored: 'bg-gray-100 text-gray-600',
  failed: 'bg-red-100 text-red-800',
};

/** Check if an event type belongs to the appointment or technician domain */
function isAppointmentDomain(eventType) {
  if (!eventType) return false;
  const parts = eventType.toLowerCase().split('_');
  return parts.includes('appointment') || parts.includes('technician');
}

const SAMPLE_PAYLOADS = [
  {
    label: 'Valid: Job Created',
    payload: {
      event_type: 'job_created',
      event_id: 'test-job-001',
      tenant_id: 'tenant-001',
      id: 'job-12345',
      job_number: 'JOB-1001',
      customer_name: 'John Smith',
      job_status: 'scheduled',
      location: '123 Main St, Allentown, PA',
    },
  },
  {
    label: 'Missing Event ID',
    payload: {
      event_type: 'appointment_assigned',
      tenant_id: 'tenant-001',
      job_number: 'JOB-1002',
      technician_name: 'Mike Johnson',
    },
  },
  {
    label: 'Unknown Event Type',
    payload: {
      event_type: 'new_billing_system_event',
      event_id: 'test-unknown-001',
      data: { foo: 'bar' },
    },
  },
  {
    label: 'Processor Failure',
    payload: {
      event_type: 'job_updated',
      event_id: 'test-fail-001',
      job_number: 'JOB-1003',
      _forceFail: true,
    },
  },
  {
    label: 'Purchase Order',
    payload: {
      event_type: 'purchase_order_created',
      event_id: 'test-po-001',
      po_number: 'PO-5001',
      vendor: 'Chimney Supply Co',
      status: 'Open',
    },
  },
];

export default function ServiceTitanWebhookMonitor() {
  const { role, loading: roleLoading } = useCurrentRole();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: 'all', eventType: '', objectId: '' });
  const [payloadDialog, setPayloadDialog] = useState(null);
  const [replayTarget, setReplayTarget] = useState(null);
  const [recoverTarget, setRecoverTarget] = useState(null);
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [processing, setProcessing] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const query = {};
      if (filters.status && filters.status !== 'all') {
        query.processing_status = filters.status;
      }
      if (filters.eventType) query.event_type = filters.eventType;
      if (filters.objectId) query.object_id = filters.objectId;
      const result = await base44.entities.ServiceTitanWebhookEvent.filter(query, '-received_at', 100);
      setEvents(result);
    } catch (err) {
      toast.error('Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const handleProcessNext = async () => {
    setProcessing(true);
    try {
      const response = await base44.functions.invoke('processServiceTitanWebhookEvent', {});
      if (response.data?.success) {
        toast.success(response.data.result?.summary || response.data.message || 'Event processed');
      } else {
        toast.error(response.data?.error || 'Processing failed');
      }
      fetchEvents();
    } catch (err) {
      toast.error('Failed to process event');
    } finally {
      setProcessing(false);
    }
  };

  const handleRetry = async (eventId) => {
    try {
      const response = await base44.functions.invoke('processServiceTitanWebhookEvent', { event_id: eventId });
      if (response.data?.success) {
        toast.success(response.data.result?.summary || 'Event processed');
      } else {
        toast.error(response.data?.error || 'Retry failed');
      }
      fetchEvents();
    } catch (err) {
      toast.error('Failed to retry event');
    }
  };

  const handleMarkIgnored = async (eventId) => {
    try {
      const response = await base44.functions.invoke('manageServiceTitanWebhookEvent', {
        action: 'ignore',
        webhook_event_id: eventId,
      });
      if (response.data?.success) {
        toast.success('Event marked as ignored');
      } else {
        toast.error(response.data?.error || 'Failed to mark event as ignored');
        return;
      }
      fetchEvents();
    } catch (err) {
      toast.error('Failed to mark event as ignored');
    }
  };

  const handleTestSubmit = async (payload) => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await base44.functions.invoke('servicetitanWebhook', { _testMode: true, ...payload });
      setTestResult(response.data);
      if (response.data?.success) {
        toast.success(response.data.duplicate ? 'Duplicate detected — not stored again' : 'Event received');
      } else {
        toast.error(response.data?.error || 'Test failed');
      }
      fetchEvents();
    } catch (err) {
      setTestResult({ error: err.message });
      toast.error('Test submission failed');
    } finally {
      setTesting(false);
    }
  };

  if (roleLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (role !== 'admin' && role !== 'owner') {
    return <div className="p-8 text-center text-muted-foreground">Admin access required to view webhook monitor.</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">ServiceTitan Webhook Monitor</h1>
          <p className="text-sm text-muted-foreground">Secure, observable, idempotent webhook ingestion</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowTestPanel(!showTestPanel)}>
            <FlaskConical className="w-4 h-4 mr-1" /> Test Mode
          </Button>
          <Button variant="outline" size="sm" onClick={fetchEvents} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" onClick={handleProcessNext} disabled={processing}>
            <Play className="w-4 h-4 mr-1" /> Process Next
          </Button>
        </div>
      </div>

      {/* Analytics */}
      <WebhookAnalytics />

      {/* Dead Letter Queue */}
      <DeadLetterQueue onRefresh={fetchEvents} />

      {/* Test panel */}
      {showTestPanel && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Test Mode — Submit Sample Payloads</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Submits payloads directly to the webhook receiver with admin authentication. Use the same payload twice to test idempotency.</p>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_PAYLOADS.map((sample, i) => (
                <Button key={i} variant="outline" size="sm" onClick={() => handleTestSubmit(sample.payload)} disabled={testing}>
                  {sample.label}
                </Button>
              ))}
            </div>
            {testResult && (
              <div className="p-3 bg-muted rounded text-xs">
                <pre className="whitespace-pre-wrap">{JSON.stringify(testResult, null, 2)}</pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="processed">Processed</SelectItem>
                <SelectItem value="ignored">Ignored</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Event Type" value={filters.eventType} onChange={(e) => setFilters({ ...filters, eventType: e.target.value })} />
            <Input placeholder="Object ID" value={filters.objectId} onChange={(e) => setFilters({ ...filters, objectId: e.target.value })} />
            <Button variant="outline" size="sm" onClick={fetchEvents}>Apply Filters</Button>
          </div>
        </CardContent>
      </Card>

      {/* Events table */}
      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : events.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">No webhook events found. Use Test Mode to submit sample payloads.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2 whitespace-nowrap">Received</th>
                    <th className="p-2">Event Type</th>
                    <th className="p-2">Object Type</th>
                    <th className="p-2">Object ID</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Sync</th>
                    <th className="p-2">Processing Info</th>
                    <th className="p-2 text-center">Attempts</th>
                    <th className="p-2 text-center">Replays</th>
                    <th className="p-2">Last Error</th>
                    <th className="p-2 whitespace-nowrap">Processed</th>
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(event => (
                    <tr key={event.id} className="border-b hover:bg-muted/50">
                      <td className="p-2 whitespace-nowrap">{event.received_at ? format(new Date(event.received_at), 'MMM d, HH:mm:ss') : '—'}</td>
                      <td className="p-2"><code className="text-xs">{event.event_type}</code></td>
                      <td className="p-2"><Badge variant="outline" className="text-xs">{event.object_type}</Badge></td>
                      <td className="p-2 font-mono text-xs truncate max-w-[120px]">{event.object_id || '—'}</td>
                      <td className="p-2">
                        {event.processing_status === 'processing' && isStaleProcessing(event) ? (
                          <Badge className="bg-orange-100 text-orange-800 border-orange-300 flex items-center gap-1 w-fit">
                            <AlertTriangle className="w-3 h-3" /> Processing Timeout
                          </Badge>
                        ) : event.processing_status === 'processing' ? (
                          <Badge className="bg-yellow-100 text-yellow-800 flex items-center gap-1 w-fit">
                            <Loader2 className="w-3 h-3 animate-spin" /> Processing
                          </Badge>
                        ) : (event.processing_recovery_count || 0) > 0 ? (
                          <Badge className="bg-purple-100 text-purple-800 flex items-center gap-1 w-fit">
                            <ShieldCheck className="w-3 h-3" /> Recovered ({event.processing_recovery_count})
                          </Badge>
                        ) : (
                          <Badge className={STATUS_COLORS[event.processing_status] || 'bg-gray-100'}>{event.processing_status}</Badge>
                        )}
                      </td>
                      <td className="p-2">
                        {isAppointmentDomain(event.event_type) ? (
                          <Badge className={
                            event.processing_status === 'processed' ? 'bg-green-100 text-green-800' :
                            event.processing_status === 'failed' ? 'bg-red-100 text-red-800' :
                            event.processing_status === 'dead_letter' ? 'bg-red-100 text-red-800' :
                            event.processing_status === 'ignored' ? 'bg-gray-100 text-gray-500' :
                            'bg-yellow-100 text-yellow-800'
                          }>
                            {event.processing_status === 'processed' ? 'Synced' :
                             event.processing_status === 'failed' ? 'Failed' :
                             event.processing_status === 'dead_letter' ? 'DLQ' :
                             event.processing_status === 'ignored' ? 'Ignored' :
                             'Pending'}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2 text-xs whitespace-nowrap">
                        {event.processing_status === 'processing' ? (
                          <div className="space-y-0.5">
                            <div className={isStaleProcessing(event) ? 'text-orange-600 font-medium' : 'text-muted-foreground'}>
                              Age: {formatProcessingAge(event)}
                            </div>
                            {event.processing_claim_id && (
                              <div className="text-muted-foreground font-mono" title={event.processing_claim_id}>
                                ID: {event.processing_claim_id.substring(0, 12)}...
                              </div>
                            )}
                            {event.processing_claimed_by && (
                              <div className="text-muted-foreground truncate max-w-[100px]" title={event.processing_claimed_by}>
                                By: {event.processing_claimed_by}
                              </div>
                            )}
                          </div>
                        ) : (event.processing_recovery_count || 0) > 0 ? (
                          <div className="space-y-0.5">
                            <div className="text-purple-600">Recovered: {event.processing_recovery_count}×</div>
                            {event.processing_recovered_at && (
                              <div className="text-muted-foreground">{format(new Date(event.processing_recovered_at), 'MMM d, HH:mm')}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2 text-center">{event.processing_attempts}</td>
                      <td className="p-2 text-center">{event.replay_count || 0}</td>
                      <td className="p-2 text-xs text-red-600 truncate max-w-[200px]" title={event.last_error}>{event.last_error || '—'}</td>
                      <td className="p-2 whitespace-nowrap">{event.processed_at ? format(new Date(event.processed_at), 'MMM d, HH:mm') : '—'}</td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPayloadDialog(event)} title="View Payload">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setReplayTarget(event)} title="Replay Webhook">
                            <History className="w-3.5 h-3.5" />
                          </Button>
                          {isStaleProcessing(event) && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-orange-600 hover:text-orange-700" onClick={() => setRecoverTarget(event)} title="Recover Processing">
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {(event.processing_status === 'failed' || event.processing_status === 'ignored') && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRetry(event.id)} title="Retry Processing">
                              <RotateCcw className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {event.processing_status !== 'ignored' && event.processing_status !== 'processed' && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMarkIgnored(event.id)} title="Mark Ignored">
                              <Ban className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payload dialog */}
      {payloadDialog && (
        <WebhookPayloadDialog event={payloadDialog} open={!!payloadDialog} onOpenChange={(v) => { if (!v) setPayloadDialog(null); }} />
      )}

      {/* Replay dialog */}
      {replayTarget && (
        <ReplayDialog
          event={replayTarget}
          open={!!replayTarget}
          onOpenChange={(v) => { if (!v) setReplayTarget(null); }}
          onReplayed={fetchEvents}
        />
      )}

      {/* Recover processing dialog */}
      {recoverTarget && (
        <RecoverProcessingDialog
          event={recoverTarget}
          open={!!recoverTarget}
          onOpenChange={(v) => { if (!v) setRecoverTarget(null); }}
          onRecovered={fetchEvents}
        />
      )}
    </div>
  );
}