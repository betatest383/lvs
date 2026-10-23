import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ClipboardCheck, Truck, Wrench, Package, ArrowLeftRight,
  ShieldAlert, CheckCircle2, List, ClipboardList,
} from "lucide-react";

const ACTIONS = [
  { label: "Start Inspection", to: "/warehouse/morning-departure", icon: ClipboardCheck },
  { label: "View Truck", to: "/fleet/trucks", icon: Truck },
  { label: "Assign Equipment", to: "/equipment/assign", icon: Wrench },
  { label: "Load Consumables", to: "/consumables", icon: Package },
  { label: "Load Material Transfer", to: "/warehouse/transfer-sheets", icon: ArrowLeftRight },
  { label: "Report Defect", to: "/warehouse/morning-departure", icon: ShieldAlert },
  { label: "Resolve Defect", to: "/warehouse/manager-review", icon: CheckCircle2 },
  { label: "Mark Ready", to: "/warehouse/morning-departure", icon: CheckCircle2 },
  { label: "Truck Timeline", to: "/fleet/history", icon: List },
  { label: "Dispatch Checklist", to: "/warehouse/morning-departure", icon: ClipboardList },
];

export default function QuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      {ACTIONS.map(a => (
        <Button key={a.label} size="sm" variant="secondary" asChild>
          <Link to={a.to}>
            <a.icon className="w-3.5 h-3.5" />
            {a.label}
          </Link>
        </Button>
      ))}
    </div>
  );
}