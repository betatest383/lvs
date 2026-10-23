import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, FileText, Lock, Signature, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { TransferSheetStatusBadge, SyncBadge } from "@/components/servicetitan/StatusBadges";
import SignaturePad from "@/components/warehouse/SignaturePad";

export default function TransferSheetSync() {
  const { user } = useAuth();
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterReceipt, setFilterReceipt] = useState("all");
  const [selected, setSelected] = useState(null);
  const [signing, setSigning] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = async () => {
    try {
      const data = await base44.entities.ServiceTitanTransferSheet.list('-last_synced_at', 200);
      setSheets(data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = sheets.filter(s => {
    const matchSearch = !search || (s.transfer_sheet_number || "").toLowerCase().includes(search.toLowerCase()) || (s.job_number || "").toLowerCase().includes(search.toLowerCase()) || (s.customer_name || "").toLowerCase().includes(search.toLowerCase());
    const matchReceipt = filterReceipt === "all" ||
      (filterReceipt === "waiting" && s.waiting_for_truck_receipt && !s.technician_received) ||
      (filterReceipt === "received" && s.technician_received);
    return matchSearch && matchReceipt;
  });

  const handleConfirmReceipt = async (signatureDataUrl) => {
    setConfirming(true);
    try {
      await base44.entities.ServiceTitanTransferSheet.update(selected.id, {
        technician_received: true,
        technician_received_at: new Date().toISOString(),
        received_signature: signatureDataUrl,
        warehouse_picked_status: "Picked",
        waiting_for_truck_receipt: false,
      });
      setSelected(null);
      setSigning(false);
      load();
    } catch (e) { console.error(e); } finally { setConfirming(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Transfer Sheet Sync</h1>
        <p className="text-muted-foreground text-sm">ServiceTitan material transfer sheets — read-only, with technician receipt confirmation</p>
      </div>

      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-3 flex items-center gap-2">
          <Lock className="h-4 w-4 text-blue-600 flex-shrink-0" />
          <p className="text-xs text-blue-800">ServiceTitan is the system of record. Item data is read-only in LVC OS. LVC OS captures technician receipt signatures and timestamps.</p>
        </CardContent>
      </Card>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by sheet #, job, or customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select value={filterReceipt} onChange={(e) => setFilterReceipt(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="all">All Sheets</option>
          <option value="waiting">Waiting for Receipt</option>
          <option value="received">Received</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
          No transfer sheets synced yet.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium">TS {s.transfer_sheet_number}</p>
                      <p className="text-sm text-muted-foreground">{s.customer_name}</p>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                        {s.job_number && <span>Job: {s.job_number}</span>}
                        {s.truck && <span>Truck: {s.truck}</span>}
                        {s.technician && <span>Tech: {s.technician}</span>}
                        <span>{s.materials_count || 0} items / {s.total_quantity || 0} qty</span>
                        {s.total_cost > 0 && <span>${s.total_cost.toFixed(2)}</span>}
                      </div>
                      <div className="mt-2"><SyncBadge lastSynced={s.last_synced_at} /></div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <TransferSheetStatusBadge status={s.warehouse_picked_status} />
                    {s.technician_received ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3.5 w-3.5" /> Received</span>
                    ) : s.waiting_for_truck_receipt ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Awaiting Receipt</span>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => setSelected(s)}>View Details</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50" onClick={() => { setSelected(null); setSigning(false); }}>
          <div className="bg-background w-full md:max-w-2xl md:rounded-xl rounded-t-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 md:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Transfer Sheet {selected.transfer_sheet_number}</h2>
                <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setSigning(false); }}>Close</Button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Job:</span> {selected.job_number || '—'}</div>
                <div><span className="text-muted-foreground">Customer:</span> {selected.customer_name || '—'}</div>
                <div><span className="text-muted-foreground">Location:</span> {selected.location || '—'}</div>
                <div><span className="text-muted-foreground">Truck:</span> {selected.truck || '—'}</div>
                <div><span className="text-muted-foreground">Technician:</span> {selected.technician || '—'}</div>
                <div><span className="text-muted-foreground">ST Status:</span> {selected.status || '—'}</div>
                <div><span className="text-muted-foreground">Materials:</span> {selected.materials_count || 0}</div>
                <div><span className="text-muted-foreground">Total Qty:</span> {selected.total_quantity || 0}</div>
                <div><span className="text-muted-foreground">Total Cost:</span> ${selected.total_cost?.toFixed(2) || '0.00'}</div>
                <div><span className="text-muted-foreground">Pick Status:</span> <TransferSheetStatusBadge status={selected.warehouse_picked_status} /></div>
              </div>

              {/* Items */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Items (Read-Only)</h3>
                <div className="border rounded-lg overflow-hidden">
                  {(() => {
                    let items = []; try { items = JSON.parse(selected.items || '[]'); } catch {}
                    if (!items.length) return <p className="p-3 text-sm text-muted-foreground">No item details available.</p>;
                    return (
                      <table className="w-full text-xs">
                        <thead className="bg-muted"><tr><th className="text-left p-2">Item</th><th className="text-right p-2">Qty</th><th className="text-right p-2">Cost</th></tr></thead>
                        <tbody>
                          {items.map((item, i) => (
                            <tr key={i} className="border-t"><td className="p-2">{item.name || item.item_name || '—'}</td><td className="text-right p-2">{item.quantity || '—'}</td><td className="text-right p-2">${(item.cost || item.price || 0).toFixed(2)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>

              {/* Receipt Status */}
              {selected.technician_received ? (
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="p-4 flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-green-900">Materials received by technician</p>
                      <p className="text-xs text-green-700">Received at {selected.technician_received_at ? new Date(selected.technician_received_at).toLocaleString() : '—'}</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {!signing ? (
                    <Button onClick={() => setSigning(true)} disabled={!selected.waiting_for_truck_receipt && selected.warehouse_picked_status !== 'Picked'}>
                      <Signature className="h-4 w-4 mr-1" /> Confirm Receipt & Sign
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <div className="border rounded-lg p-2 bg-white">
                        <SignaturePad onSave={handleConfirmReceipt} disabled={confirming} />
                      </div>
                      <Button variant="outline" onClick={() => setSigning(false)}>Cancel</Button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Receipt confirmation is stored in LVC OS. Future: this will sync back to ServiceTitan via API.</p>
                </div>
              )}

              {selected.st_url && (
                <a href={selected.st_url} target="_blank" rel="noreferrer" className="block text-sm text-blue-600 hover:underline">Open in ServiceTitan →</a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}