import { Link } from 'react-router-dom';
import { parseQtySnapshot, getTimelineEventMeta } from '@/lib/inventoryTimelineConstants';
import { resolvePerformedBy, deriveSourceModule, buildReasonContext } from '@/lib/auditUtils';

/**
 * Transaction table for Replay Inventory State with enterprise audit columns:
 * Time, Transaction Type, Inventory Item, Job #, Customer, Material Transfer #,
 * Technician, Truck, Qty Before, Qty After, Performed By, Source Module, Reason, Status.
 * Every relationship is clickable.
 */
export default function ReplayTransactionTable({ transactions, item, employeeMap, jobs = [], transferSheets = [], developerMode = false }) {
  const jobMap = {};
  for (const j of jobs) {
    if (j.id) jobMap[j.id] = j;
    if (j.crm_job_number) jobMap[j.crm_job_number] = j;
  }
  const transferMap = {};
  for (const t of transferSheets) {
    if (t.transfer_id) transferMap[t.transfer_id] = t;
  }

  const resolveCustomer = (txn) => {
    const refId = txn.related_request_id || txn.audit_reference;
    if (refId && transferMap[refId]) return transferMap[refId].customer_name;
    if (txn.related_job && jobMap[txn.related_job]) return jobMap[txn.related_job].customer_name;
    return '—';
  };

  const resolveJobNumber = (txn) => {
    if (txn.related_job && jobMap[txn.related_job]) return jobMap[txn.related_job].crm_job_number || txn.related_job;
    return txn.related_job || '—';
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm whitespace-nowrap">
        <thead className="border-b bg-muted/30">
          <tr className="text-left text-xs text-muted-foreground">
            <th className="p-2 font-medium">Time</th>
            <th className="p-2 font-medium">Type</th>
            <th className="p-2 font-medium">Job #</th>
            <th className="p-2 font-medium">Customer</th>
            <th className="p-2 font-medium">Material Transfer #</th>
            <th className="p-2 font-medium">Technician</th>
            <th className="p-2 font-medium">Truck</th>
            <th className="p-2 font-medium text-right">Qty Before</th>
            <th className="p-2 font-medium text-right">Qty After</th>
            <th className="p-2 font-medium">Performed By</th>
            <th className="p-2 font-medium">Source Module</th>
            <th className="p-2 font-medium">Reason</th>
            <th className="p-2 font-medium">Status</th>
            {developerMode && <th className="p-2 font-medium">Record ID</th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {transactions.map(t => {
            const meta = getTimelineEventMeta(t.transaction_type);
            const Icon = meta.icon;
            const before = parseQtySnapshot(t.quantity_before);
            const after = parseQtySnapshot(t.quantity_after);
            const availBefore = before?.quantity_available ?? '—';
            const availAfter = after?.quantity_available ?? '—';
            const changed = before && after && availBefore !== availAfter;
            const performedBy = resolvePerformedBy(t, employeeMap);
            const reasonLines = buildReasonContext(t);
            const jobNum = resolveJobNumber(t);
            const customer = resolveCustomer(t);
            const transferNum = t.related_request_id || '—';

            return (
              <tr key={t.id} className="hover:bg-muted/20">
                <td className="p-2 text-xs text-muted-foreground">
                  {t.transaction_date ? new Date(t.transaction_date).toLocaleString() : '—'}
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-1">
                    {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
                    <span className={`text-xs px-1.5 py-0.5 rounded ${meta.color}`}>{meta.label}</span>
                  </div>
                </td>
                <td className="p-2 text-xs">
                  {jobNum !== '—' ? (
                    <Link to="/admin/jobs" className="text-blue-600 hover:underline">{jobNum}</Link>
                  ) : '—'}
                </td>
                <td className="p-2 text-xs">{customer}</td>
                <td className="p-2 text-xs">
                  {transferNum !== '—' ? (
                    <Link to="/warehouse/transfer-sheets" className="text-blue-600 hover:underline">{transferNum}</Link>
                  ) : '—'}
                </td>
                <td className="p-2 text-xs">
                  {(t.related_employee || t.employee) ? (
                    <Link to="/lvcos/employees" className="text-blue-600 hover:underline">{t.related_employee || t.employee}</Link>
                  ) : '—'}
                </td>
                <td className="p-2 text-xs">
                  {(t.related_truck || t.truck) ? (
                    <Link to="/fleet/trucks" className="text-blue-600 hover:underline">{t.related_truck || t.truck}</Link>
                  ) : '—'}
                </td>
                <td className="p-2 text-right tabular-nums text-xs">{availBefore}</td>
                <td className={`p-2 text-right tabular-nums text-xs font-medium ${changed ? 'text-blue-600' : ''}`}>{availAfter}</td>
                <td className="p-2 text-xs">
                  <span>{performedBy.display}</span>
                  {performedBy.subtitle && <span className="text-muted-foreground"> · {performedBy.subtitle}</span>}
                </td>
                <td className="p-2 text-xs text-muted-foreground">{deriveSourceModule(t)}</td>
                <td className="p-2 text-xs text-muted-foreground max-w-[200px] truncate" title={reasonLines.join('; ')}>
                  {reasonLines.length > 0 ? reasonLines[0] : '—'}
                </td>
                <td className="p-2 text-xs">{t.status || '—'}</td>
                {developerMode && <td className="p-2 text-xs font-mono text-muted-foreground">{t.id}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}