import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, AlertTriangle, CheckCircle2, Activity, Webhook, FileWarning, Truck, Play } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { EventStatusBadge } from "@/components/servicetitan/StatusBadges";
import { formatEventType, timeAgo } from "@/lib/servicetitanConstants";

export default function IntegrationDashboard() {
  const [events, setEvents] = useState([]);
  const [transferSheets, setTransferSheets] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [ev, ts, jb, po] = await Promise.all([
          base44.entities.IntegrationEvent.list('-created_date', 200),
          base44.entities.ServiceTitanTransferSheet.list('-last_synced_at', 200),
          base44.entities.ServiceTitanJob.list('-last_synced_at', 200),
          base44.entities.ServiceTitanPurchaseOrder.list('-last_synced_at', 200),
        ]);
        setEvents(ev); setTransferSheets(ts); setJobs(jb); setPos(po);
      } catch (e) { console.error(e); } finally { setLoading(false); }
    };
    load();
  }, []);

  const failedEvents = events.filter(e => e.status === 'Failed');
  const processedEvents = events.filter(e => e.status === 'Processed');
  const pendingReceipts = transferSheets.filter(t => t.waiting_for_truck_receipt && !t.technician_received);
  const todayEvents = events.filter(e => {
    const d = new Date(e.received_at); const now = new Date();
    return d.toDateString() === now.toDateString();
  });
  const successRate = events.length > 0 ? Math.round((processedEvents.length / events.length) * 100) : 0;

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  const stats = [
    { label: 'Total Events', value: events.length, icon: Activity, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Processed', value: processedEvents.length, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100' },
    { label: 'Failed Syncs', value: failedEvents.length, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-100' },
    { label: 'Success Rate', value: `${successRate}%`, icon: Activity, color: successRate >= 80 ? 'text-green-600' : 'text-amber-600', bg: successRate >= 80 ? 'bg-green-100' : 'bg-amber-100' },
  ];

  const syncStats = [
    { label: 'Transfer Sheets', value: transferSheets.length, path: '/servicetitan/transfer-sheets', pending: pendingReceipts.length },
    { label: 'Jobs', value: jobs.length, path: '/servicetitan/jobs' },
    { label: 'Purchase Orders', value: pos.length, path: '/servicetitan/purchase-orders' },
    { label: 'Pending Receipts', value: pendingReceipts.length, path: '/servicetitan/transfer-sheets' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">ServiceTitan Integration Hub</h1>
          <p className="text-muted-foreground text-sm">ServiceTitan is the system of record — LVC OS consumes, tracks, and acts on synced data</p>
        </div>
        <div className="flex gap-2">
          <Link to="/servicetitan/simulator"><Button variant="outline" size="sm"><Play className="h-4 w-4 mr-1" /> Simulator</Button></Link>
          <Link to="/servicetitan/webhook-inbox"><Button variant="outline" size="sm"><Webhook className="h-4 w-4 mr-1" /> Webhook Inbox</Button></Link>
          <Link to="/servicetitan/settings"><Button variant="outline" size="sm">Settings</Button></Link>
        </div>
      </div>

      {/* Critical Alerts */}
      {failedEvents.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">{failedEvents.length} failed sync(s) require attention</p>
              <p className="text-xs text-red-700">Review and retry or mark as ignored</p>
            </div>
            <Link to="/servicetitan/failed-syncs"><Button size="sm" variant="destructive">View Failed Syncs</Button></Link>
          </CardContent>
        </Card>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold mt-1">{s.value}</p>
                </div>
                <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sync Summary */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Synced Entities</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {syncStats.map(s => (
            <Link key={s.label} to={s.path}>
              <Card className="hover:shadow-md transition-shadow h-full">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold mt-1">{s.value}</p>
                  {s.pending > 0 && <p className="text-xs text-amber-600 mt-1">{s.pending} pending</p>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Events */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Recent Events</h2>
          <Link to="/servicetitan/event-log"><Button variant="ghost" size="sm">View All <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button></Link>
        </div>
        <div className="space-y-2">
          {events.slice(0, 6).map(e => (
            <Card key={e.id}>
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <EventStatusBadge status={e.status} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{formatEventType(e.event_type)}</p>
                    <p className="text-xs text-muted-foreground truncate">{e.parsed_summary || e.external_id}</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">{timeAgo(e.received_at)}</span>
              </CardContent>
            </Card>
          ))}
          {events.length === 0 && (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <Webhook className="h-10 w-10 mx-auto mb-2 opacity-40" />
              No events received yet. Configure your webhook endpoint in Settings.
            </CardContent></Card>
          )}
        </div>
      </div>

      {/* Pending Truck Receipts */}
      {pendingReceipts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Transfer Sheets Awaiting Technician Receipt</h2>
            <Link to="/servicetitan/transfer-sheets"><Button variant="ghost" size="sm">View All <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button></Link>
          </div>
          <div className="space-y-2">
            {pendingReceipts.slice(0, 4).map(ts => (
              <Link key={ts.id} to="/servicetitan/transfer-sheets">
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Truck className="h-5 w-5 text-amber-600" />
                      <div>
                        <p className="text-sm font-medium">TS {ts.transfer_sheet_number}</p>
                        <p className="text-xs text-muted-foreground">Truck {ts.truck} — {ts.job_number}</p>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Waiting Receipt</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}