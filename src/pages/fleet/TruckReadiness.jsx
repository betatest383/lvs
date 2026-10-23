import { useState, useMemo, useRef } from "react";
import { useFleetReadinessData } from "@/hooks/useFleetReadinessData";
import { useAuth } from "@/lib/AuthContext";
import DispatchReadinessHero from "@/components/fleet/readiness/DispatchReadinessHero";
import FleetSummaryKPIs from "@/components/fleet/readiness/FleetSummaryKPIs";
import FleetHealthScore from "@/components/fleet/readiness/FleetHealthScore";
import InspectionStatusCards from "@/components/fleet/readiness/InspectionStatusCards";
import EquipmentReadinessPanel from "@/components/fleet/readiness/EquipmentReadinessPanel";
import ConsumableReadinessPanel from "@/components/fleet/readiness/ConsumableReadinessPanel";
import DefectsPanel from "@/components/fleet/readiness/DefectsPanel";
import JobReadinessPanel from "@/components/fleet/readiness/JobReadinessPanel";
import AlertsPanel from "@/components/fleet/readiness/AlertsPanel";
import TruckDispatchList from "@/components/fleet/readiness/TruckDispatchList";
import QuickFilters from "@/components/fleet/readiness/QuickFilters";
import QuickActions from "@/components/fleet/readiness/QuickActions";
import DeveloperDebugPanel from "@/components/fleet/readiness/DeveloperDebugPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Truck, RefreshCw } from "lucide-react";

export default function TruckReadiness() {
  const { loading, error, readiness, stats } = useFleetReadinessData();
  const { user } = useAuth();
  const [activeFilter, setActiveFilter] = useState(null);
  const truckListRef = useRef(null);
  const jobPanelRef = useRef(null);

  const filteredTrucks = useMemo(() => {
    if (!readiness || !activeFilter) return readiness ? readiness.truckData : [];
    const r = readiness;
    switch (activeFilter) {
      case "ready": return r.truckData.filter(t => t.dispatchStatus === "ready");
      case "warning": return r.truckData.filter(t => t.dispatchStatus === "warning");
      case "blocked": return r.truckData.filter(t => t.dispatchStatus === "blocked");
      case "out_of_service": return r.truckData.filter(t => t.truck.status === "Out of Service" || t.truck.status === "Maintenance");
      case "shared": return r.truckData.filter(t => t.isShared);
      case "unassigned": return r.truckData.filter(t => !t.isShared && !t.assignedTech);
      case "inspection_due": return r.inspection.dueTodayTrucks;
      case "inspection_overdue": return r.inspection.overdueTrucks;
      case "weekly_overdue": return r.inspection.weeklyOverdueTrucks || [];
      case "not_inspected": return r.inspection.notInspectedTodayTrucks;
      case "not_ready": return r.truckData.filter(t => t.dispatchStatus !== "ready");
      case "missing_equipment": return r.equipmentReadiness.missingRequired;
      case "missing_package": return r.equipmentReadiness.missingPackages;
      case "missing_safety": return r.equipmentReadiness.missingSafety;
      case "missing_fire": return r.equipmentReadiness.missingFireExtinguisher;
      case "missing_firstaid": return r.equipmentReadiness.missingFirstAid;
      case "missing_consumables": return r.consumableReadiness.missingRequired;
      case "transfer_waiting": return r.truckData.filter(t => t.pendingTransfers.length > 0);
      default: return r.truckData;
    }
  }, [readiness, activeFilter]);

  const handleFilter = (filter) => {
    if (filter === "blocked_jobs") {
      jobPanelRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setActiveFilter(filter);
    setTimeout(() => truckListRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6 text-center">
            <p className="font-medium text-red-800">Failed to load Fleet Readiness</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
            <Button className="mt-4" variant="outline" onClick={() => window.location.reload()}>
              <RefreshCw className="w-4 h-4" /> Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!readiness || readiness.summary.totalTrucks === 0) {
    return (
      <div className="p-6">
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Truck className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="font-medium">No vehicles found</p>
            <p className="text-sm text-muted-foreground mt-1">Add truck profiles to see fleet readiness.</p>
            <Button className="mt-4" asChild>
              <a href="/fleet/trucks">Go to Truck Profiles</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isAdmin = user?.role === "admin";

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Fleet Readiness</h1>
        <p className="text-muted-foreground text-sm">
          Warehouse Manager's Dispatch Readiness Command Center — {readiness.todayStr}
        </p>
      </div>

      {/* Primary KPI: Dispatch Readiness */}
      <DispatchReadinessHero readiness={readiness} />

      {/* Fleet Summary KPIs */}
      <div>
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-2">Fleet Summary</h2>
        <FleetSummaryKPIs summary={readiness.summary} onFilter={handleFilter} />
      </div>

      {/* Fleet Health Score */}
      <FleetHealthScore fleetHealth={readiness.fleetHealth} />

      {/* Quick Actions */}
      <div>
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-2">Quick Actions</h2>
        <QuickActions />
      </div>

      {/* Alerts Panel */}
      <AlertsPanel alerts={readiness.alerts} />

      {/* Inspection Status */}
      <div>
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-2">Inspection Status</h2>
        <InspectionStatusCards inspection={readiness.inspection} onFilter={handleFilter} />
      </div>

      {/* Equipment Readiness */}
      <div>
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-2">Equipment Readiness</h2>
        <EquipmentReadinessPanel equipment={readiness.equipmentReadiness} onFilter={handleFilter} />
      </div>

      {/* Consumable Readiness */}
      <div>
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-2">Consumable & Material Transfer Readiness</h2>
        <ConsumableReadinessPanel consumables={readiness.consumableReadiness} onFilter={handleFilter} />
      </div>

      {/* Defects */}
      <div>
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-2">Defects</h2>
        <DefectsPanel defects={readiness.defects} />
      </div>

      {/* Quick Filters */}
      <div ref={truckListRef}>
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-2">Truck Dispatch Status</h2>
        <QuickFilters activeFilter={activeFilter} onFilter={handleFilter} />
      </div>

      {/* Truck List (filtered) */}
      <TruckDispatchList trucks={filteredTrucks} />

      {/* Job Readiness */}
      <div ref={jobPanelRef}>
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-2">Job Readiness</h2>
        <JobReadinessPanel jobs={readiness.jobs} />
      </div>

      {/* Developer Mode */}
      {isAdmin && <DeveloperDebugPanel stats={stats} readiness={readiness} />}
    </div>
  );
}