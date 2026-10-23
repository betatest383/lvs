import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Briefcase, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { SyncBadge } from "@/components/servicetitan/StatusBadges";

export default function JobSync() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const load = async () => {
    try {
      const data = await base44.entities.ServiceTitanJob.list('-last_synced_at', 200);
      setJobs(data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = jobs.filter(j => {
    const matchSearch = !search || (j.job_number || "").toLowerCase().includes(search.toLowerCase()) || (j.customer_name || "").toLowerCase().includes(search.toLowerCase()) || (j.location || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || j.job_status === filterStatus;
    return matchSearch && matchStatus;
  });

  const jobStatuses = [...new Set(jobs.map(j => j.job_status).filter(Boolean))].sort();

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Job Sync</h1>
        <p className="text-muted-foreground text-sm">ServiceTitan jobs synced to LVC OS — read-only display</p>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by job #, customer, or location..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="all">All Statuses</option>
          {jobStatuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Briefcase className="h-10 w-10 mx-auto mb-2 opacity-40" />
          No jobs synced yet.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(j => (
            <Card key={j.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0">
                      <Briefcase className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium">Job {j.job_number}</p>
                      <p className="text-sm text-muted-foreground">{j.customer_name}</p>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                        {j.location && <span>{j.location}</span>}
                        {j.business_unit && <span>BU: {j.business_unit}</span>}
                        {j.job_type && <span>Type: {j.job_type}</span>}
                        {j.assigned_technician && <span>Tech: {j.assigned_technician}</span>}
                        {j.assigned_truck && <span>Truck: {j.assigned_truck}</span>}
                      </div>
                      {j.appointment_date && <p className="text-xs mt-1">Appt: {new Date(j.appointment_date).toLocaleDateString()} {j.appointment_time || ''}</p>}
                      <div className="mt-2"><SyncBadge lastSynced={j.last_synced_at} /></div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {j.job_status && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{j.job_status}</span>}
                    {j.estimate_status && <span className="text-xs text-muted-foreground">Est: {j.estimate_status}</span>}
                    {j.invoice_status && <span className="text-xs text-muted-foreground">Inv: {j.invoice_status}</span>}
                    {j.st_url && <Button size="sm" variant="ghost" onClick={() => window.open(j.st_url, '_blank')}><ExternalLink className="h-3.5 w-3.5" /></Button>}
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