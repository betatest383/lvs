import StatCard from "./StatCard";
import { ShieldAlert, AlertOctagon, Wrench, CheckCircle2 } from "lucide-react";

export default function DefectsPanel({ defects }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard icon={ShieldAlert} label="Open Defects" value={defects.openDefects} color="text-amber-600" bg="bg-amber-100" />
      <StatCard icon={AlertOctagon} label="Critical Defects" value={defects.criticalDefects} color="text-red-600" bg="bg-red-100" />
      <StatCard icon={Wrench} label="Repairs In Progress" value={defects.repairsInProgress} color="text-blue-600" bg="bg-blue-100" />
      <StatCard icon={CheckCircle2} label="Repairs Done Today" value={defects.repairsCompletedToday} color="text-green-600" bg="bg-green-100" />
    </div>
  );
}