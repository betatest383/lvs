import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, DollarSign, Package, AlertTriangle, AlertCircle, Archive, Wrench, TrendingDown, BarChart3 } from 'lucide-react';
import {
  INVENTORY_TYPES,
  getInventoryTypeMeta,
  getTxnTypeMeta,
  isLowStock,
  isOutOfStock,
  isOverstock,
  checkBalance,
} from '@/lib/inventoryMasterConstants';

const REPORTS = [
  { key: 'valuation', label: 'Inventory Valuation', icon: DollarSign },
  { key: 'by_type', label: 'Inventory by Type', icon: BarChart3 },
  { key: 'low_stock', label: 'Low Stock', icon: AlertTriangle },
  { key: 'out_of_stock', label: 'Out of Stock', icon: AlertCircle },
  { key: 'overstock', label: 'Overstock', icon: Package },
  { key: 'damaged', label: 'Damaged Inventory', icon: AlertCircle },
  { key: 'retired', label: 'Retired Inventory', icon: Archive },
  { key: 'assigned', label: 'Assigned Inventory', icon: Wrench },
  { key: 'transactions', label: 'Transactions', icon: TrendingDown },
  { key: 'out_of_balance', label: 'Out of Balance', icon: AlertCircle },
];

export default function InventoryReports() {
  const [activeReport, setActiveReport] = useState('valuation');
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [summaryRes, queryRes, txns] = await Promise.all([
        base44.functions.invoke('inventorySummary', { type: 'all' }).then(r => r.data).catch(() => null),
        base44.functions.invoke('inventoryQuery', { type: 'all', exportAll: true }).then(r => r.data.items || []).catch(() => []),
        base44.entities.InventoryTransaction.filter({}, '-transaction_date', 200),
      ]);
      setSummary(summaryRes);
      setItems(queryRes);
      setTransactions(txns);
    } catch {
      // error
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    return {
      totalValue: items.reduce((s, i) => s + (i.inventory_value || 0), 0),
      totalItems: items.length,
      lowStock: items.filter(isLowStock),
      outOfStock: items.filter(isOutOfStock),
      overstock: items.filter(isOverstock),
      damaged: items.filter(i => (i.quantity_damaged || 0) > 0),
      retired: items.filter(i => (i.quantity_retired || 0) > 0),
      assigned: items.filter(i => (i.quantity_assigned || 0) > 0),
      unbalanced: items.filter(i => !checkBalance(i)),
    };
  }, [items]);

  const byType = useMemo(() => {
    const map = {};
    INVENTORY_TYPES.forEach(t => {
      const typeItems = items.filter(i => i.inventory_type === t.value);
      map[t.value] = {
        label: t.label,
        color: t.color,
        count: typeItems.length,
        value: typeItems.reduce((s, i) => s + (i.inventory_value || 0), 0),
        owned: typeItems.reduce((s, i) => s + (i.quantity_owned || 0), 0),
        available: typeItems.reduce((s, i) => s + (i.quantity_available || 0), 0),
        assigned: typeItems.reduce((s, i) => s + (i.quantity_assigned || 0), 0),
      };
    });
    return map;
  }, [items]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const renderReport = () => {
    switch (activeReport) {
      case 'valuation':
        return (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr className="text-left">
                    <th className="p-3 font-medium">Item</th>
                    <th className="p-3 font-medium">Type</th>
                    <th className="p-3 font-medium text-right">Qty Owned</th>
                    <th className="p-3 font-medium text-right">Unit Cost</th>
                    <th className="p-3 font-medium text-right">Inventory Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items
                    .filter(i => (i.inventory_value || 0) > 0)
                    .sort((a, b) => (b.inventory_value || 0) - (a.inventory_value || 0))
                    .map(item => (
                      <tr key={item.id} className="hover:bg-muted/30">
                        <td className="p-3 font-medium">{item.item_name}</td>
                        <td className="p-3">
                          <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${getInventoryTypeMeta(item.inventory_type).color}`}>
                            {item.inventory_type}
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums">{item.quantity_owned || 0}</td>
                        <td className="p-3 text-right tabular-nums">${(item.unit_cost || 0).toFixed(2)}</td>
                        <td className="p-3 text-right tabular-nums font-bold">${(item.inventory_value || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                </tbody>
                <tfoot className="border-t-2 bg-muted/30">
                  <tr>
                    <td colSpan={4} className="p-3 font-bold text-right">Total Inventory Value:</td>
                    <td className="p-3 text-right tabular-nums font-bold text-lg">${stats.totalValue.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        );

      case 'by_type':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {INVENTORY_TYPES.map(t => {
              const data = byType[t.value];
              return (
                <Card key={t.value}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${t.color}`}>{t.label}</span>
                      <span className="text-2xl font-bold">{data.count}</span>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Owned:</span><span className="tabular-nums font-medium">{data.owned}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Available:</span><span className="tabular-nums font-medium">{data.available}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Assigned:</span><span className="tabular-nums font-medium">{data.assigned}</span></div>
                      <div className="flex justify-between border-t pt-1"><span className="text-muted-foreground">Value:</span><span className="tabular-nums font-bold">${data.value.toFixed(2)}</span></div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        );

      case 'low_stock':
        return <ReportTable items={stats.lowStock} title="Low Stock Items" emptyMsg="No low stock items." showMinMax />;

      case 'out_of_stock':
        return <ReportTable items={stats.outOfStock} title="Out of Stock Items" emptyMsg="No out of stock items." showMinMax />;

      case 'overstock':
        return <ReportTable items={stats.overstock} title="Overstock Items" emptyMsg="No overstock items." showMinMax />;

      case 'damaged':
        return <ReportTable items={stats.damaged} title="Damaged Inventory" emptyMsg="No damaged items." showDamaged />;

      case 'retired':
        return <ReportTable items={stats.retired} title="Retired Inventory" emptyMsg="No retired items." showRetired />;

      case 'assigned':
        return <ReportTable items={stats.assigned} title="Assigned Inventory" emptyMsg="No assigned items." showAssigned />;

      case 'transactions':
        return (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr className="text-left">
                    <th className="p-3 font-medium">Txn ID</th>
                    <th className="p-3 font-medium">Date</th>
                    <th className="p-3 font-medium">Item</th>
                    <th className="p-3 font-medium">Type</th>
                    <th className="p-3 font-medium text-right">Qty</th>
                    <th className="p-3 font-medium">Reason</th>
                    <th className="p-3 font-medium">Performed By</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transactions.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No transactions yet.</td></tr>
                  ) : (
                    transactions.map(t => {
                      const meta = getTxnTypeMeta(t.transaction_type);
                      return (
                        <tr key={t.id} className="hover:bg-muted/30">
                          <td className="p-3 font-mono text-xs">{t.transaction_id || '—'}</td>
                          <td className="p-3 text-xs text-muted-foreground">{t.transaction_date ? new Date(t.transaction_date).toLocaleDateString() : '—'}</td>
                          <td className="p-3 font-medium">{t.inventory_item_name || t.equipment_name || '—'}</td>
                          <td className="p-3">
                            <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${meta.color}`}>{meta.label || t.transaction_type}</span>
                          </td>
                          <td className="p-3 text-right tabular-nums">{t.quantity}</td>
                          <td className="p-3 text-xs text-muted-foreground">{t.reason || '—'}</td>
                          <td className="p-3 text-xs">{t.created_by || '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        );

      case 'out_of_balance':
        if (stats.unbalanced.length === 0) {
          return (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">All inventory records are balanced.</p>
              </CardContent>
            </Card>
          );
        }
        return (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr className="text-left">
                    <th className="p-3 font-medium">Item</th>
                    <th className="p-3 font-medium text-right">Owned</th>
                    <th className="p-3 font-medium text-right">Available</th>
                    <th className="p-3 font-medium text-right">Assigned</th>
                    <th className="p-3 font-medium text-right">Reserved</th>
                    <th className="p-3 font-medium text-right">On Order</th>
                    <th className="p-3 font-medium text-right">Damaged</th>
                    <th className="p-3 font-medium text-right">Retired</th>
                    <th className="p-3 font-medium text-right">Sum</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {stats.unbalanced.map(item => {
                    const sum = (item.quantity_available || 0) + (item.quantity_assigned || 0) + (item.quantity_reserved || 0)
                      + (item.quantity_on_order || 0) + (item.quantity_damaged || 0) + (item.quantity_retired || 0);
                    return (
                      <tr key={item.id} className="hover:bg-muted/30">
                        <td className="p-3 font-medium">{item.item_name}</td>
                        <td className="p-3 text-right tabular-nums">{item.quantity_owned || 0}</td>
                        <td className="p-3 text-right tabular-nums">{item.quantity_available || 0}</td>
                        <td className="p-3 text-right tabular-nums">{item.quantity_assigned || 0}</td>
                        <td className="p-3 text-right tabular-nums">{item.quantity_reserved || 0}</td>
                        <td className="p-3 text-right tabular-nums">{item.quantity_on_order || 0}</td>
                        <td className="p-3 text-right tabular-nums">{item.quantity_damaged || 0}</td>
                        <td className="p-3 text-right tabular-nums">{item.quantity_retired || 0}</td>
                        <td className="p-3 text-right tabular-nums font-bold text-red-600">{sum}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Inventory Reports</h2>
        <p className="text-xs text-muted-foreground">Comprehensive reporting across all inventory types</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Total Value</div><p className="text-xl font-bold">${(summary?.totals?.totalValue || 0).toFixed(0)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Total Items</div><p className="text-xl font-bold">{summary?.totals?.total || items.length}</p></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Low Stock</div><p className="text-xl font-bold text-amber-600">{summary?.totals?.lowStock ?? stats.lowStock.length}</p></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Out of Stock</div><p className="text-xl font-bold text-red-600">{summary?.totals?.outOfStock ?? stats.outOfStock.length}</p></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Unbalanced</div><p className="text-xl font-bold text-orange-600">{summary?.totals?.unbalanced ?? stats.unbalanced.length}</p></CardContent></Card>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b pb-px">
        {REPORTS.map(r => (
          <button
            key={r.key}
            onClick={() => setActiveReport(r.key)}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
              activeReport === r.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <r.icon className="w-4 h-4" />
            {r.label}
          </button>
        ))}
      </div>

      {renderReport()}
    </div>
  );
}

function ReportTable({ items, title, emptyMsg, showMinMax, showDamaged, showRetired, showAssigned }) {
  return (
    <Card>
      <div className="p-3 border-b">
        <h3 className="font-semibold text-sm">{title} ({items.length})</h3>
      </div>
      {items.length === 0 ? (
        <CardContent className="p-8 text-center text-muted-foreground">
          <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{emptyMsg}</p>
        </CardContent>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr className="text-left">
                <th className="p-3 font-medium">Item</th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 font-medium">SKU</th>
                <th className="p-3 font-medium text-right">Owned</th>
                <th className="p-3 font-medium text-right">Available</th>
                {showAssigned && <th className="p-3 font-medium text-right">Assigned</th>}
                {showDamaged && <th className="p-3 font-medium text-right">Damaged</th>}
                {showRetired && <th className="p-3 font-medium text-right">Retired</th>}
                {showMinMax && <th className="p-3 font-medium text-right">Min/Max</th>}
                <th className="p-3 font-medium">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-muted/30">
                  <td className="p-3 font-medium">{item.item_name}</td>
                  <td className="p-3">
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${getInventoryTypeMeta(item.inventory_type).color}`}>
                      {item.inventory_type}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-xs">{item.sku || '—'}</td>
                  <td className="p-3 text-right tabular-nums">{item.quantity_owned || 0}</td>
                  <td className="p-3 text-right tabular-nums">{item.quantity_available || 0}</td>
                  {showAssigned && <td className="p-3 text-right tabular-nums">{item.quantity_assigned || 0}</td>}
                  {showDamaged && <td className="p-3 text-right tabular-nums text-red-600">{item.quantity_damaged || 0}</td>}
                  {showRetired && <td className="p-3 text-right tabular-nums text-gray-600">{item.quantity_retired || 0}</td>}
                  {showMinMax && (
                    <td className="p-3 text-right text-xs text-muted-foreground tabular-nums">
                      {item.minimum_stock || 0} / {item.maximum_stock || 0}
                    </td>
                  )}
                  <td className="p-3 text-xs">{item.warehouse_location || '—'}{item.bin_location ? ` · ${item.bin_location}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}