import StatCard from "./StatCard";
import { Calendar, AlertTriangle, ClipboardList, CheckCircle2, XCircle, ClipboardCheck } from "lucide-react";

export default function InspectionStatusCards({ inspection, onFilter }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
      <StatCard icon={Calendar} label="Due Today" value={inspection.dueToday} color="text-amber-600" bg="bg-amber-100" onClick={() => onFilter("inspection_due")} />
      <StatCard icon={AlertTriangle} label="Overdue" value={inspection.overdue} color="text-red-600" bg="bg-red-100" onClick={() => onFilter("inspection_overdue")} />
      <StatCard icon={ClipboardList} label="Not Inspected Today" value={inspection.notInspectedToday} color="text-slate-600" bg="bg-slate-100" onClick={() => onFilter("not_inspected")} />
      <StatCard icon={ClipboardCheck} label="Weekly Overdue" value={inspection.weeklyOverdue || 0} color="text-red-600" bg="bg-red-100" onClick={() => onFilter("weekly_overdue")} />
      <StatCard icon={CheckCircle2} label="Trucks Ready" value={inspection.ready} color="text-green-600" bg="bg-green-100" onClick={() => onFilter("ready")} />
      <StatCard icon={XCircle} label="Trucks Not Ready" value={inspection.notReady} color="text-red-600" bg="bg-red-100" onClick={() => onFilter("not_ready")} />
    </div>
  );
}