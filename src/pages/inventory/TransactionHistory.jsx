import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Search, History, Download } from 'lucide-react';
import { getTransactionTypeLabel, getTransactionTypeColor, getStatusColor } from '@/lib/inventoryConstants';
import { INVENTORY_TXN_FILTER_TYPES } from '@/lib/inventoryMasterConstants';

export default function TransactionHistory() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    base44.entities.InventoryTransaction.list('-created_date', 200)
      .then(setTransactions).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = transactions.filter(t => {
    if (typeFilter && t.transaction_type !== typeFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return ['transaction_id', 'equipment_name', 'equipment_id', 'employee', 'vendor', 'truck', 'created_by', 'reason']
      .some(f => t[f] && String(t[f]).toLowerCase().includes(q));
  });

  const parseQty = (str) => {
    if (!str) return null;
    try { return JSON.parse(str); } catch { return null; }
  };

  const exportCSV = () => {
    const headers = ['Transaction ID', 'Date', 'Type', 'Equipment', 'Qty', 'Employee', 'Vendor', 'Truck', 'Created By', 'Status'];
    const rows = filtered.map(t => [
      t.transaction_id || '',
      t.transaction_date ? new Date(t.transaction_date).toLocaleString() : '',
      getTransactionTypeLabel(t.transaction_type),
      t.equipment_name || '',
      t.quantity || '',
      t.employee || '',
      t.vendor || '',
      t.truck || '',
      t.created_by || '',
      t.status || ''
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'inventory_transactions.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by ID, equipment, employee, vendor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <select className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          {INVENTORY_TXN_FILTER_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
          <option value="receive_purchase">Receive Purchase</option>
          <option value="issue_to_employee">Issue to Employee</option>
          <option value="return_from_employee">Return from Employee</option>
          <option value="transfer_between_employees">Transfer Between Employees</option>
          <option value="truck_restock">Truck Restock</option>
          <option value="truck_return">Truck Return</option>
          <option value="adjust_inventory">Adjust Inventory</option>
          <option value="physical_count">Physical Count</option>
          <option value="repair">Repair</option>
          <option value="returned_from_repair">Returned From Repair</option>
          <option value="retire_item">Retire Item</option>
          <option value="lost">Lost</option>
          <option value="vendor_return">Vendor Return</option>
        </select>
        <Button variant="outline" onClick={exportCSV} disabled={filtered.length === 0}>
          <Download className="w-4 h-4" /> Export
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-xl">
          <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No transactions found.</p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 bg-muted text-xs font-medium text-muted-foreground">
            <span className="col-span-2">Transaction ID</span>
            <span className="col-span-2">Type</span>
            <span className="col-span-3">Equipment</span>
            <span className="col-span-1 text-center">Qty</span>
            <span className="col-span-2">Employee / Vendor</span>
            <span className="col-span-1">Date</span>
            <span className="col-span-1 text-center">Status</span>
          </div>
          {filtered.map(t => {
            const before = parseQty(t.quantity_before);
            const after = parseQty(t.quantity_after);
            const isExpanded = expanded === t.id;
            return (
              <div key={t.id} className="border-t">
                <div
                  className="grid grid-cols-12 gap-2 px-4 py-3 bg-card text-sm items-center hover:bg-muted/30 cursor-pointer"
                  onClick={() => setExpanded(isExpanded ? null : t.id)}
                >
                  <span className="col-span-6 md:col-span-2 font-medium text-xs">{t.transaction_id}</span>
                  <span className="col-span-6 md:col-span-2"><span className={`text-xs px-2 py-0.5 rounded ${getTransactionTypeColor(t.transaction_type)}`}>{getTransactionTypeLabel(t.transaction_type)}</span></span>
                  <span className="col-span-6 md:col-span-3 truncate">{t.equipment_name}</span>
                  <span className="col-span-2 md:col-span-1 text-center font-medium">{t.quantity}</span>
                  <span className="col-span-4 md:col-span-2 truncate text-xs text-muted-foreground">{t.employee || t.vendor || '—'}</span>
                  <span className="col-span-4 md:col-span-1 text-xs text-muted-foreground">{t.transaction_date ? new Date(t.transaction_date).toLocaleDateString() : '—'}</span>
                  <span className="col-span-2 md:col-span-1 text-center"><span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(t.status)}`}>{t.status}</span></span>
                </div>
                {isExpanded && (
                  <div className="px-4 py-3 bg-muted/20 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                      {before && (
                        <>
                          <div className="p-2 bg-muted rounded"><p className="text-xs text-muted-foreground">Owned (Before)</p><p className="font-medium">{before.owned}</p></div>
                          <div className="p-2 bg-muted rounded"><p className="text-xs text-muted-foreground">Available (Before)</p><p className="font-medium">{before.available}</p></div>
                          <div className="p-2 bg-muted rounded"><p className="text-xs text-muted-foreground">Assigned (Before)</p><p className="font-medium">{before.assigned}</p></div>
                          <div className="p-2 bg-muted rounded"><p className="text-xs text-muted-foreground">Repair (Before)</p><p className="font-medium">{before.repair}</p></div>
                          <div className="p-2 bg-muted rounded"><p className="text-xs text-muted-foreground">Retired (Before)</p><p className="font-medium">{before.retired}</p></div>
                        </>
                      )}
                      {after && (
                        <>
                          <div className="p-2 bg-green-50 rounded"><p className="text-xs text-muted-foreground">Owned (After)</p><p className="font-medium text-green-700">{after.owned}</p></div>
                          <div className="p-2 bg-green-50 rounded"><p className="text-xs text-muted-foreground">Available (After)</p><p className="font-medium text-green-700">{after.available}</p></div>
                          <div className="p-2 bg-green-50 rounded"><p className="text-xs text-muted-foreground">Assigned (After)</p><p className="font-medium text-green-700">{after.assigned}</p></div>
                          <div className="p-2 bg-green-50 rounded"><p className="text-xs text-muted-foreground">Repair (After)</p><p className="font-medium text-green-700">{after.repair}</p></div>
                          <div className="p-2 bg-green-50 rounded"><p className="text-xs text-muted-foreground">Retired (After)</p><p className="font-medium text-green-700">{after.retired}</p></div>
                        </>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                      {t.vendor && <div><p className="text-xs text-muted-foreground">Vendor</p><p className="font-medium">{t.vendor}</p></div>}
                      {t.purchase_order && <div><p className="text-xs text-muted-foreground">PO</p><p className="font-medium">{t.purchase_order}</p></div>}
                      {t.truck && <div><p className="text-xs text-muted-foreground">Truck</p><p className="font-medium">{t.truck}</p></div>}
                      {t.condition && <div><p className="text-xs text-muted-foreground">Condition</p><p className="font-medium">{t.condition}</p></div>}
                      {t.source_location && <div><p className="text-xs text-muted-foreground">From</p><p className="font-medium">{t.source_location}</p></div>}
                      {t.destination_location && <div><p className="text-xs text-muted-foreground">To</p><p className="font-medium">{t.destination_location}</p></div>}
                      {t.unit_cost > 0 && <div><p className="text-xs text-muted-foreground">Unit Cost</p><p className="font-medium">${t.unit_cost}</p></div>}
                      {t.total_cost > 0 && <div><p className="text-xs text-muted-foreground">Total Cost</p><p className="font-medium">${t.total_cost}</p></div>}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                      <div><p className="text-xs text-muted-foreground">Created By</p><p className="font-medium">{t.created_by}</p></div>
                      <div><p className="text-xs text-muted-foreground">Approved By</p><p className="font-medium">{t.approved_by || '—'}</p></div>
                      <div><p className="text-xs text-muted-foreground">Audit Ref</p><p className="font-medium">{t.audit_reference || '—'}</p></div>
                    </div>
                    {t.reason && <div><p className="text-xs text-muted-foreground">Reason</p><p className="text-sm">{t.reason}</p></div>}
                    {t.notes && <div><p className="text-xs text-muted-foreground">Notes</p><p className="text-sm">{t.notes}</p></div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}