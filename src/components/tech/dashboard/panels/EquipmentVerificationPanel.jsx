import { CheckCircle2, Circle, AlertTriangle, Wrench, PackageCheck } from 'lucide-react';

export default function EquipmentVerificationPanel({
  data, workflowChecks,
}) {
  if (!data) return null;
  const { standardEquipment = [], todaysSpecialEquipment = [], standardAllPresent, specialAllPresent } = data;

  const standardEmpty = standardEquipment.length === 0;
  const specialEmpty = todaysSpecialEquipment.length === 0;

  if (standardEmpty && specialEmpty) {
    return (
      <div className="flex items-center gap-1.5 p-2 rounded-lg bg-muted/40 text-xs text-muted-foreground">
        <Wrench className="w-3.5 h-3.5" /> No equipment assigned for verification.
      </div>
    );
  }

  const ItemRow = ({ item, type }) => {
    const key = `equip_verified_${type}_${item.id || item.equipment_id}`;
    const verified = workflowChecks[key]?.status === 'complete';
    const isMissing = ['missing', 'damaged', 'out_for_repair'].includes(item.status);
    return (
      <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-white/60">
        <div className="flex items-center gap-1.5 min-w-0">
          {verified || (!isMissing && item.assigned_employee_email)
            ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
            : isMissing
              ? <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
              : <Circle className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />}
          <span className={`truncate ${verified ? 'text-muted-foreground line-through' : ''}`}>
            {item.item_name}
          </span>
          {item.serial_number && (
            <span className="text-muted-foreground font-mono text-[10px]">{item.serial_number}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isMissing && <span className="text-red-600 font-medium text-[10px]">{item.status}</span>}
          {!isMissing && item.condition && (
            <span className="text-muted-foreground text-[10px]">{item.condition}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {/* Standard Equipment Package */}
      <div className="rounded-lg bg-green-50 border border-green-200 p-2 space-y-1 text-xs">
        <p className="font-semibold text-green-800 flex items-center gap-1">
          <PackageCheck className="w-3.5 h-3.5" /> Standard Equipment Package
        </p>
        {standardEmpty ? (
          <p className="text-muted-foreground">No standard package assigned.</p>
        ) : (
          <>
            {standardEquipment.map(item => (
              <ItemRow key={item.id} item={item} type="standard" />
            ))}
            {standardAllPresent && (
              <p className="flex items-center gap-1 text-green-700 font-medium pt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> All standard equipment present.
              </p>
            )}
          </>
        )}
      </div>

      {/* Today's Special Equipment */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-2 space-y-1 text-xs">
        <p className="font-semibold text-blue-800 flex items-center gap-1">
          <Wrench className="w-3.5 h-3.5" /> Today's Special Equipment
        </p>
        {specialEmpty ? (
          <p className="text-muted-foreground">No special equipment required for today's jobs.</p>
        ) : (
          <>
            {todaysSpecialEquipment.map(item => (
              <ItemRow key={item.id} item={item} type="special" />
            ))}
            {specialAllPresent && (
              <p className="flex items-center gap-1 text-blue-700 font-medium pt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> All special equipment present.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}