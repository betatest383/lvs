import { base44 } from '@/api/base44Client';
import {
  DollarSign, Truck, Briefcase, AlertTriangle,
  ClipboardList, ArrowLeftRight, Warehouse,
  ClipboardCheck, CheckSquare,
} from 'lucide-react';

const dateOnly = (d) => d ? String(d).split('T')[0] : '';

/**
 * Operations Manager Dashboard data loader.
 * KPIs: Revenue Today, Trucks Released, Jobs In Progress, Open Issues
 */
export async function loadOperationsManagerDashboard() {
  const [jobs, hardware, transfers, returns] = await Promise.all([
    base44.entities.Job.list('-service_date', 100),
    base44.entities.HardwareChecklist.list('-created_date', 30),
    base44.entities.MaterialTransferSheet.list('-created_date', 30),
    base44.entities.ReturnedMaterial.list('-created_date', 30),
  ]);

  const today = new Date().toLocaleDateString('en-CA');
  const inProgressJobs = jobs.filter(j => j.status === 'in_progress');
  const todayJobs = jobs.filter(j => dateOnly(j.service_date) === today);
  const pendingHardware = hardware.filter(h => h.status === 'Submitted');
  const incompleteTransfers = transfers.filter(t => t.status === 'Draft' || t.status === 'Submitted');

  const kpis = [
    { label: 'Revenue Today', value: 0, icon: DollarSign, color: 'bg-green-100 text-green-600' },
    { label: 'Trucks Released', value: 0, icon: Truck, color: 'bg-blue-100 text-blue-600' },
    { label: 'Jobs In Progress', value: inProgressJobs.length, icon: Briefcase, color: 'bg-amber-100 text-amber-600', to: '/admin/jobs' },
    { label: 'Open Issues', value: 0, icon: AlertTriangle, color: 'bg-red-100 text-red-600' },
  ];

  const tasks = [
    ...pendingHardware.slice(0, 4).map(h => ({
      title: `Hardware pending — ${h.technician || 'Unknown'}`,
      subtitle: h.truck_number ? `Truck ${h.truck_number}` : '',
      icon: ClipboardList,
      badge: 'Pending',
      badgeColor: 'bg-amber-100 text-amber-700',
      to: '/warehouse/hardware-checklists',
    })),
    ...incompleteTransfers.slice(0, 3).map(t => ({
      title: `Transfer pending — ${t.technician || 'Unknown'}`,
      subtitle: t.status,
      icon: ArrowLeftRight,
      badge: t.status,
      badgeColor: 'bg-indigo-100 text-indigo-700',
      to: '/warehouse/transfer-sheets',
    })),
    ...inProgressJobs.slice(0, 3).map(j => ({
      title: j.customer_name || 'Job in progress',
      subtitle: [j.address, j.city].filter(Boolean).join(', '),
      icon: Briefcase,
      badge: 'In Progress',
      badgeColor: 'bg-amber-100 text-amber-700',
      to: '/admin/jobs',
    })),
  ].slice(0, 10);

  const schedule = todayJobs.slice(0, 8).map(job => ({
    title: job.customer_name || 'Job',
    subtitle: [job.address, job.city].filter(Boolean).join(', '),
    date: job.service_date,
    to: '/admin/jobs',
  }));

  const quickActions = [
    { label: 'Review KPIs', to: '/', icon: CheckSquare, color: 'bg-blue-100 text-blue-600' },
    { label: 'Forms Center', to: '/forms', icon: ClipboardCheck, color: 'bg-green-100 text-green-600' },
    { label: 'Assign Task', to: '/admin/jobs', icon: Briefcase, color: 'bg-amber-100 text-amber-600' },
    { label: 'View Jobs', to: '/admin/jobs', icon: Briefcase, color: 'bg-indigo-100 text-indigo-600' },
    { label: 'Review Warehouse', to: '/warehouse', icon: Warehouse, color: 'bg-purple-100 text-purple-600' },
  ];

  const recentActivity = [
    ...jobs.slice(0, 5).map(j => ({
      title: j.customer_name || 'Job',
      subtitle: j.status?.replace(/_/g, ' '),
      timestamp: j.created_date,
      icon: Briefcase,
      to: '/admin/jobs',
    })),
    ...hardware.slice(0, 3).map(h => ({
      title: `Hardware — ${h.technician || 'Unknown'}`,
      subtitle: h.status,
      timestamp: h.created_date,
      icon: ClipboardList,
      to: '/warehouse/hardware-checklists',
    })),
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 8);

  return { kpis, tasks, schedule, quickActions, recentActivity };
}