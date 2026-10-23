import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { List, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { TruckStatusBadge } from "@/components/fleet/TruckBadges";

const ASSIGNMENT_TYPE_COLORS = {
  Permanent: "bg-blue-100 text-blue-700",
  Temporary: "bg-amber-100 text-amber-700",
  "Shared Vehicle Checkout": "bg-purple-100 text-purple-700",
};

export default function VehicleAssignments() {
  const [assignments, setAssignments] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const load = async () => {
    try {
      const [a, t] = await Promise.all([
        base44.entities.VehicleAssignment.list('-created_date', 200),
        base44.entities.TruckProfile.list('-updated_date', 200),
      ]);
      setAssignments(a);
      setTrucks(t);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = assignments.filter(a => {
    const matchSearch = !search ||
      (a.truck_number || "").toLowerCase().includes(search.toLowerCase()) ||
      (a.assigned_to || "").toLowerCase().includes(search.toLowerCase()) ||
      (a.job_number || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || a.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Vehicle Assignments</h1>
          <p className="text-muted-foreground text-sm">Track permanent and temporary vehicle assignments</p>
        </div>
        <Link to="/fleet/shared-checkout"><Button>Shared Vehicle Checkout</Button></Link>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by truck, person, or job..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="all">All Statuses</option>
          <option>Active</option>
          <option>Returned</option>
          <option>Overdue</option>
          <option>Cancelled</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <List className="h-10 w-10 mx-auto mb-2 opacity-40" />
          No vehicle assignments found.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(a => (
            <Card key={a.id}>
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                      {a.truck_number || "?"}
                    </div>
                    <div>
                      <p className="font-medium">Truck {a.truck_number}</p>
                      <p className="text-xs text-muted-foreground">{a.vehicle_name || ""}</p>
                    </div>
                  </div>
                  <div className="text-sm space-y-1">
                    <p><span className="text-muted-foreground">Assigned to:</span> {a.assigned_to}</p>
                    <p><span className="text-muted-foreground">Type:</span> <span className={`px-2 py-0.5 rounded text-xs ${ASSIGNMENT_TYPE_COLORS[a.assignment_type] || "bg-slate-100"}`}>{a.assignment_type}</span></p>
                    {a.job_number && <p className="text-xs text-muted-foreground">Job: {a.job_number}</p>}
                  </div>
                  <div className="text-sm space-y-1">
                    {a.start_datetime && <p className="text-xs"><span className="text-muted-foreground">Start:</span> {new Date(a.start_datetime).toLocaleString()}</p>}
                    {a.expected_return_datetime && <p className="text-xs"><span className="text-muted-foreground">Return by:</span> {new Date(a.expected_return_datetime).toLocaleString()}</p>}
                    {a.actual_return_datetime && <p className="text-xs"><span className="text-muted-foreground">Returned:</span> {new Date(a.actual_return_datetime).toLocaleString()}</p>}
                  </div>
                  <TruckStatusBadge status={a.status} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}