import { base44 } from '@/api/base44Client';
import {
  Briefcase, Package, Calculator, Camera,
  MapPin, ClipboardCheck,
} from 'lucide-react';

const dateOnly = (d) => d ? String(d).split('T')[0] : '';

/**
 * Lead Technician Dashboard data loader.
 * KPIs: Jobs Today, Materials Ready, Open Estimates, Photo Compliance
 */
export async function loadLeadTechnicianDashboard(user) {
  const [allJobs, estimates] = await Promise.all([
    base44.entities.Job.list('-service_date', 200),
    base44.entities.Estimate.list('-created_date', 20),
  ]);

  const jobs = allJobs.filter(j =>
    (j.technician_emails || []).includes(user.email) || j.technician_email === user.email
  );

  const today = new Date().toLocaleDateString('en-CA');
  const activeJobs = jobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled');
  const todayJobs = activeJobs.filter(j => dateOnly(j.service_date) === today);
  const openEstimates = estimates.filter(e => e.status === 'pending' || e.status === 'sent');

  const kpis = [
    { label: 'Jobs Today', value: todayJobs.length, icon: Briefcase, color: 'bg-blue-100 text-blue-600', to: '/tech/dashboard' },
    { label: 'Materials Ready', value: 0, icon: Package, color: 'bg-green-100 text-green-600' },
    { label: 'Open Estimates', value: openEstimates.length, icon: Calculator, color: 'bg-amber-100 text-amber-600', to: '/admin/estimates' },
    { label: 'Photo Compliance', value: 0, icon: Camera, color: 'bg-purple-100 text-purple-600' },
  ];

  const tasks = todayJobs.slice(0, 10).map(job => ({
    title: job.customer_name || 'Unknown',
    subtitle: [job.address, job.city].filter(Boolean).join(', '),
    icon: MapPin,
    badge: 'Today',
    badgeColor: 'bg-blue-100 text-blue-700',
    to: `/tech/inspection?job_id=${job.id}`,
  }));

  const upcomingJobs = activeJobs.filter(j => dateOnly(j.service_date) > today);
  const schedule = upcomingJobs.slice(0, 8).map(job => ({
    title: job.customer_name || 'Unknown',
    subtitle: [job.address, job.city].filter(Boolean).join(', '),
    date: job.service_date,
    to: `/tech/inspection?job_id=${job.id}`,
  }));

  const quickActions = [
    { label: 'Start Job', to: '/tech/inspection-select', icon: Briefcase, color: 'bg-blue-100 text-blue-600' },
    { label: 'Forms Center', to: '/forms', icon: ClipboardCheck, color: 'bg-amber-100 text-amber-600' },
    { label: 'Complete Inspection', to: '/tech/inspection-select', icon: ClipboardCheck, color: 'bg-green-100 text-green-600' },
    { label: 'Create Estimate', to: '/admin/estimates', icon: Calculator, color: 'bg-purple-100 text-purple-600' },
    { label: 'Request Materials', to: '/warehouse/hardware-checklists', icon: Package, color: 'bg-indigo-100 text-indigo-600' },
  ];

  const completedJobs = jobs.filter(j => j.status === 'completed');
  const recentActivity = completedJobs.slice(0, 8).map(job => ({
    title: job.customer_name || 'Job',
    subtitle: 'Completed',
    timestamp: job.created_date,
    icon: ClipboardCheck,
    to: '/tech/reports',
  }));

  return { kpis, tasks, schedule, quickActions, recentActivity };
}