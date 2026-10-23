import StatCard from "./StatCard";
import { Package, AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";

export default function ConsumableReadinessPanel({ consumables, onFilter }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <StatCard icon={Package} label="Missing Required" value={consumables.missingRequired.length} color="text-red-600" bg="bg-red-100" onClick={() => onFilter("missing_consumables")} />
      <StatCard icon={AlertTriangle} label="Below Minimum" value={consumables.belowMinimum.length} color="text-amber-600" bg="bg-amber-100" onClick={() => onFilter("missing_consumables")} />
      <StatCard icon={CheckCircle2} label="Transfers Ready" value={consumables.transfersReady} color="text-green-600" bg="bg-green-100" />
      <StatCard icon={Clock} label="Transfers Waiting" value={consumables.transfersWaiting} color="text-amber-600" bg="bg-amber-100" onClick={() => onFilter("transfer_waiting")} />
      <StatCard icon={XCircle} label="Transfers Not Loaded" value={consumables.transfersNotLoaded} color="text-red-600" bg="bg-red-100" onClick={() => onFilter("transfer_waiting")} />
    </div>
  );
}