import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Truck } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function TruckHistory() {
  const [assignments, setAssignments] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTruck, setFilterTruck] = useState("all");

  useEffect(() => {
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
    load();
  }, []);

  const filtered = filterTruck === "all" ? assignments : assignments.filter(a => a.truck_number === filterTruck);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Truck History</h1>
        <p className="text-muted-foreground text-sm">Chronological log of vehicle assignments, checkouts, and returns</p>
      </div>

      <div className="flex gap-3">
        <select value={filterTruck} onChange={(e) => setFilterTruck(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="all">All Trucks</option>
          {trucks.map(t => <option key={t.id} value={t.truck_number}>Truck {t.truck_number}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Clock className="h-10 w-10 mx-auto mb-2 opacity-40" />
          No history records found.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(a => (
            <Card key={a.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <Truck className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <Link to={`/fleet/trucks/${a.truck_id}`} className="font-medium hover:underline">Truck {a.truck_number}</Link>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        a.status === "Active" ? "bg-blue-100 text-blue-700" :
                        a.status === "Returned" ? "bg-green-100 text-green-700" :
                        a.status === "Overdue" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
                      }`}>{a.status}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{a.assigned_to} — {a.assignment_type}</p>
                    {a.job_number && <p className="text-xs text-muted-foreground">Job: {a.job_number}</p>}
                    <div className="flex flex-wrap gap-4 mt-1 text-xs text-muted-foreground">
                      {a.start_datetime && <span>Start: {new Date(a.start_datetime).toLocaleString()}</span>}
                      {a.expected_return_datetime && <span>Expected return: {new Date(a.expected_return_datetime).toLocaleString()}</span>}
                      {a.actual_return_datetime && <span>Returned: {new Date(a.actual_return_datetime).toLocaleString()}</span>}
                    </div>
                    {a.checkout_condition && <p className="text-xs mt-1"><span className="text-muted-foreground">Checkout:</span> {a.checkout_condition}</p>}
                    {a.return_condition && <p className="text-xs"><span className="text-muted-foreground">Return:</span> {a.return_condition}</p>}
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