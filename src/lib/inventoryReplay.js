import { parseQtySnapshot } from './inventoryTimelineConstants';
import { resolvePerformedBy, deriveSourceModule, buildReasonContext, formatQtyKey } from './auditUtils';

const QTY_KEYS = [
  'quantity_owned', 'quantity_available', 'quantity_reserved', 'quantity_assigned',
  'quantity_on_order', 'quantity_damaged', 'quantity_retired',
];

export function zeroState() {
  return Object.fromEntries(QTY_KEYS.map(k => [k, 0]));
}

export function sortTransactionsChronological(transactions) {
  return [...transactions].sort((a, b) => {
    const aDate = new Date(a.transaction_date || a.created_date || 0).getTime();
    const bDate = new Date(b.transaction_date || b.created_date || 0).getTime();
    return aDate - bDate;
  });
}

export function getIndexForTimestamp(sortedTxns, timestamp) {
  const ts = new Date(timestamp).getTime();
  for (let i = sortedTxns.length - 1; i >= 0; i--) {
    const txnDate = new Date(sortedTxns[i].transaction_date || sortedTxns[i].created_date || 0).getTime();
    if (txnDate <= ts) return i + 1;
  }
  return 0;
}

export function getStateAtIndex(sortedTxns, index) {
  if (index <= 0 || index > sortedTxns.length) return zeroState();
  const txn = sortedTxns[index - 1];
  const after = parseQtySnapshot(txn.quantity_after);
  return after || zeroState();
}

export function getTxnAtIndex(sortedTxns, index) {
  if (index <= 0 || index > sortedTxns.length) return null;
  return sortedTxns[index - 1];
}

/** Build a comprehensive replay summary text for exports and corrective actions. */
export function buildReplaySummary(item, state, timestamp, lastTxn, employeeMap = {}, nextTxn = null, sortedTxns = []) {
  const lines = [
    '=== INVENTORY REPLAY REPORT ===',
    '',
    `Item: ${item?.item_name || '—'}`,
    `SKU: ${item?.sku || item?.inventory_id || '—'}`,
    `Type: ${item?.inventory_type || '—'}`,
    `As Of: ${timestamp ? new Date(timestamp).toLocaleString() : '—'}`,
    `Location: ${item?.warehouse_location || '—'}`,
    `Bin: ${item?.bin_location || '—'}`,
    `Unit Cost: $${(item?.unit_cost || 0).toFixed(2)}`,
    `Inventory Value: $${((state.quantity_owned || 0) * (item?.unit_cost || 0)).toFixed(2)}`,
    '',
    '--- Reconstructed Quantities ---',
    ...QTY_KEYS.map(k => `  ${formatQtyKey(k)}: ${state[k] || 0}`),
  ];

  if (lastTxn) {
    const performedBy = resolvePerformedBy(lastTxn, employeeMap);
    lines.push('', '--- Last Transaction Before Replay ---');
    lines.push(`  Transaction ID: ${lastTxn.transaction_id || '—'}`);
    lines.push(`  Type: ${lastTxn.transaction_type || '—'}`);
    lines.push(`  Date: ${lastTxn.transaction_date ? new Date(lastTxn.transaction_date).toLocaleString() : '—'}`);
    lines.push(`  Quantity: ${lastTxn.quantity || 0}`);
    lines.push(`  Performed By: ${performedBy.display}${performedBy.subtitle ? ` (${performedBy.subtitle})` : ''}`);
    lines.push(`  Source Module: ${deriveSourceModule(lastTxn)}`);
    const reasonLines = buildReasonContext(lastTxn);
    if (reasonLines.length > 0) {
      lines.push('  Reason:');
      reasonLines.forEach(r => lines.push(`    ${r}`));
    }
  }

  if (nextTxn) {
    const performedBy = resolvePerformedBy(nextTxn, employeeMap);
    lines.push('', '--- Next Transaction After Replay ---');
    lines.push(`  Transaction ID: ${nextTxn.transaction_id || '—'}`);
    lines.push(`  Type: ${nextTxn.transaction_type || '—'}`);
    lines.push(`  Date: ${nextTxn.transaction_date ? new Date(nextTxn.transaction_date).toLocaleString() : '—'}`);
    lines.push(`  Performed By: ${performedBy.display}`);
    lines.push(`  Source Module: ${deriveSourceModule(nextTxn)}`);
  }

  if (sortedTxns.length > 0) {
    lines.push('', '--- Full Transaction History ---');
    sortedTxns.forEach((t, i) => {
      const performedBy = resolvePerformedBy(t, employeeMap);
      lines.push(`  ${i + 1}. [${t.transaction_date ? new Date(t.transaction_date).toLocaleString() : '—'}] ${t.transaction_type || '—'} | Qty: ${t.quantity || 0} | By: ${performedBy.display} | Source: ${deriveSourceModule(t)}`);
      const reasonLines = buildReasonContext(t);
      if (reasonLines.length > 0) lines.push(`     Reason: ${reasonLines.join('; ')}`);
    });
  }

  lines.push('', '=== END OF REPORT ===');
  return lines.join('\n');
}

