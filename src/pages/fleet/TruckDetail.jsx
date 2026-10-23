import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Truck, ArrowLeft, Pencil, Wrench } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { base44 } from "@/api/base44Client";
import { TruckStatusBadge, AssignmentStatusBadge, VehicleTypeBadge } from "@/components/fleet/TruckBadges";
import { TruckFormDialog } from "@/components/fleet/TruckFormDialog";
import { TruckOverviewTab } from "@/components/fleet/tabs/TruckOverviewTab";
import { TruckCrewTab } from "@/components/fleet/tabs/TruckCrewTab";
import { TruckConsumablesTab } from "@/components/fleet/tabs/TruckConsumablesTab";
import { TruckEquipmentTab } from "@/components/fleet/tabs/TruckEquipmentTab";
import { TruckReadinessTab } from "@/components/fleet/tabs/TruckReadinessTab";
import { TruckHistoryTab } from "@/components/fleet/tabs/TruckHistoryTab";
import { TruckReturnsTab } from "@/components/fleet/tabs/TruckReturnsTab";

export default function TruckDetail() {
  const { id } = useParams();
  const [truck, setTruck] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const load = async () => {
    try {
      const data = await base44.entities.TruckProfile.get(id);
      setTruck(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;
  }

  if (!truck) {
    return (
      <div className="p-6 text-center">
        <Truck className="h-10 w-10 mx-auto mb-2 opacity-40" />
        <p className="text-muted-foreground mb-4">Truck profile not found.</p>
        <Link to="/fleet/trucks"><Button variant="outline">Back to Truck Profiles</Button></Link>
      </div>
    );
  }

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "crew", label: "Assigned Crew" },
    { key: "consumables", label: "Consumables" },
    { key: "servicetitan", label: "ServiceTitan Materials" },
    { key: "equipment", label: "Equipment" },
    { key: "maintenance", label: "Maintenance" },
    { key: "damage", label: "Damage Reports" },
    { key: "readiness", label: "Readiness" },
    { key: "returns", label: "Returns" },
    { key: "history", label: "History" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/fleet/trucks"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Truck {truck.truck_number}</h1>
              <p className="text-sm text-muted-foreground">{truck.vehicle_name || [truck.year, truck.make, truck.model].filter(Boolean).join(" ")}</p>
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={() => setShowForm(true)}><Pencil className="h-4 w-4 mr-1" /> Edit</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <TruckStatusBadge status={truck.status} />
        <VehicleTypeBadge type={truck.vehicle_type} />
        <AssignmentStatusBadge status={truck.current_assignment_status} />
        {truck.servicetitan_truck_id && <span className="text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-600">ST ID: {truck.servicetitan_truck_id}</span>}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto">
          <TabsList className="inline-flex">
            {tabs.map(t => (
              <TabsTrigger key={t.key} value={t.key} className="whitespace-nowrap">{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview"><TruckOverviewTab truck={truck} onReload={load} /></TabsContent>
        <TabsContent value="crew"><TruckCrewTab truck={truck} /></TabsContent>
        <TabsContent value="consumables"><TruckConsumablesTab truck={truck} /></TabsContent>
        <TabsContent value="servicetitan">
          <Card>
            <CardHeader><CardTitle className="text-base">ServiceTitan Materials</CardTitle></CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Wrench className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">ServiceTitan truck ID: {truck.servicetitan_truck_id || "Not configured"}</p>
                <p className="text-xs text-muted-foreground mt-1">Materials list will be populated from ServiceTitan integration.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="equipment"><TruckEquipmentTab truck={truck} /></TabsContent>
        <TabsContent value="maintenance">
          <Card>
            <CardHeader><CardTitle className="text-base">Maintenance Records</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Last Maintenance:</span><span>{truck.last_maintenance_date || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Next Maintenance:</span><span>{truck.next_maintenance_date || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Mileage:</span><span>{truck.mileage ? `${truck.mileage.toLocaleString()} mi` : "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status:</span><TruckStatusBadge status={truck.status} /></div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="damage">
          <Card>
            <CardHeader><CardTitle className="text-base">Damage Reports</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center py-8">No damage reports recorded. Damage reports are captured during vehicle checkout and return in Shared Vehicle Checkout.</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="readiness"><TruckReadinessTab truck={truck} /></TabsContent>
        <TabsContent value="returns"><TruckReturnsTab truck={truck} /></TabsContent>
        <TabsContent value="history"><TruckHistoryTab truck={truck} /></TabsContent>
      </Tabs>

      <TruckFormDialog open={showForm} onOpenChange={setShowForm} truck={truck} onSaved={load} />
    </div>
  );
}