import StatCard from "./StatCard";
import { PackageX, Wrench, Shield, Flame, Briefcase } from "lucide-react";

export default function EquipmentReadinessPanel({ equipment, onFilter }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <StatCard icon={PackageX} label="Missing Packages" value={equipment.missingPackages.length} color="text-amber-600" bg="bg-amber-100" onClick={() => onFilter("missing_package")} />
      <StatCard icon={Wrench} label="Missing Required" value={equipment.missingRequired.length} color="text-red-600" bg="bg-red-100" onClick={() => onFilter("missing_equipment")} />
      <StatCard icon={Shield} label="Missing Safety" value={equipment.missingSafety.length} color="text-red-600" bg="bg-red-100" onClick={() => onFilter("missing_safety")} />
      <StatCard icon={Flame} label="Missing Fire Ext." value={equipment.missingFireExtinguisher.length} color="text-red-600" bg="bg-red-100" onClick={() => onFilter("missing_fire")} />
      <StatCard icon={Briefcase} label="Missing First Aid" value={equipment.missingFirstAid.length} color="text-red-600" bg="bg-red-100" onClick={() => onFilter("missing_firstaid")} />
    </div>
  );
}