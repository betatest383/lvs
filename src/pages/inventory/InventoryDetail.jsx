import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, DollarSign, Package, AlertTriangle, History, Calendar, MapPin, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  QUANTITY_BUCKETS,
  checkBalance,
  getInventoryTypeMeta,
  getInventoryStatusColor,
  getTxnTypeMeta,
  INVENTORY_TXN_FILTER_TYPES,
} from '@/lib/inventoryMasterConstants';
import QuickActions from '@/components/inventory/QuickActions';
import InventoryTransactionDialog from '@/components/inventory/InventoryTransactionDialog';
import InventoryAllocation from '@/components/inventory/InventoryAllocation';
import InventoryTimeline from '@/components/inventory/InventoryTimeline';
import LinkedResourcesPanel from '@/components/resources/LinkedResourcesPanel';

export default function InventoryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [txnFilter, setTxnFilter] = useState('');
  const [txnOpen, setTxnOpen] = useState(false);
  const [txnDefaultType, setTxnDefaultType] = useState('receive');
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [transferSheets, setTransferSheets] = useState([]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      base44.entities.InventoryMaster.get(id),
      base44.entities.InventoryTransaction.filter({ inventory_master_id: id }, '-created_date', 100),
      base44.entities.MaterialTransferSheet.list('-created_date', 200),
    ]).then(([inv, txns, sheets]) => {
      setItem(inv);
      setTransactions(txns || []);
      setTransferSheets(sheets || []);
    }).catch(() => {
      toast.error('Failed to load inventory item');
    }).finally(() => setLoading(false));
  }, [id]);

  const reload = async () => {
    try {
      const [inv, txns, sheets] = await Promise.all([
        base44.entities.InventoryMaster.get(id),
        base44.entities.InventoryTransaction.filter({ inventory_master_id: id }, '-created_date', 100),
        base44.entities.MaterialTransferSheet.list('-created_date', 200),
      ]);
      setItem(inv);
      setTransactions(txns || []);
      setTransferSheets(sheets || []);
    } catch { /* ignore */ }
  };

  const filteredTxns = useMemo(() => {
    if (!txnFilter) return transactions;
    return transactions.filter(t => t.transaction_type === txnFilter);
  }, [transactions, txnFilter]);

  const lastTransaction = transactions[0] || null;
  const lastPhysicalCount = transactions.find(t => t.transaction_type === 'adjust' || t.transaction_type === 'physical_count' || (t.reason || '').toLowerCase().includes('count')) || null;

  const handleQuickAction = (type) => {
    setTxnDefaultType(type);
    setTxnOpen(true);
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }
  if (!item) {
    return <div className="text-center py-12 text-muted-foreground">Item not found.</div>;
  }

  const balanced = checkBalance(item);
  const typeMeta = getInventoryTypeMeta(item.inventory_type);
  const owned = item.quantity_owned || 0;

  // Allocation data derived from transactions
  const reservations = transactions.filter(t => t.transaction_type === 'reserve' && t.status !== 'cancelled');
  const assignments = transactions.filter(t => t.transaction_type === 'assign' && t.status !== 'cancelled');
  const purchaseOrders = transactions.filter(t => t.transaction_type === 'receive' && t.purchase_order);
  const damagedTxns = transactions.filter(t => t.transaction_type === 'damage');
  const retiredTxns = transactions.filter(t => t.transaction_type === 'retire');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              {item.item_name}
              <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${typeMeta.color}`}>{item.inventory_type}</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
              {item.inventory_id || '—'} · {item.sku || '—'}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setTimelineOpen(true)}>
              <History className="w-4 h-4 mr-1" /> View Timeline
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/inventory/replay?itemId=${item.id}`)}>
              <RotateCcw className="w-4 h-4 mr-1" /> Replay State
            </Button>
            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${getInventoryStatusColor(item.status || 'Active')}`}>
              {item.status || 'Active'}
            </span>
          </div>
          {!balanced && (
            <span className="text-xs text-red-600 font-medium flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Out of Balance
            </span>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardContent className="p-3">
          <QuickActions onAction={handleQuickAction} onViewHistory={() => navigate('/inventory/transactions')} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Inventory Status Card */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-4 h-4" /> Inventory Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {QUANTITY_BUCKETS.map(bucket => {
                const val = item[bucket.key] || 0;
                return (
                  <div key={bucket.key} className="rounded-lg border p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`w-2.5 h-2.5 rounded-full ${bucket.dot}`} />
                      <span className="text-xs text-muted-foreground">{bucket.label}</span>
                    </div>
                    <p className={`text-2xl font-bold tabular-nums ${bucket.color}`}>{val}</p>
                    <p className="text-xs text-muted-foreground">{item.unit || 'ea'}</p>
                  </div>
                );
              })}
            </div>

            {/* Balance Check */}
            <div className={`mt-4 rounded-lg p-3 text-sm ${balanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {balanced ? (
                <span className="flex items-center gap-2 font-medium">
                  <span className="w-2 h-2 rounded-full bg-green-500" /> Inventory Balanced
                </span>
              ) : (
                <span className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4" /> ⚠ Inventory Out of Balance
                </span>
              )}
              <div className="mt-1 text-xs text-muted-foreground">
                Owned ({owned}) = Available ({item.quantity_available || 0}) + Reserved ({item.quantity_reserved || 0}) + Assigned ({item.quantity_assigned || 0}) + On Order ({item.quantity_on_order || 0}) + Damaged ({item.quantity_damaged || 0}) + Retired ({item.quantity_retired || 0})
              </div>
            </div>

            {/* Inventory Value */}
            <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/50 p-3">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-purple-600" />
                <span className="text-sm text-muted-foreground">Inventory Value</span>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold">${(item.inventory_value || 0).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">{owned} × ${(item.unit_cost || 0).toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Last Transaction & Physical Count */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4" /> Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Last Inventory Transaction</p>
              {lastTransaction ? (
                <div className="rounded-md border p-2">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${getTxnTypeMeta(lastTransaction.transaction_type).color}`}>
                      {getTxnTypeMeta(lastTransaction.transaction_type).label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {lastTransaction.transaction_date ? new Date(lastTransaction.transaction_date).toLocaleDateString() : '—'}
                    </span>
                  </div>
                  <p className="text-sm font-medium mt-1">Qty: {lastTransaction.quantity} {item.unit}</p>
                  {lastTransaction.created_by && <p className="text-xs text-muted-foreground">By: {lastTransaction.created_by}</p>}
                </div>
              ) : <p className="text-sm text-muted-foreground">No transactions yet.</p>}
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">Last Physical Count</p>
              {lastPhysicalCount ? (
                <div className="rounded-md border p-2">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm">
                      {lastPhysicalCount.transaction_date ? new Date(lastPhysicalCount.transaction_date).toLocaleDateString() : '—'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Qty: {lastPhysicalCount.quantity} · {lastPhysicalCount.reason || 'count'}</p>
                </div>
              ) : <p className="text-sm text-muted-foreground">No physical counts recorded.</p>}
            </div>

            {item.warehouse_location && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Location</p>
                <div className="flex items-center gap-1.5 text-sm">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                  {item.warehouse_location}{item.bin_location ? ` · ${item.bin_location}` : ''}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Inventory Allocation */}
      <InventoryAllocation item={item} transactions={transactions} transferSheets={transferSheets} />

      {/* Linked Product Resources */}
      <LinkedResourcesPanel entityType="InventoryMaster" entityId={item.id} title="Product Resources" />

      {/* Inventory Transactions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Inventory Transactions</CardTitle>
            <select
              value={txnFilter}
              onChange={e => setTxnFilter(e.target.value)}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
            >
              <option value="">All Types</option>
              {INVENTORY_TXN_FILTER_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTxns.length === 0 ? (
            <EmptyRow label="No transactions found." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr className="text-left text-xs">
                    <th className="p-2 font-medium">Txn ID</th>
                    <th className="p-2 font-medium">Type</th>
                    <th className="p-2 font-medium text-right">Qty</th>
                    <th className="p-2 font-medium">Employee / Truck</th>
                    <th className="p-2 font-medium">Reason</th>
                    <th className="p-2 font-medium">Date</th>
                    <th className="p-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredTxns.map(t => (
                    <tr key={t.id} className="hover:bg-muted/30">
                      <td className="p-2 font-mono text-xs">{t.transaction_id || '—'}</td>
                      <td className="p-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${getTxnTypeMeta(t.transaction_type).color}`}>
                          {getTxnTypeMeta(t.transaction_type).label}
                        </span>
                      </td>
                      <td className="p-2 text-right tabular-nums font-medium">{t.quantity}</td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {t.related_employee || t.employee || '—'}
                        {t.related_truck && <span> · {t.related_truck}</span>}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground truncate max-w-[120px]">{t.reason || '—'}</td>
                      <td className="p-2 text-xs text-muted-foreground">{t.transaction_date ? new Date(t.transaction_date).toLocaleDateString() : '—'}</td>
                      <td className="p-2 text-xs">{t.status || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <InventoryTimeline
        open={timelineOpen}
        onOpenChange={setTimelineOpen}
        item={item}
        transactions={transactions}
      />

      <InventoryTransactionDialog
        open={txnOpen}
        onOpenChange={setTxnOpen}
        onSaved={reload}
        item={item}
        defaultType={txnDefaultType}
      />
    </div>
  );
}

function EmptyRow({ label }) {
  return <p className="text-sm text-muted-foreground py-2">{label}</p>;
}

function AllocTable({ headers, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b">
          <tr className="text-left text-xs text-muted-foreground">
            {headers.map((h, i) => <th key={i} className="p-1.5 font-medium whitespace-nowrap">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-muted/30">
              {row.map((cell, ci) => (
                <td key={ci} className="p-1.5 text-xs whitespace-nowrap">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}