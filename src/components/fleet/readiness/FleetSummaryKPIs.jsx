import StatCard from "./StatCard";
import { Truck, CheckCircle2, AlertTriangle, XCircle, Wrench, Users, UserX } from "lucide-react";

export default function FleetSummaryKPIs({ summary, onFilter }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
      <StatCard icon={Truck} label="Total Trucks" value={summary.totalTrucks} color="text-slate-700" bg="bg-slate-100" />
      <StatCard icon={CheckCircle2} label="Ready" value={summary.ready} color="text-green-600" bg="bg-green-100" onClick={() => onFilter("ready")} />
      <StatCard icon={AlertTriangle} label="Needs Attention" value={summary.needsAttention} color="text-amber-600" bg="bg-amber-100" onClick={() => onFilter("warning")} />
      <StatCard icon={XCircle} label="Blocked" value={summary.blocked} color="text-red-600" bg="bg-red-100" onClick={() => onFilter("blocked")} />
      <StatCard icon={Wrench} label="Out of Service" value={summary.outOfService} color="text-slate-600" bg="bg-slate-200" onClick={() => onFilter("out_of_service")} />
      <StatCard icon={Users} label="Shared Vehicles" value={summary.shared} color="text-blue-600" bg="bg-blue-100" onClick={() => onFilter("shared")} />
      <StatCard icon={UserX} label="Unassigned" value={summary.unassigned} color="text-purple-600" bg="bg-purple-100" onClick={() => onFilter("unassigned")} />
    </div>
  );
}