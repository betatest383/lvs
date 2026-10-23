import { User, Cpu } from 'lucide-react';
import { resolvePerformedBy } from '@/lib/auditUtils';

/**
 * Displays who performed a transaction.
 * - User actions: Employee Name, Role, Department
 * - Automated: "System Automation" + trigger source
 * Developer Mode exposes the raw service account identifier.
 */
export default function PerformedByBadge({ txn, employeeMap, developerMode }) {
  const performedBy = resolvePerformedBy(txn, employeeMap);

  return (
    <div className="flex items-center gap-1.5">
      {performedBy.isAutomated ? (
        <Cpu className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
      ) : (
        <User className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
      )}
      <div className="min-w-0">
        <span className="text-xs font-medium">{performedBy.display}</span>
        {performedBy.subtitle && (
          <span className="text-xs text-muted-foreground"> · {performedBy.subtitle}</span>
        )}
      </div>
      {developerMode && performedBy.rawValue && performedBy.rawValue !== performedBy.display && (
        <span className="text-xs font-mono text-muted-foreground truncate">[{performedBy.rawValue}]</span>
      )}
    </div>
  );
}