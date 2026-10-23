import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Package, ExternalLink, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { SyncBadge } from "@/components/servicetitan/StatusBadges";

export default function PurchaseOrderSync() {
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const load = async () => {
    try {
      const data = await base44.entities.ServiceTitanPurchaseOrder.list('-last_synced_at', 200);
      setPos(data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = pos.filter(p => {
    const matchSearch = !search || (p.po_number || "").toLowerCase().includes(search.toLowerCase()) || (p.vendor || "").toLowerCase().includes(search.toLowerCase()) || (p.job_number || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const poStatuses = [...new Set(pos.map(p => p.status).filter(Boolean))].sort();

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  const today = new Date().toISOString().split('T')[0];
  const overdueDeliveries = pos.filter(p => p.expected_delivery_date && p.expected_delivery_date < today && !p.received_date);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Purchase Order Sync</h1>
        <p className="text-muted-foreground text-sm">ServiceTitan purchase orders — read-only display with delivery tracking</p>
      </div>

      {overdueDeliveries.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-800">{overdueDeliveries.length} purchase order(s) past expected delivery date</p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by PO #, vendor, or job..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="all">All Statuses</option>
          {poStatuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
          No purchase orders synced yet.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => (
            <Card key={p.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center flex-shrink-0">
                      <Package className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium">PO {p.po_number}</p>
                      <p className="text-sm text-muted-foreground">{p.vendor || '—'}</p>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                        {p.job_number && <span>Job: {p.job_number}</span>}
                        {p.related_truck && <span>Truck: {p.related_truck}</span>}
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs">
                        {p.expected_delivery_date && <span className={p.expected_delivery_date < today && !p.received_date ? 'text-red-600 font-medium' : 'text-muted-foreground'}>Expected: {new Date(p.expected_delivery_date).toLocaleDateString()}</span>}
                        {p.received_date && <span className="text-green-600">Received: {new Date(p.received_date).toLocaleDateString()}</span>}
                      </div>
                      <div className="mt-2"><SyncBadge lastSynced={p.last_synced_at} /></div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {p.status && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{p.status}</span>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}