import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ChevronDown, Package, MapPin, DollarSign } from 'lucide-react';

const ACTIVE_TRANSFER_STATUSES = ['Requested', 'Staged', 'Ready for Pickup', 'Picked Up', 'Submitted', 'Issued', 'Draft'];

function parseLineItems(lineItemsStr) {
  if (!lineItemsStr) return [];
  try {
    const parsed = typeof lineItemsStr === 'string' ? JSON.parse(lineItemsStr) : lineItemsStr;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getTransferLineItem(transfer, item) {
  const items = parseLineItems(transfer.line_items);
  return items.find(li =>
    li.inventory_master_id === item.id ||
    li.inventory_master_id === item.inventory_id ||
    (item.sku && li.sku === item.sku)
  );
}

function transferHasItem(transfer, item) {
  return !!getTransferLineItem(transfer, item);
}

function EmptyMsg({ label }) {
  return <p className="text-sm text-muted-foreground py-2">{label}</p>;
}

function RelatedLink({ to, children }) {
  if (!children || children === '—' || children === '') return <span className="text-muted-foreground">—</span>;
  return (
    <Link to={to} className="text-blue-600 hover:underline">{children}</Link>
  );
}

export default function InventoryAllocation({ item, transactions, transferSheets }) {
  const [openSections, setOpenSections] = useState({
    available: false,
    reserved: true,
    assigned: true,
    onOrder: false,
    damaged: false,
    retired: false,
  });

  const toggle = (key) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  // Derive data from transactions
  const reserveTxns = transactions.filter(t => t.transaction_type === 'reserve' && t.status !== 'cancelled');
  const assignTxns = transactions.filter(t =>
    (t.transaction_type === 'assign' || t.transaction_type === 'issue_to_employee') && t.status !== 'cancelled'
  );
  const poTxns = transactions.filter(t =>
    (t.transaction_type === 'receive' || t.transaction_type === 'receive_purchase' || t.transaction_type === 'consumable_receive') && t.purchase_order
  );
  const damagedTxns = transactions.filter(t => t.transaction_type === 'damage' || t.transaction_type === 'damaged' || t.transaction_type === 'lost');
  const retiredTxns = transactions.filter(t => t.transaction_type === 'retire' || t.transaction_type === 'retire_item' || t.transaction_type === 'consumable_retire');
  const lastReceive = transactions.find(t => t.transaction_type === 'receive' || t.transaction_type === 'receive_purchase' || t.transaction_type === 'consumable_receive');

  // Build reservations from transfer sheets (preferred) or fall back to reserve transactions
  const matchingTransfers = (transferSheets || []).filter(ts => transferHasItem(ts, item));
  const activeTransfers = matchingTransfers.filter(ts => ACTIVE_TRANSFER_STATUSES.includes(ts.status));

  const reservations = activeTransfers.length > 0
    ? activeTransfers.map(ts => {
        const li = getTransferLineItem(ts, item);
        return {
          reservationId: ts.transfer_id || '—',
          transferNumber: ts.transfer_id || '—',
          jobNumber: ts.job_number || '—',
          customer: ts.customer_name || '—',
          technician: ts.technician || '—',
          truck: ts.truck_number || '—',
          quantity: li?.quantity_requested || 0,
          dateReserved: ts.requested_date || ts.date,
          expectedPickup: ts.ready_date,
          status: ts.status || '—',
          createdBy: ts.created_by || '—',
        };
      })
    : reserveTxns.map(t => ({
        reservationId: t.transaction_id || '—',
        transferNumber: t.related_request_id || t.audit_reference || '—',
        jobNumber: t.related_job || '—',
        customer: '—',
        technician: t.related_employee || t.employee || '—',
        truck: t.related_truck || t.truck || '—',
        quantity: t.quantity || 0,
        dateReserved: t.transaction_date,
        expectedPickup: null,
        status: t.status || '—',
        createdBy: t.created_by || '—',
      }));

  const totalReserved = reservations.reduce((sum, r) => sum + (r.quantity || 0), 0);
  const unit = item?.unit || 'ea';

  const sections = [
    {
      key: 'available',
      label: 'Available',
      count: item?.quantity_available || 0,
      dot: 'bg-green-500',
      content: (
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="w-3.5 h-3.5" />
            {item?.warehouse_location || 'No location set'}{item?.bin_location ? ` · ${item.bin_location}` : ''}
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <DollarSign className="w-3.5 h-3.5" />
            Unit Cost: ${(item?.unit_cost || 0).toFixed(2)} · Value: ${(item?.inventory_value || 0).toFixed(2)}
          </div>
          {lastReceive && (
            <p className="text-xs text-muted-foreground">
              Last Received: {lastReceive.transaction_date ? new Date(lastReceive.transaction_date).toLocaleDateString() : '—'}
              {lastReceive.vendor ? ` from ${lastReceive.vendor}` : ''}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'reserved',
      label: 'Reserved',
      count: item?.quantity_reserved || 0,
      dot: 'bg-yellow-500',
      content: (
        <div className="space-y-2">
          {reservations.length === 0 ? (
            <EmptyMsg label="No active reservations." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="p-1.5 font-medium whitespace-nowrap">Reservation ID</th>
                      <th className="p-1.5 font-medium whitespace-nowrap">Material Transfer #</th>
                      <th className="p-1.5 font-medium whitespace-nowrap">Job #</th>
                      <th className="p-1.5 font-medium whitespace-nowrap">Customer</th>
                      <th className="p-1.5 font-medium whitespace-nowrap">Technician</th>
                      <th className="p-1.5 font-medium whitespace-nowrap">Truck</th>
                      <th className="p-1.5 font-medium text-right whitespace-nowrap">Qty Reserved</th>
                      <th className="p-1.5 font-medium whitespace-nowrap">Date Reserved</th>
                      <th className="p-1.5 font-medium whitespace-nowrap">Expected Pickup</th>
                      <th className="p-1.5 font-medium whitespace-nowrap">Status</th>
                      <th className="p-1.5 font-medium whitespace-nowrap">Created By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {reservations.map((r, i) => (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="p-1.5 text-xs font-mono">{r.reservationId}</td>
                        <td className="p-1.5 text-xs"><RelatedLink to="/warehouse/transfer-sheets">{r.transferNumber}</RelatedLink></td>
                        <td className="p-1.5 text-xs"><RelatedLink to="/admin/jobs">{r.jobNumber}</RelatedLink></td>
                        <td className="p-1.5 text-xs"><RelatedLink to="/admin/customers">{r.customer}</RelatedLink></td>
                        <td className="p-1.5 text-xs"><RelatedLink to="/lvcos/employees">{r.technician}</RelatedLink></td>
                        <td className="p-1.5 text-xs"><RelatedLink to="/fleet/trucks">{r.truck}</RelatedLink></td>
                        <td className="p-1.5 text-xs text-right tabular-nums font-medium">{r.quantity}</td>
                        <td className="p-1.5 text-xs">{r.dateReserved ? new Date(r.dateReserved).toLocaleDateString() : '—'}</td>
                        <td className="p-1.5 text-xs">{r.expectedPickup ? new Date(r.expectedPickup).toLocaleDateString() : '—'}</td>
                        <td className="p-1.5 text-xs">{r.status}</td>
                        <td className="p-1.5 text-xs text-muted-foreground">{r.createdBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between rounded-md bg-amber-50 px-3 py-2">
                <span className="text-sm font-medium text-amber-700">Total Reserved</span>
                <span className="text-lg font-bold tabular-nums text-amber-700">{totalReserved} {unit}</span>
              </div>
            </>
          )}
        </div>
      ),
    },
    {
      key: 'assigned',
      label: 'Assigned',
      count: item?.quantity_assigned || 0,
      dot: 'bg-blue-500',
      content: (
        <div className="overflow-x-auto">
          {assignTxns.length === 0 ? (
            <EmptyMsg label="No active assignments." />
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="p-1.5 font-medium whitespace-nowrap">Employee</th>
                  <th className="p-1.5 font-medium whitespace-nowrap">Truck</th>
                  <th className="p-1.5 font-medium whitespace-nowrap">Job</th>
                  <th className="p-1.5 font-medium text-right whitespace-nowrap">Quantity</th>
                  <th className="p-1.5 font-medium whitespace-nowrap">Assigned Date</th>
                  <th className="p-1.5 font-medium whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {assignTxns.map((t, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="p-1.5 text-xs"><RelatedLink to="/lvcos/employees">{t.related_employee || t.employee || '—'}</RelatedLink></td>
                    <td className="p-1.5 text-xs"><RelatedLink to="/fleet/trucks">{t.related_truck || t.truck || '—'}</RelatedLink></td>
                    <td className="p-1.5 text-xs"><RelatedLink to="/admin/jobs">{t.related_job || '—'}</RelatedLink></td>
                    <td className="p-1.5 text-xs text-right tabular-nums font-medium">{t.quantity}</td>
                    <td className="p-1.5 text-xs">{t.transaction_date ? new Date(t.transaction_date).toLocaleDateString() : '—'}</td>
                    <td className="p-1.5 text-xs">{t.status || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ),
    },
    {
      key: 'onOrder',
      label: 'On Order',
      count: item?.quantity_on_order || 0,
      dot: 'bg-purple-500',
      content: (
        <div className="overflow-x-auto">
          {poTxns.length === 0 ? (
            <EmptyMsg label="No purchase orders." />
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="p-1.5 font-medium whitespace-nowrap">PO Number</th>
                  <th className="p-1.5 font-medium whitespace-nowrap">Vendor</th>
                  <th className="p-1.5 font-medium text-right whitespace-nowrap">Quantity</th>
                  <th className="p-1.5 font-medium whitespace-nowrap">ETA</th>
                  <th className="p-1.5 font-medium whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {poTxns.map((t, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="p-1.5 text-xs font-mono">{t.purchase_order || '—'}</td>
                    <td className="p-1.5 text-xs"><RelatedLink to="/inventory/vendors">{t.vendor || item?.vendor || '—'}</RelatedLink></td>
                    <td className="p-1.5 text-xs text-right tabular-nums font-medium">{t.quantity}</td>
                    <td className="p-1.5 text-xs">{t.transaction_date ? new Date(t.transaction_date).toLocaleDateString() : '—'}</td>
                    <td className="p-1.5 text-xs">{t.status || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ),
    },
    {
      key: 'damaged',
      label: 'Damaged',
      count: item?.quantity_damaged || 0,
      dot: 'bg-orange-500',
      content: (
        <div className="overflow-x-auto">
          {damagedTxns.length === 0 ? (
            <EmptyMsg label="No damaged inventory." />
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="p-1.5 font-medium text-right whitespace-nowrap">Quantity</th>
                  <th className="p-1.5 font-medium whitespace-nowrap">Reason</th>
                  <th className="p-1.5 font-medium whitespace-nowrap">Reported By</th>
                  <th className="p-1.5 font-medium whitespace-nowrap">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {damagedTxns.map((t, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="p-1.5 text-xs text-right tabular-nums font-medium">{t.quantity}</td>
                    <td className="p-1.5 text-xs">{t.reason || t.notes || '—'}</td>
                    <td className="p-1.5 text-xs"><RelatedLink to="/lvcos/employees">{t.created_by || t.related_employee || '—'}</RelatedLink></td>
                    <td className="p-1.5 text-xs">{t.transaction_date ? new Date(t.transaction_date).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ),
    },
    {
      key: 'retired',
      label: 'Retired',
      count: item?.quantity_retired || 0,
      dot: 'bg-gray-400',
      content: (
        <div className="overflow-x-auto">
          {retiredTxns.length === 0 ? (
            <EmptyMsg label="No retired inventory." />
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="p-1.5 font-medium text-right whitespace-nowrap">Quantity</th>
                  <th className="p-1.5 font-medium whitespace-nowrap">Reason</th>
                  <th className="p-1.5 font-medium whitespace-nowrap">Retired By</th>
                  <th className="p-1.5 font-medium whitespace-nowrap">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {retiredTxns.map((t, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="p-1.5 text-xs text-right tabular-nums font-medium">{t.quantity}</td>
                    <td className="p-1.5 text-xs">{t.reason || t.notes || '—'}</td>
                    <td className="p-1.5 text-xs"><RelatedLink to="/lvcos/employees">{t.created_by || t.related_employee || '—'}</RelatedLink></td>
                    <td className="p-1.5 text-xs">{t.transaction_date ? new Date(t.transaction_date).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="w-4 h-4" /> Inventory Allocation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sections.map(section => (
          <Collapsible key={section.key} open={openSections[section.key]} onOpenChange={() => toggle(section.key)}>
            <div className="rounded-lg border">
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${section.dot}`} />
                  <span className="text-sm font-medium">{section.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold tabular-nums">{section.count}</span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${openSections[section.key] ? 'rotate-180' : ''}`} />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t p-3">
                  {section.content}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        ))}
      </CardContent>
    </Card>
  );
}