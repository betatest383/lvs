import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Inbox } from "lucide-react";
import { base44 } from "@/api/base44Client";
import EventCard from "@/components/servicetitan/EventCard";

export default function WebhookInbox() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const load = async () => {
    try {
      const data = await base44.entities.IntegrationEvent.list('-created_date', 200);
      setEvents(data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = events.filter(e => {
    const matchSearch = !search || (e.event_type || "").toLowerCase().includes(search.toLowerCase()) || (e.external_id || "").toLowerCase().includes(search.toLowerCase()) || (e.parsed_summary || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || e.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Webhook Inbox</h1>
        <p className="text-muted-foreground text-sm">All incoming ServiceTitan webhook events in real time</p>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search events..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="all">All Statuses</option>
          <option>Received</option>
          <option>Processing</option>
          <option>Processed</option>
          <option>Failed</option>
          <option>Ignored</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Inbox className="h-10 w-10 mx-auto mb-2 opacity-40" />
          No webhook events found.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(e => <EventCard key={e.id} event={e} showActions={false} />)}
        </div>
      )}
    </div>
  );
}