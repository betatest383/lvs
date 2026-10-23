import { base44 } from '@/api/base44Client';
import {
  Receipt, Calculator, AlertTriangle, Phone,
  DollarSign, Briefcase,
} from 'lucide-react';

const dateOnly = (d) => d ? String(d).split('T')[0] : '';

/**
 * Office Manager Dashboard data loader.
 * KPIs: Deposits Pending, Payroll Tasks, Customer Escalations, CSR Queue
 */
export async function loadOfficeManagerDashboard() {
  const [invoices, estimates, customers, jobs] = await Promise.all([
    base44.entities.Invoice.list('-created_date', 30),
    base44.entities.Estimate.list('-created_date', 30),
    base44.entities.Customer.list('-created_date', 50),
    base44.entities.Job.list('-service_date', 50),
  ]);

  const today = new Date().toLocaleDateString('en-CA');
  const openInvoices = invoices.filter(inv => inv.status === 'open' || inv.status === 'overdue');
  const pendingEstimates = estimates.filter(e => e.status === 'pending' || e.status === 'sent');
  const todayJobs = jobs.filter(j => dateOnly(j.service_date) === today);

  const kpis = [
    { label: 'Deposits Pending', value: openInvoices.length, icon: DollarSign, color: 'bg-green-100 text-green-600', to: '/admin/invoices' },
    { label: 'Payroll Tasks', value: 0, icon: Receipt, color: 'bg-amber-100 text-amber-600' },
    { label: 'Escalations', value: 0, icon: AlertTriangle, color: 'bg-red-100 text-red-600' },
    { label: 'CSR Queue', value: 0, icon: Phone, color: 'bg-blue-100 text-blue-600' },
  ];

  const tasks = [
    ...openInvoices.slice(0, 5).map(inv => ({
      title: inv.title || 'Invoice due',
      subtitle: 'Payment pending',
      icon: Receipt,
      badge: inv.status === 'overdue' ? 'Overdue' : 'Due',
      badgeColor: inv.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700',
      to: '/admin/invoices',
    })),
    ...pendingEstimates.slice(0, 5).map(est => ({
      title: est.title || 'Estimate pending',
      subtitle: 'Review & approve',
      icon: Calculator,
      badge: 'Pending',
      badgeColor: 'bg-amber-100 text-amber-700',
      to: '/admin/estimates',
    })),
  ].slice(0, 10);

  const schedule = todayJobs.slice(0, 8).map(job => ({
    title: job.customer_name || 'Job',
    subtitle: [job.address, job.city].filter(Boolean).join(', '),
    date: job.service_date,
    to: '/admin/jobs',
  }));

  const quickActions = [
    { label: 'Review Deposits', to: '/admin/invoices', icon: DollarSign, color: 'bg-green-100 text-green-600' },
    { label: 'Forms Center', to: '/forms', icon: Receipt, color: 'bg-amber-100 text-amber-600' },
    { label: 'Assign Task', to: '/admin/jobs', icon: Briefcase, color: 'bg-blue-100 text-blue-600' },
    { label: 'CSR Queue', to: '/admin/customers', icon: Phone, color: 'bg-indigo-100 text-indigo-600' },
  ];

  const recentActivity = [
    ...invoices.slice(0, 4).map(inv => ({
      title: inv.title || 'Invoice',
      subtitle: inv.status,
      timestamp: inv.created_date,
      icon: Receipt,
      to: '/admin/invoices',
    })),
    ...estimates.slice(0, 4).map(est => ({
      title: est.title || 'Estimate',
      subtitle: est.status,
      timestamp: est.created_date,
      icon: Calculator,
      to: '/admin/estimates',
    })),
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 8);

  return { kpis, tasks, schedule, quickActions, recentActivity };
}