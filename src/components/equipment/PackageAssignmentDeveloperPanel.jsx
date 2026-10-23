import { useState } from 'react';
import { ChevronDown, ChevronRight, Bug } from 'lucide-react';

/**
 * Developer Panel showing equipment package assignment metadata.
 *
 * Shows:
 *   - Truck Assignment Source
 *   - Equipment Package ID
 *   - Equipment Package Name
 *   - Assignment Timestamp
 *   - Assignment Created By
 *   - Assignment Lookup Status
 */
export default function PackageAssignmentDeveloperPanel({ pkg, trucks = [] }) {
  const [expanded, setExpanded] = useState(false);

  if (!pkg) return null;

  const assignedTruck = pkg.assigned_truck_id
    ? trucks.find(t => t.id === pkg.assigned_truck_id)
    : null;

  const lookupStatus = !pkg.assigned_truck_id
    ? 'No assignment'
    : assignedTruck
      ? 'Resolved'
      : 'Orphaned (truck not found)';

  const fields = [
    ['Truck Assignment Source', pkg.assigned_truck_id ? `Truck ${pkg.assigned_truck_number || assignedTruck?.truck_number || '—'}` : 'Unassigned'],
    ['Equipment Package ID', pkg.package_id || pkg.id || '—'],
    ['Equipment Package Name', pkg.package_name || '—'],
    ['Assignment Timestamp', pkg.assignment_timestamp
      ? new Date(pkg.assignment_timestamp).toLocaleString()
      : '—'],
    ['Assignment Created By', pkg.assigned_by || '—'],
    ['Assignment Lookup Status', lookupStatus],
  ];

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded
          ? <ChevronDown className="w-3 h-3" />
          : <ChevronRight className="w-3 h-3" />}
        <Bug className="w-3 h-3" />
        Developer Panel
      </button>
      {expanded && (
        <div className="mt-2 p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
          {fields.map(([label, value]) => (
            <div key={label} className="flex justify-between text-xs gap-2">
              <span className="text-muted-foreground shrink-0">{label}</span>
              <span className="font-mono font-medium text-right truncate">{String(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}