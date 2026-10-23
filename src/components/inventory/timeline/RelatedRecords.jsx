import { Link } from 'react-router-dom';
import {
  Package, ArrowLeftRight, FileText, User, Truck, ShoppingCart,
  Wrench, ClipboardList, ShieldAlert,
} from 'lucide-react';

/**
 * Displays clickable links to all related records on a transaction:
 * Inventory Item, Material Transfer, Job, Customer, Technician, Truck,
 * Purchase Order, Vendor, Equipment, Work Order, Corrective Action.
 */
export default function RelatedRecords({ txn }) {
  const links = [];

  if (txn.inventory_master_id) {
    links.push({ to: `/inventory/master/detail/${txn.inventory_master_id}`, icon: Package, label: txn.inventory_item_name || 'Inventory Item' });
  }
  if (txn.related_request_id || txn.audit_reference) {
    const refId = txn.related_request_id || txn.audit_reference;
    if (/^MTS/i.test(refId)) {
      links.push({ to: '/warehouse/transfer-sheets', icon: ArrowLeftRight, label: refId });
    }
  }
  if (txn.related_job) {
    links.push({ to: '/admin/jobs', icon: FileText, label: `Job ${txn.related_job}` });
  }
  const emp = txn.related_employee || txn.employee;
  if (emp) {
    links.push({ to: '/lvcos/employees', icon: User, label: emp });
  }
  const truck = txn.related_truck || txn.truck;
  if (truck) {
    links.push({ to: '/fleet/trucks', icon: Truck, label: truck });
  }
  if (txn.purchase_order) {
    links.push({ to: '/inventory/vendors', icon: ShoppingCart, label: `PO ${txn.purchase_order}` });
  }
  if (txn.vendor && !txn.purchase_order) {
    links.push({ to: '/inventory/vendors', icon: ShoppingCart, label: txn.vendor });
  }
  if (txn.equipment_master_id || txn.equipment_id) {
    links.push({ to: '/equipment/master', icon: Wrench, label: txn.equipment_name || 'Equipment' });
  }
  if (txn.related_work_order) {
    links.push({ to: '/admin/jobs', icon: ClipboardList, label: txn.related_work_order });
  }
  if (txn.audit_reference && /CA-/i.test(txn.audit_reference)) {
    links.push({ to: '/audits/corrective-actions', icon: ShieldAlert, label: txn.audit_reference });
  }

  if (links.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {links.map((link, i) => (
        <Link key={i} to={link.to} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
          <link.icon className="w-3 h-3" />
          {link.label}
        </Link>
      ))}
    </div>
  );
}