import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, EyeOff } from "lucide-react";
import { base44 } from "@/api/base44Client";
import EventCard from "@/components/servicetitan/EventCard";

export default function FailedSyncs() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retaking, setRetaking] = useState(null);

  const load = async () => {
    try {
      const data = await base44.entities.IntegrationEvent.list('-created_date', 200);
      setEvents(data.filter(e => e.status === 'Failed'));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleRetry = async (event) => {
    setRetaking(event.id);
    try {
      await base44.functions.invoke('servicetitanWebhook', {
        event_type: event.event_type,
        external_id: event.external_id,
        replay_payload: event.raw_payload,
      });
      load();
    } catch (e) {
      console.error(e);
      // Also update retry count locally
      await base44.entities.IntegrationEvent.update(event.id, {
        retry_count: (event.retry_count || 0) + 1,
        last_retry_at: new Date().toISOString(),
      });
      load();
    } finally { setRetaking(null); }
  };

  const handleIgnore = async (event) => {
    await base44.entities.IntegrationEvent.update(event.id, { status: 'Ignored' });
    load();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Failed Syncs</h1>
        <p className="text-muted-foreground text-sm">Troubleshoot and resolve failed ServiceTitan sync events</p>
      </div>

      {events.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-40 text-green-500" />
          No failed syncs. All events processed successfully.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {events.map(e => (
            <div key={e.id}>
              <EventCard event={e} onRetry={handleRetry} onIgnore={handleIgnore} />
              <div className="flex gap-2 mt-1 px-1">
                <Button size="sm" variant="outline" disabled={retaking === e.id} onClick={() => handleRetry(e)}>
                  {retaking === e.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                  Retry Sync
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleIgnore(e)}>
                  <EyeOff className="h-3.5 w-3.5 mr-1" /> Mark Ignored
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}