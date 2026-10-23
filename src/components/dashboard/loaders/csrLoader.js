import { base44 } from '@/api/base44Client';
import {
  Phone, Calendar, Calculator, Crown,
  Briefcase, Users, DollarSign, Clock, UserPlus,
} from 'lucide-react';

const dateOnly = (d) => d ? String(d).split('T')[0] : '';

/**
 * CSR Dashboard data loader.
 * KPIs: Calls Today, Booking Rate, Follow-Ups Due, Membership Renewals
 */
export async function loadCsrDashboard() {
  const [jobs, estimates, customers, memberships] = await Promise.all([
    base44.entities.Job.list('-created_date', 50),
    base44.entities.Estimate.list('-created_date', 30),
    base44.entities.Customer.list('-created_date', 50),
    base44.entities.Membership.list('-created_date', 30),
  ]);

  const scheduledJobs = jobs.filter(j => j.status === 'scheduled');
  const pendingEstimates = estimates.filter(e => e.status === 'pending' || e.status === 'sent');

  const kpis = [
    { label: 'Calls Today', value: 0, icon: Phone, color: 'bg-blue-100 text-blue-600' },
    { label: 'Booking Rate', value: 0, icon: Calendar, color: 'bg-green-100 text-green-600' },
    { label: 'Follow-Ups Due', value: pendingEstimates.length, icon: Clock, color: 'bg-amber-100 text-amber-600', to: '/admin/estimates' },
    { label: 'Membership Renewals', value: 0, icon: Crown, color: 'bg-purple-100 text-purple-600' },
  ];

  const tasks = [
    ...pendingEstimates.slice(0, 5).map(est => ({
      title: est.title || 'Estimate follow-up',
      subtitle: 'Contact customer',
      icon: Calculator,
      badge: 'Follow-Up',
      badgeColor: 'bg-amber-100 text-amber-700',
      to: '/admin/estimates',
    })),
    ...scheduledJobs.slice(0, 5).map(job => ({
      title: job.customer_name || 'Scheduled job',
      subtitle: job.service_date,
      icon: Briefcase,
      badge: 'Scheduled',
      badgeColor: 'bg-blue-100 text-blue-700',
      to: '/admin/jobs',
    })),
  ].slice(0, 10);

  const schedule = scheduledJobs.slice(0, 8).map(job => ({
    title: job.customer_name || 'Appointment',
    subtitle: [job.address, job.city].filter(Boolean).join(', '),
    date: job.service_date,
    to: '/admin/jobs',
  }));

  const quickActions = [
    { label: 'Schedule Appt', to: '/admin/jobs', icon: Calendar, color: 'bg-blue-100 text-blue-600' },
    { label: 'Forms Center', to: '/forms', icon: Phone, color: 'bg-amber-100 text-amber-600' },
    { label: 'Send Estimate', to: '/admin/estimates', icon: Calculator, color: 'bg-purple-100 text-purple-600' },
    { label: 'Collect Deposit', to: '/admin/invoices', icon: DollarSign, color: 'bg-green-100 text-green-600' },
    { label: 'Create Follow-Up', to: '/admin/customers', icon: UserPlus, color: 'bg-indigo-100 text-indigo-600' },
  ];

  const recentActivity = [
    ...jobs.slice(0, 5).map(j => ({
      title: j.customer_name || 'Job',
      subtitle: j.status?.replace(/_/g, ' '),
      timestamp: j.created_date,
      icon: Briefcase,
      to: '/admin/jobs',
    })),
    ...customers.slice(0, 3).map(c => ({
      title: c.name || 'Customer',
      subtitle: 'Added',
      timestamp: c.created_date,
      icon: Users,
      to: '/admin/customers',
    })),
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 8);

  return { kpis, tasks, schedule, quickActions, recentActivity };
}