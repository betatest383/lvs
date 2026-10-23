import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Truck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { TruckStatusBadge, AssignmentStatusBadge, VehicleTypeBadge } from "@/components/fleet/TruckBadges";
import { TruckFormDialog } from "@/components/fleet/TruckFormDialog";

export default function TruckProfiles() {
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingTruck, setEditingTruck] = useState(null);

  const loadTrucks = async () => {
    try {
      const data = await base44.entities.TruckProfile.list('-updated_date', 200);
      setTrucks(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTrucks(); }, []);

  const filtered = trucks.filter(t => {
    const matchSearch = !search ||
      (t.truck_number || "").toLowerCase().includes(search.toLowerCase()) ||
      (t.vehicle_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (t.assigned_lead_technician || "").toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || t.vehicle_type === filterType;
    const matchStatus = filterStatus === "all" || t.status === filterStatus;
    return matchSearch && matchType && matchStatus;
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Truck Profiles</h1>
          <p className="text-muted-foreground text-sm">Central asset records for all fleet vehicles</p>
        </div>
        <Button onClick={() => { setEditingTruck(null); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-1" /> New Truck Profile
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by truck number, name, or technician..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="all">All Types</option>
          <option>Lead Technician Vehicle</option>
          <option>Shared Vehicle</option>
          <option>Install Vehicle</option>
          <option>Service Vehicle</option>
          <option>Sales Vehicle</option>
          <option>Utility Vehicle</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="all">All Statuses</option>
          <option>Active</option>
          <option>Shared Pool</option>
          <option>Out of Service</option>
          <option>Maintenance</option>
          <option>Retired</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Truck className="h-10 w-10 mx-auto mb-2 opacity-40" />
          No truck profiles found.
        </CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(truck => (
            <Link key={truck.id} to={`/fleet/trucks/${truck.id}`}>
              <Card className="hover:shadow-md transition-shadow h-full">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                        <Truck className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-bold">Truck {truck.truck_number}</p>
                        <p className="text-xs text-muted-foreground">{truck.vehicle_name || [truck.year, truck.make, truck.model].filter(Boolean).join(" ") || "—"}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <TruckStatusBadge status={truck.status} />
                    <VehicleTypeBadge type={truck.vehicle_type} />
                    <AssignmentStatusBadge status={truck.current_assignment_status} />
                  </div>
                  <div className="text-xs space-y-1">
                    {truck.assigned_lead_technician && <p><span className="text-muted-foreground">Lead Tech:</span> {truck.assigned_lead_technician}</p>}
                    {truck.license_plate && <p><span className="text-muted-foreground">Plate:</span> {truck.license_plate}</p>}
                    {truck.current_driver && <p><span className="text-muted-foreground">Driver:</span> {truck.current_driver}</p>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <TruckFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        truck={editingTruck}
        onSaved={loadTrucks}
      />
    </div>
  );
}