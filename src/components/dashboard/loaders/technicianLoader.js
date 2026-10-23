import { base44 } from '@/api/base44Client';
import {
  Briefcase, AlertTriangle, Calendar, CheckCircle2,
  Home, TreePine, Package, BookOpen, MapPin, ClipboardCheck,
} from 'lucide-react';

const dateOnly = (d) => d ? String(d).split('T')[0] : '';

/**
 * Technician Dashboard data loader.
 * Returns widget-formatted data for the Home Screen Layout.
 */
export async function loadTechnicianDashboard(user) {
  const allJobs = await base44.entities.Job.list('-service_date', 200);
  const jobs = allJobs.filter(j =>
    (j.technician_emails || []).includes(user.email) || j.technician_email === user.email
  );

  const today = new Date().toLocaleDateString('en-CA');
  const activeJobs = jobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled');
  const todayJobs = activeJobs.filter(j => dateOnly(j.service_date) === today);
  const upcomingJobs = activeJobs.filter(j => dateOnly(j.service_date) > today);
  const overdueJobs = activeJobs.filter(j => dateOnly(j.service_date) < today);
  const completedJobs = jobs.filter(j => j.status === 'completed');

  // KPIs
  const kpis = [
    { label: "Today", value: todayJobs.length, icon: Briefcase, color: 'bg-blue-100 text-blue-600', to: '/tech/dashboard' },
    { label: 'Overdue', value: overdueJobs.length, icon: AlertTriangle, color: 'bg-amber-100 text-amber-600' },
    { label: 'Upcoming', value: upcomingJobs.length, icon: Calendar, color: 'bg-indigo-100 text-indigo-600' },
    { label: 'Completed', value: completedJobs.length, icon: CheckCircle2, color: 'bg-green-100 text-green-600' },
  ];

  // Tasks — overdue + today's active jobs
  const tasks = [
    ...overdueJobs.slice(0, 5).map(job => ({
      title: job.customer_name || 'Unknown',
      subtitle: [job.address, job.city].filter(Boolean).join(', '),
      icon: AlertTriangle,
      badge: 'Overdue',
      badgeColor: 'bg-red-100 text-red-700',
      to: `/tech/inspection?job_id=${job.id}`,
    })),
    ...todayJobs.slice(0, 5).map(job => ({
      title: job.customer_name || 'Unknown',
      subtitle: [job.address, job.city].filter(Boolean).join(', '),
      icon: MapPin,
      badge: 'Today',
      badgeColor: 'bg-blue-100 text-blue-700',
      to: `/tech/inspection?job_id=${job.id}`,
    })),
  ].slice(0, 10);

  // Schedule — upcoming jobs (next 7 days)
  const schedule = upcomingJobs.slice(0, 8).map(job => ({
    title: job.customer_name || 'Unknown',
    subtitle: [job.address, job.city].filter(Boolean).join(', '),
    date: job.service_date,
    to: `/tech/inspection?job_id=${job.id}`,
  }));

  // Quick Actions
  const quickActions = [
    { label: 'Interior', to: '/tech/inspection', icon: Home, color: 'bg-amber-100 text-amber-600' },
    { label: 'Forms', to: '/forms', icon: ClipboardCheck, color: 'bg-sky-100 text-sky-600' },
    { label: 'Equipment', to: '/tech/equipment', icon: Package, color: 'bg-indigo-100 text-indigo-600' },
    { label: 'Resources', to: '/tech/resources', icon: BookOpen, color: 'bg-green-100 text-green-600' },
  ];

  // Recent Activity — recently completed jobs
  const recentActivity = completedJobs.slice(0, 8).map(job => ({
    title: job.customer_name || 'Job',
    subtitle: 'Inspection completed',
    timestamp: job.created_date,
    icon: ClipboardCheck,
    to: '/tech/reports',
  }));

  return { kpis, tasks, schedule, quickActions, recentActivity };
}