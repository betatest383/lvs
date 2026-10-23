import { Truck, Wrench, CheckCircle2, AlertTriangle, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFleetData } from "@/hooks/useFleetData";
import { TruckStatusBadge, AssignmentStatusBadge, VehicleTypeBadge } from "@/components/fleet/TruckBadges";
import FleetResourceRequests from "@/components/fleet/FleetResourceRequests";

export default function FleetDashboard() {
  const { trucks, assignments, loading } = useFleetData();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  const activeTrucks = trucks.filter(t => t.status === "Active");
  const sharedPool = trucks.filter(t => t.status === "Shared Pool" || t.vehicle_type === "Shared Vehicle");
  const inMaintenance = trucks.filter(t => t.status === "Maintenance");
  const checkedOut = trucks.filter(t => t.current_assignment_status === "Checked Out");
  const availableShared = sharedPool.filter(t => t.current_assignment_status === "Available");
  const overdueAssignments = assignments.filter(a => a.status === "Overdue");

  const stats = [
    { label: "Total Vehicles", value: trucks.length, icon: Truck, color: "bg-blue-100 text-blue-600" },
    { label: "Active", value: activeTrucks.length, icon: CheckCircle2, color: "bg-green-100 text-green-600" },
    { label: "Shared Pool", value: sharedPool.length, icon: Truck, color: "bg-purple-100 text-purple-600" },
    { label: "In Maintenance", value: inMaintenance.length, icon: Wrench, color: "bg-amber-100 text-amber-600" },
    { label: "Checked Out", value: checkedOut.length, icon: AlertTriangle, color: "bg-indigo-100 text-indigo-600" },
    { label: "Available Shared", value: availableShared.length, icon: CheckCircle2, color: "bg-teal-100 text-teal-600" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Fleet Dashboard</h1>
          <p className="text-muted-foreground text-sm">Central vehicle records for all warehouse and field operations</p>
        </div>
        <div className="flex gap-2">
          <Link to="/fleet/shared-checkout">
            <Button><Plus className="h-4 w-4 mr-1" /> Checkout Shared Vehicle</Button>
          </Link>
          <Link to="/fleet/trucks">
            <Button variant="outline">View All Trucks</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${s.color}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Available Shared Vehicles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {availableShared.length === 0 && <p className="text-sm text-muted-foreground">No shared vehicles available.</p>}
            {availableShared.map(truck => (
              <Link key={truck.id} to={`/fleet/trucks/${truck.id}`} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent">
                <div>
                  <p className="font-medium">Truck {truck.truck_number}</p>
                  <p className="text-xs text-muted-foreground">{truck.vehicle_name || truck.make} {truck.model}</p>
                </div>
                <div className="flex items-center gap-2">
                  <VehicleTypeBadge type={truck.vehicle_type} />
                  <AssignmentStatusBadge status={truck.current_assignment_status} />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Overdue & Checked Out</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {checkedOut.length === 0 && overdueAssignments.length === 0 && <p className="text-sm text-muted-foreground">No active checkouts.</p>}
            {checkedOut.map(truck => (
              <Link key={truck.id} to={`/fleet/trucks/${truck.id}`} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent">
                <div>
                  <p className="font-medium">Truck {truck.truck_number}</p>
                  <p className="text-xs text-muted-foreground">Driver: {truck.current_driver || "—"}</p>
                </div>
                <AssignmentStatusBadge status={truck.current_assignment_status} />
              </Link>
            ))}
            {overdueAssignments.map(a => (
              <Link key={a.id} to={`/fleet/assignments`} className="flex items-center justify-between p-3 rounded-lg border border-red-200 hover:bg-accent">
                <div>
                  <p className="font-medium">Truck {a.truck_number}</p>
                  <p className="text-xs text-muted-foreground">Assigned to {a.assigned_to}</p>
                </div>
                <TruckStatusBadge status={a.status} />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <FleetResourceRequests />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link to="/fleet/trucks"><Button variant="outline" className="w-full">Truck Profiles</Button></Link>
        <Link to="/fleet/assignments"><Button variant="outline" className="w-full">Vehicle Assignments</Button></Link>
        <Link to="/fleet/readiness"><Button variant="outline" className="w-full">Truck Readiness</Button></Link>
        <Link to="/fleet/history"><Button variant="outline" className="w-full">Truck History</Button></Link>
      </div>
    </div>
  );
}