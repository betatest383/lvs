import { base44 } from '@/api/base44Client';
import {
  Truck, ClipboardList, ArrowLeftRight, Undo2, Sparkles,
  MapPin, Package, ClipboardCheck,
} from 'lucide-react';

/**
 * Warehouse Associate Dashboard data loader.
 * KPIs: Trucks Waiting, Hardware Checklists Pending, Transfer Sheets Pending, Returns Waiting
 */
export async function loadWarehouseAssociateDashboard() {
  const [hardware, transfers, returns, cleanup] = await Promise.all([
    base44.entities.HardwareChecklist.list('-created_date', 50),
    base44.entities.MaterialTransferSheet.list('-created_date', 50),
    base44.entities.ReturnedMaterial.list('-created_date', 50),
    base44.entities.WarehouseCleanup.list('-created_date', 20),
  ]);

  const pendingHardware = hardware.filter(h => h.status === 'Submitted').length;
  const pendingTransfers = transfers.filter(t => t.status === 'Draft' || t.status === 'Submitted').length;
  const waitingReturns = returns.filter(r => r.status === 'Received').length;
  const incompleteCleanup = cleanup.filter(c => c.status === 'Incomplete').length;

  const kpis = [
    { label: 'Trucks Waiting', value: 0, icon: Truck, color: 'bg-blue-100 text-blue-600', to: '/warehouse' },
    { label: 'Hardware Pending', value: pendingHardware, icon: ClipboardList, color: 'bg-amber-100 text-amber-600', to: '/warehouse/hardware-checklists' },
    { label: 'Transfers Pending', value: pendingTransfers, icon: ArrowLeftRight, color: 'bg-indigo-100 text-indigo-600', to: '/warehouse/transfer-sheets' },
    { label: 'Returns Waiting', value: waitingReturns, icon: Undo2, color: 'bg-purple-100 text-purple-600', to: '/warehouse/returned-materials' },
  ];

  const tasks = [
    ...hardware.filter(h => h.status === 'Submitted').slice(0, 4).map(h => ({
      title: `Hardware checklist — ${h.technician || 'Unknown'}`,
      subtitle: h.truck_number ? `Truck ${h.truck_number}` : '',
      icon: ClipboardList,
      badge: 'Pending',
      badgeColor: 'bg-amber-100 text-amber-700',
      to: '/warehouse/hardware-checklists',
    })),
    ...cleanup.filter(c => c.status === 'Incomplete').slice(0, 3).map(c => ({
      title: 'Cleanup incomplete',
      subtitle: c.completed_by ? `By ${c.completed_by}` : '',
      icon: Sparkles,
      badge: 'Incomplete',
      badgeColor: 'bg-red-100 text-red-700',
      to: '/warehouse/cleanup',
    })),
    ...returns.filter(r => r.status === 'Received').slice(0, 3).map(r => ({
      title: `Return to verify — ${r.technician || 'Unknown'}`,
      subtitle: r.materials_returned || '',
      icon: Undo2,
      badge: 'Received',
      badgeColor: 'bg-purple-100 text-purple-700',
      to: '/warehouse/returned-materials',
    })),
  ].slice(0, 10);

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
    { label: 'Pull Materials', to: '/warehouse/hardware-checklists', icon: Package, color: 'bg-blue-100 text-blue-600' },
    { label: 'Receive Returns', to: '/warehouse/returned-materials', icon: Undo2, color: 'bg-purple-100 text-purple-600' },
    { label: 'Forms Center', to: '/forms', icon: ClipboardList, color: 'bg-green-100 text-green-600' },
    { label: 'Submit Bin Request', to: '/warehouse/bin-requests', icon: MapPin, color: 'bg-amber-100 text-amber-600' },
    { label: 'View SOP', to: '/lvcos/sop-registry', icon: ClipboardCheck, color: 'bg-teal-100 text-teal-600' },
  ];

  const recentActivity = [
    ...hardware.slice(0, 3).map(h => ({
      title: `Hardware checklist — ${h.technician || 'Unknown'}`,
      subtitle: h.status,
      timestamp: h.created_date,
      icon: ClipboardList,
      to: '/warehouse/hardware-checklists',
    })),
    ...transfers.slice(0, 3).map(t => ({
      title: `Transfer — ${t.technician || 'Unknown'}`,
      subtitle: t.status,
      timestamp: t.created_date,
      icon: ArrowLeftRight,
      to: '/warehouse/transfer-sheets',
    })),
    ...returns.slice(0, 2).map(r => ({
      title: `Return — ${r.technician || 'Unknown'}`,
      subtitle: r.status,
      timestamp: r.created_date,
      icon: Undo2,
      to: '/warehouse/returned-materials',
    })),
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 8);

  return { kpis, tasks, schedule, quickActions, recentActivity };
}