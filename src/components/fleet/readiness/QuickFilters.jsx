import { Button } from "@/components/ui/button";
import {
  CheckCircle2, AlertTriangle, XCircle, Wrench, Users, UserX,
  Calendar, ClipboardList, Package, Clock, Briefcase, ClipboardCheck,
} from "lucide-react";

const FILTERS = [
  { key: "ready", label: "Ready", icon: CheckCircle2 },
  { key: "warning", label: "Ready w/ Warnings", icon: AlertTriangle },
  { key: "blocked", label: "Blocked", icon: XCircle },
  { key: "out_of_service", label: "Out of Service", icon: Wrench },
  { key: "shared", label: "Shared", icon: Users },
  { key: "unassigned", label: "Unassigned", icon: UserX },
  { key: "inspection_due", label: "Inspection Due", icon: Calendar },
  { key: "inspection_overdue", label: "Inspection Overdue", icon: AlertTriangle },
  { key: "weekly_overdue", label: "Weekly Overdue", icon: ClipboardCheck },
  { key: "not_inspected", label: "Not Inspected Today", icon: ClipboardList },
  { key: "missing_equipment", label: "Missing Equipment", icon: Package },
  { key: "missing_consumables", label: "Missing Consumables", icon: Package },
  { key: "transfer_waiting", label: "Transfer Waiting", icon: Clock },
  { key: "blocked_jobs", label: "Blocked Jobs", icon: Briefcase },
];

export default function QuickFilters({ activeFilter, onFilter }) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTERS.map(f => (
        <Button
          key={f.key}
          size="sm"
          variant={activeFilter === f.key ? "default" : "outline"}
          onClick={() => onFilter(activeFilter === f.key ? null : f.key)}
          className="text-xs"
        >
          <f.icon className="w-3.5 h-3.5" />
          {f.label}
        </Button>
      ))}
      {activeFilter && (
        <Button size="sm" variant="ghost" onClick={() => onFilter(null)} className="text-xs">
          Clear
        </Button>
      )}
    </div>
  );
}