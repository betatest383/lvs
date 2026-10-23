import { base44 } from '@/api/base44Client';
import {
  Briefcase, GraduationCap, ClipboardCheck, HardHat,
  MapPin, Camera, BookOpen, Calendar,
} from 'lucide-react';

const dateOnly = (d) => d ? String(d).split('T')[0] : '';

/**
 * Apprentice Dashboard data loader.
 * KPIs: Jobs Today, Training Due, Checklist Completion, Safety Tasks
 */
export async function loadApprenticeDashboard(user) {
  const allJobs = await base44.entities.Job.list('-service_date', 200);
  const jobs = allJobs.filter(j =>
    (j.technician_emails || []).includes(user.email) || j.technician_email === user.email
  );

  const today = new Date().toLocaleDateString('en-CA');
  const activeJobs = jobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled');
  const todayJobs = activeJobs.filter(j => dateOnly(j.service_date) === today);
  const upcomingJobs = activeJobs.filter(j => dateOnly(j.service_date) > today);

  const kpis = [
    { label: 'Jobs Today', value: todayJobs.length, icon: Briefcase, color: 'bg-blue-100 text-blue-600', to: '/tech/dashboard' },
    { label: 'Training Due', value: 0, icon: GraduationCap, color: 'bg-amber-100 text-amber-600' },
    { label: 'Checklist Done', value: 0, icon: ClipboardCheck, color: 'bg-green-100 text-green-600' },
    { label: 'Safety Tasks', value: 0, icon: HardHat, color: 'bg-red-100 text-red-600' },
  ];

  const tasks = todayJobs.slice(0, 10).map(job => ({
    title: job.customer_name || 'Unknown',
    subtitle: [job.address, job.city].filter(Boolean).join(', '),
    icon: MapPin,
    badge: 'Today',
    badgeColor: 'bg-blue-100 text-blue-700',
    to: `/tech/inspection?job_id=${job.id}`,
  }));

  const schedule = upcomingJobs.slice(0, 8).map(job => ({
    title: job.customer_name || 'Unknown',
    subtitle: [job.address, job.city].filter(Boolean).join(', '),
    date: job.service_date,
    to: `/tech/inspection?job_id=${job.id}`,
  }));

  const quickActions = [
    { label: "Today's Jobs", to: '/tech/dashboard', icon: Calendar, color: 'bg-blue-100 text-blue-600' },
    { label: 'Forms Center', to: '/forms', icon: ClipboardCheck, color: 'bg-green-100 text-green-600' },
    { label: 'Upload Photos', to: '/tech/inspection', icon: Camera, color: 'bg-amber-100 text-amber-600' },
    { label: 'View SOP', to: '/lvcos/sop-registry', icon: BookOpen, color: 'bg-teal-100 text-teal-600' },
    { label: 'Training', to: '/tech/resources', icon: GraduationCap, color: 'bg-purple-100 text-purple-600' },
  ];

  const recentActivity = [];

  return { kpis, tasks, schedule, quickActions, recentActivity };
}