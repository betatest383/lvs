import { base44 } from '@/api/base44Client';
import {
  Briefcase, FileText, Calculator, Receipt,
  CalendarPlus, ShoppingBag, Crown,
} from 'lucide-react';

const dateOnly = (d) => d ? String(d).split('T')[0] : '';

/**
 * Customer Dashboard data loader.
 * Returns widget-formatted data for the Home Screen Layout.
 */
export async function loadCustomerDashboard(user) {
  // Find the customer record matching the logged-in user's email
  const customers = await base44.entities.Customer.filter({
    $or: [
      { email: user.email },
      { portal_user_email: user.email },
    ],
  });
  const customer = customers[0];

  if (!customer) {
    return {
      kpis: [
        { label: 'Jobs', value: 0, icon: Briefcase, color: 'bg-blue-100 text-blue-600', to: '/customer/jobs' },
        { label: 'Reports', value: 0, icon: FileText, color: 'bg-purple-100 text-purple-600', to: '/customer/reports' },
        { label: 'Estimates', value: 0, icon: Calculator, color: 'bg-amber-100 text-amber-600', to: '/customer/estimates' },
        { label: 'Invoices', value: 0, icon: Receipt, color: 'bg-green-100 text-green-600', to: '/customer/invoices' },
      ],
      tasks: [],
      schedule: [],
      quickActions: [
        { label: 'Book Job', to: '/customer/book', icon: CalendarPlus, color: 'bg-blue-100 text-blue-600' },
        { label: 'Reports', to: '/customer/reports', icon: FileText, color: 'bg-purple-100 text-purple-600' },
        { label: 'Store', to: '/customer/store', icon: ShoppingBag, color: 'bg-green-100 text-green-600' },
        { label: 'Membership', to: '/customer/membership', icon: Crown, color: 'bg-pink-100 text-pink-600' },
      ],
      recentActivity: [],
    };
  }

  const [jobs, reports, estimates, invoices] = await Promise.all([
    base44.entities.Job.filter({ customer_id: customer.id }),
    base44.entities.InspectionReport.filter({ customer_id: customer.id }),
    base44.entities.Estimate.filter({ customer_id: customer.id }),
    base44.entities.Invoice.filter({ customer_id: customer.id }),
  ]);

  const today = new Date().toLocaleDateString('en-CA');
  const activeJobs = jobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled');
  const upcomingJobs = activeJobs.filter(j => dateOnly(j.service_date) >= today);

  // KPIs
  const kpis = [
    { label: 'Active Jobs', value: activeJobs.length, icon: Briefcase, color: 'bg-blue-100 text-blue-600', to: '/customer/jobs' },
    { label: 'Reports', value: reports.length, icon: FileText, color: 'bg-purple-100 text-purple-600', to: '/customer/reports' },
    { label: 'Estimates', value: estimates.length, icon: Calculator, color: 'bg-amber-100 text-amber-600', to: '/customer/estimates' },
    { label: 'Invoices', value: invoices.length, icon: Receipt, color: 'bg-green-100 text-green-600', to: '/customer/invoices' },
  ];

  // Tasks — pending estimates + unpaid invoices
  const pendingEstimates = estimates.filter(e => e.status === 'pending' || e.status === 'sent');
  const unpaidInvoices = invoices.filter(inv => inv.status === 'open' || inv.status === 'overdue');
  const tasks = [
    ...pendingEstimates.slice(0, 5).map(est => ({
      title: est.title || 'Estimate Ready',
      subtitle: 'Review & approve',
      icon: Calculator,
      badge: 'Pending',
      badgeColor: 'bg-amber-100 text-amber-700',
      to: '/customer/estimates',
    })),
    ...unpaidInvoices.slice(0, 5).map(inv => ({
      title: inv.title || 'Invoice Due',
      subtitle: 'Payment pending',
      icon: Receipt,
      badge: inv.status === 'overdue' ? 'Overdue' : 'Due',
      badgeColor: inv.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700',
      to: '/customer/invoices',
    })),
  ].slice(0, 10);

  // Schedule — upcoming jobs
  const schedule = upcomingJobs.slice(0, 8).map(job => ({
    title: job.job_type ? job.job_type.replace(/_/g, ' ') : 'Appointment',
    subtitle: [job.address, job.city].filter(Boolean).join(', '),
    date: job.service_date,
    to: '/customer/jobs',
  }));

  // Quick Actions
  const quickActions = [
    { label: 'Book Job', to: '/customer/book', icon: CalendarPlus, color: 'bg-blue-100 text-blue-600' },
    { label: 'Reports', to: '/customer/reports', icon: FileText, color: 'bg-purple-100 text-purple-600' },
    { label: 'Store', to: '/customer/store', icon: ShoppingBag, color: 'bg-green-100 text-green-600' },
    { label: 'Membership', to: '/customer/membership', icon: Crown, color: 'bg-pink-100 text-pink-600' },
  ];

  // Recent Activity — merge reports + estimates
  const recentActivity = [
    ...reports.slice(0, 5).map(r => ({
      title: r.address || 'Inspection Report',
      subtitle: 'Report published',
      timestamp: r.created_date,
      icon: FileText,
      to: '/customer/reports',
    })),
    ...estimates.slice(0, 3).map(e => ({
      title: e.title || 'Estimate',
      subtitle: 'Estimate created',
      timestamp: e.created_date,
      icon: Calculator,
      to: '/customer/estimates',
    })),
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 8);

  return { kpis, tasks, schedule, quickActions, recentActivity };
}