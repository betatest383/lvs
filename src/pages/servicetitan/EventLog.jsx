import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, ScrollText } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import EventCard from "@/components/servicetitan/EventCard";

export default function EventLog() {
  const { toast } = useToast();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [replaying, setReplaying] = useState(null);

  const handleReplay = async (event) => {
    setReplaying(event.id);
    try {
      await base44.functions.invoke('simulateWebhookEvent', {
        event_type: event.event_type,
        payload: event.raw_payload,
        is_replay: true,
      });
      toast({ title: 'Event Replayed', description: 'New simulated event created — check the top of the log.' });
      load();
    } catch (e) {
      toast({ title: 'Replay Failed', description: e.response?.data?.error || e.message, variant: 'destructive' });
    } finally {
      setReplaying(null);
    }
  };

  const load = async () => {
    try {
      const data = await base44.entities.IntegrationEvent.list('-created_date', 500);
      setEvents(data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = events.filter(e => {
    const matchSearch = !search || (e.event_type || "").toLowerCase().includes(search.toLowerCase()) || (e.external_id || "").toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || e.event_type === filterType;
    return matchSearch && matchType;
  });

  const eventTypes = [...new Set(events.map(e => e.event_type).filter(Boolean))].sort();

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Event Log</h1>
        <p className="text-muted-foreground text-sm">Permanent audit trail of every ServiceTitan webhook event</p>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by type or ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="all">All Event Types</option>
          {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <ScrollText className="h-10 w-10 mx-auto mb-2 opacity-40" />
          No events in the log.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(e => <EventCard key={e.id} event={e} showActions={false} onReplay={handleReplay} replaying={replaying === e.id} />)}
        </div>
      )}
    </div>
  );
}