/** Export replay data as CSV with all enterprise audit columns. */
export function exportReplayCSV(item, state, timestamp, sortedTxns, employeeMap = {}) {
  const header = [
    'Time', 'Transaction Type', 'Inventory Item', 'Job #', 'Customer',
    'Material Transfer #', 'Technician', 'Truck', 'Quantity Before',
    'Quantity After', 'Performed By', 'Source Module', 'Reason', 'Status',
  ];

  const rows = [
    ['Inventory Replay Report'],
    ['Item', item?.item_name || ''],
    ['SKU', item?.sku || item?.inventory_id || ''],
    ['Type', item?.inventory_type || ''],
    ['As Of', timestamp ? new Date(timestamp).toLocaleString() : ''],
    ['Unit Cost', item?.unit_cost || 0],
    ['Inventory Value', ((state.quantity_owned || 0) * (item?.unit_cost || 0)).toFixed(2)],
    ['Location', item?.warehouse_location || ''],
    ['Bin', item?.bin_location || ''],
    ['', ''],
    header,
    ...sortedTxns.map(t => {
      const before = parseQtySnapshot(t.quantity_before);
      const after = parseQtySnapshot(t.quantity_after);
      const performedBy = resolvePerformedBy(t, employeeMap);
      const reasonLines = buildReasonContext(t);
      return [
        t.transaction_date ? new Date(t.transaction_date).toLocaleString() : '',
        t.transaction_type || '',
        item?.item_name || '',
        t.related_job || '',
        '',
        t.related_request_id || '',
        t.related_employee || t.employee || '',
        t.related_truck || t.truck || '',
        before?.quantity_available ?? '',
        after?.quantity_available ?? '',
        performedBy.display,
        deriveSourceModule(t),
        reasonLines.join('; ').replace(/"/g, '""'),
        t.status || '',
      ];
    }),
  ];

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inventory-replay-${item?.sku || item?.id || 'item'}-${timestamp ? new Date(timestamp).toISOString().split('T')[0] : 'unknown'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Build the context payload for attaching to a Corrective Action. */
export function buildCorrectiveActionContext(item, state, timestamp, sortedTxns, employeeMap = {}) {
  const summary = buildReplaySummary(item, state, timestamp, null, employeeMap, null, sortedTxns);
  const relatedJob = sortedTxns.find(t => t.related_job)?.related_job || '—';
  const relatedTransfer = sortedTxns.find(t => t.related_request_id)?.related_request_id || '—';

  return {
    description: summary,
    relatedJob,
    relatedTransfer,
    relatedInventory: `${item?.item_name} (${item?.sku || item?.inventory_id || '—'})`,
    replayTimestamp: timestamp ? new Date(timestamp).toLocaleString() : '—',
  };
}