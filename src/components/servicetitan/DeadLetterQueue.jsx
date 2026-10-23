import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, RotateCcw, Ban, Trash2, History, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function DeadLetterQueue({ onRefresh }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const result = await base44.entities.ServiceTitanWebhookEvent.filter(
        { processing_status: 'dead_letter' },
        '-received_at',
        50
      );
      setEvents(result);
    } catch {
      toast.error('Failed to load dead letter events');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const handleAction = async (event, action) => {
    setActionLoading(prev => ({ ...prev, [event.id]: action }));
    try {
      if (action === 'replay') {
        const response = await base44.functions.invoke('replayServiceTitanWebhook', { webhook_event_id: event.id });
        if (response.data?.success) {
          toast.success('Replay successful');
        } else {
          toast.error(response.data?.error || 'Replay failed');
        }
      } else {
        // requeue, ignore, delete — all go through the backend management function
        const response = await base44.functions.invoke('manageServiceTitanWebhookEvent', {
          action,
          webhook_event_id: event.id,
        });
        if (response.data?.success) {
          toast.success(response.data.message || `Event ${action}d`);
        } else {
          toast.error(response.data?.error || `Failed to ${action} event`);
          return;
        }
      }
      fetchEvents();
      onRefresh?.();
    } catch (err) {
      toast.error(`Failed to ${action} event`);
    } finally {
      setActionLoading(prev => ({ ...prev, [event.id]: null }));
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            Dead Letter Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        </CardContent>
      </Card>
    );
  }

  if (events.length === 0) {
    return null;
  }

  return (
    <Card className="border-red-200">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          Dead Letter Queue
          <Badge className="bg-red-100 text-red-800 ml-1">{events.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">Event Type</th>
                <th className="p-2">Object ID</th>
                <th className="p-2 text-center">Attempts</th>
                <th className="p-2">Last Error</th>
                <th className="p-2 whitespace-nowrap">Dead Lettered At</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map(event => (
                <tr key={event.id} className="border-b hover:bg-muted/50">
                  <td className="p-2"><code className="text-xs">{event.event_type}</code></td>
                  <td className="p-2 font-mono text-xs truncate max-w-[120px]">{event.object_id || '—'}</td>
                  <td className="p-2 text-center">{event.processing_attempts}</td>
                  <td className="p-2 text-xs text-red-600 truncate max-w-[200px]" title={event.dead_letter_reason || event.last_error}>
                    {event.dead_letter_reason || event.last_error}
                  </td>
                  <td className="p-2 whitespace-nowrap text-xs">
                    {event.dead_letter_at ? format(new Date(event.dead_letter_at), 'MMM d, HH:mm') : '—'}
                  </td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => handleAction(event, 'requeue')}
                        disabled={actionLoading[event.id] === 'requeue'}
                        title="Requeue for processing"
                      >
                        {actionLoading[event.id] === 'requeue'
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <RotateCcw className="w-3.5 h-3.5" />}
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => handleAction(event, 'replay')}
                        disabled={actionLoading[event.id] === 'replay'}
                        title="Replay webhook"
                      >
                        {actionLoading[event.id] === 'replay'
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <History className="w-3.5 h-3.5" />}
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => handleAction(event, 'ignore')}
                        disabled={actionLoading[event.id] === 'ignore'}
                        title="Mark as ignored"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-red-600"
                        onClick={() => handleAction(event, 'delete')}
                        disabled={actionLoading[event.id] === 'delete'}
                        title="Delete event"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}