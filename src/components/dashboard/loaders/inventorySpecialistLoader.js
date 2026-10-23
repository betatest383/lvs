import { base44 } from '@/api/base44Client';
import {
  Boxes, ClipboardCheck, FileText, MapPin, Package,
  AlertTriangle, ArrowLeftRight,
} from 'lucide-react';

/**
 * Inventory Specialist Dashboard data loader.
 * KPIs: Low Stock Items, Cycle Counts Due, Purchase Orders Pending, Unassigned Inventory
 */
export async function loadInventorySpecialistDashboard() {
  const [binRequests, returns, transfers] = await Promise.all([
    base44.entities.BinDesignationRequest.list('-created_date', 20),
    base44.entities.ReturnedMaterial.list('-created_date', 20),
    base44.entities.MaterialTransferSheet.list('-created_date', 20),
  ]);

  const pendingBins = binRequests.filter(b => b.status === 'Pending').length;

  const kpis = [
    { label: 'Low Stock Items', value: 0, icon: AlertTriangle, color: 'bg-red-100 text-red-600' },
    { label: 'Cycle Counts Due', value: 0, icon: ClipboardCheck, color: 'bg-amber-100 text-amber-600' },
    { label: 'Purchase Orders', value: 0, icon: FileText, color: 'bg-indigo-100 text-indigo-600' },
    { label: 'Unassigned Inv.', value: pendingBins, icon: Boxes, color: 'bg-purple-100 text-purple-600', to: '/warehouse/bin-requests' },
  ];

  const tasks = binRequests
    .filter(b => b.status === 'Pending')
    .slice(0, 8)
    .map(b => ({
      title: `Bin request — ${b.item_name || 'Unknown item'}`,
      subtitle: b.current_location ? `Currently: ${b.current_location}` : '',
      icon: MapPin,
      badge: 'Pending',
      badgeColor: 'bg-amber-100 text-amber-700',
      to: '/warehouse/bin-requests',
    }));

  const schedule = transfers
    .filter(t => t.date)
    .slice(0, 8)
    .map(t => ({
      title: `Transfer — ${t.technician || 'Unknown'}`,
      subtitle: t.truck_number ? `Truck ${t.truck_number}` : '',
      date: t.date,
      to: '/warehouse/transfer-sheets',
    }));

  const quickActions = [
    { label: 'Forms Center', to: '/forms', icon: ClipboardCheck, color: 'bg-blue-100 text-blue-600' },
    { label: 'Adjust Inventory', to: '/warehouse/transfer-sheets', icon: ArrowLeftRight, color: 'bg-amber-100 text-amber-600' },
    { label: 'Assign Bin', to: '/warehouse/bin-requests', icon: MapPin, color: 'bg-purple-100 text-purple-600' },
    { label: 'Create PO', to: '/warehouse', icon: FileText, color: 'bg-indigo-100 text-indigo-600' },
    { label: 'Run Cycle Count', to: '/warehouse/manager-review', icon: ClipboardCheck, color: 'bg-green-100 text-green-600' },
  ];

  const recentActivity = [
    ...binRequests.slice(0, 4).map(b => ({
      title: `Bin request — ${b.item_name || 'Item'}`,
      subtitle: b.status,
      timestamp: b.created_date,
      icon: MapPin,
      to: '/warehouse/bin-requests',
    })),
    ...returns.slice(0, 4).map(r => ({
      title: `Return — ${r.technician || 'Unknown'}`,
      subtitle: r.status,
      timestamp: r.created_date,
      icon: Package,
      to: '/warehouse/returned-materials',
    })),
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 8);

  return { kpis, tasks, schedule, quickActions, recentActivity };
}