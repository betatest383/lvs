import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Boxes } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { SyncBadge } from "@/components/servicetitan/StatusBadges";

export default function InventorySync() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");

  const load = async () => {
    try {
      const data = await base44.entities.ServiceTitanInventoryEvent.list('-event_date', 200);
      setEvents(data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = events.filter(e => {
    const matchSearch = !search || (e.item_name || "").toLowerCase().includes(search.toLowerCase()) || (e.sku || "").toLowerCase().includes(search.toLowerCase()) || (e.truck || "").toLowerCase().includes(search.toLowerCase()) || (e.job_number || "").toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || e.event_type === filterType;
    return matchSearch && matchType;
  });

  const eventTypes = [...new Set(events.map(e => e.event_type).filter(Boolean))].sort();

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Inventory Sync</h1>
        <p className="text-muted-foreground text-sm">ServiceTitan inventory transfer events — read-only audit trail</p>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by item, SKU, truck, or job..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="all">All Event Types</option>
          {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Boxes className="h-10 w-10 mx-auto mb-2 opacity-40" />
          No inventory events synced yet.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(e => (
            <Card key={e.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-teal-100 text-teal-600 flex items-center justify-center flex-shrink-0">
                      <Boxes className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium">{e.item_name}</p>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                        {e.sku && <span>SKU: {e.sku}</span>}
                        <span>Qty: {e.quantity}</span>
                        {e.source_location && <span>From: {e.source_location}</span>}
                        {e.destination_location && <span>To: {e.destination_location}</span>}
                        {e.truck && <span>Truck: {e.truck}</span>}
                        {e.job_number && <span>Job: {e.job_number}</span>}
                      </div>
                      {e.event_date && <p className="text-xs mt-1">Event: {new Date(e.event_date).toLocaleString()}</p>}
                      <div className="mt-2"><SyncBadge lastSynced={e.last_synced_at} /></div>
                    </div>
                  </div>
                  {e.event_type && <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 flex-shrink-0">{e.event_type}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}