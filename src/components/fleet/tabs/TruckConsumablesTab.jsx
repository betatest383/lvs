import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Package } from "lucide-react";
import { base44 } from "@/api/base44Client";

export function TruckConsumablesTab({ truck }) {
  const [requests, setRequests] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [reqs, trans] = await Promise.all([
          base44.entities.ConsumableReplenishment.list('-created_date', 50),
          base44.entities.MaterialTransferSheet.list('-created_date', 50),
        ]);
        setRequests(reqs.filter(r => r.truck_number === truck.truck_number || r.truck_number === truck.truck_id));
        setTransfers(trans.filter(t => t.truck_number === truck.truck_number));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [truck]);

  if (loading) return <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" /> Consumable Replenishment Requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No consumable requests for this truck.</p>
          ) : requests.map(r => (
            <Link key={r.id} to={`/consumables/${r.id}`} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent">
              <div>
                <p className="font-medium text-sm">{r.request_id || "Request"}</p>
                <p className="text-xs text-muted-foreground">{r.date} — {r.technician || ""}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded-md bg-amber-100 text-amber-700">{r.status}</span>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Material Transfer Sheets</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {transfers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No transfer sheets for this truck.</p>
          ) : transfers.map(t => (
            <Link key={t.id} to="/warehouse/transfer-sheets" className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent">
              <div>
                <p className="font-medium text-sm">{t.date} — {t.technician || ""}</p>
                <p className="text-xs text-muted-foreground">{t.materials_taken || "—"}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded-md bg-indigo-100 text-indigo-700">{t.status}</span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}