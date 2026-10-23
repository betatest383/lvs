import { Badge } from "@/components/ui/badge";

const STATUS_COLORS = {
  Active: "bg-green-100 text-green-700",
  "Shared Pool": "bg-blue-100 text-blue-700",
  "Out of Service": "bg-red-100 text-red-700",
  Maintenance: "bg-amber-100 text-amber-700",
  Retired: "bg-slate-200 text-slate-600",
};

const ASSIGNMENT_COLORS = {
  Assigned: "bg-indigo-100 text-indigo-700",
  Available: "bg-green-100 text-green-700",
  "Checked Out": "bg-amber-100 text-amber-700",
  "In Use": "bg-blue-100 text-blue-700",
  Returned: "bg-slate-100 text-slate-600",
};

const VEHICLE_TYPE_COLORS = {
  "Lead Technician Vehicle": "bg-blue-100 text-blue-700",
  "Shared Vehicle": "bg-purple-100 text-purple-700",
  "Install Vehicle": "bg-teal-100 text-teal-700",
  "Service Vehicle": "bg-indigo-100 text-indigo-700",
  "Sales Vehicle": "bg-green-100 text-green-700",
  "Utility Vehicle": "bg-slate-100 text-slate-700",
};

export function TruckStatusBadge({ status }) {
  return (
    <Badge variant="secondary" className={`${STATUS_COLORS[status] || "bg-slate-100 text-slate-600"} border-0`}>
      {status || "—"}
    </Badge>
  );
}

export function AssignmentStatusBadge({ status }) {
  return (
    <Badge variant="secondary" className={`${ASSIGNMENT_COLORS[status] || "bg-slate-100 text-slate-600"} border-0`}>
      {status || "—"}
    </Badge>
  );
}

export function VehicleTypeBadge({ type }) {
  return (
    <Badge variant="secondary" className={`${VEHICLE_TYPE_COLORS[type] || "bg-slate-100 text-slate-600"} border-0`}>
      {type || "—"}
    </Badge>
  );
}