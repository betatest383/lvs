import { base44 } from '@/api/base44Client';
import {
  DollarSign, Percent, Users, GraduationCap,
  FileStack, Workflow, PackageCheck, KanbanSquare,
  FileText, CheckSquare,
} from 'lucide-react';

/**
 * Director of Operations Dashboard data loader.
 * KPIs: Revenue MTD, Gross Margin, Labor Utilization, Training Completion
 */
export async function loadDirectorOfOperationsDashboard() {
  const [sops, workflows, packs, jobs, invoices] = await Promise.all([
    base44.entities.SopRegistry.list('-updated_date', 50),
    base44.entities.WorkflowRegistry.list('-updated_date', 50),
    base44.entities.ProcessPack.list('-updated_date', 30),
    base44.entities.Job.list('-created_date', 50),
    base44.entities.Invoice.list('-created_date', 50),
  ]);

  const kpis = [
    { label: 'Revenue MTD', value: 0, icon: DollarSign, color: 'bg-green-100 text-green-600' },
    { label: 'Gross Margin', value: 0, icon: Percent, color: 'bg-blue-100 text-blue-600' },
    { label: 'Labor Utilization', value: 0, icon: Users, color: 'bg-amber-100 text-amber-600' },
    { label: 'Training Completion', value: 0, icon: GraduationCap, color: 'bg-purple-100 text-purple-600' },
  ];

  const sopsNeedingReview = sops.filter(s => s.status === 'In Review' || s.lifecycle_stage === 'Review');
  const workflowsInDev = workflows.filter(w => w.status === 'In Development' || w.status === 'Testing');
  const packsInDev = packs.filter(p => p.status === 'In Development' || p.status === 'Planned');

  const tasks = [
    ...sopsNeedingReview.slice(0, 4).map(s => ({
      title: `SOP review — ${s.title || s.sop_id}`,
      subtitle: s.department,
      icon: FileStack,
      badge: 'Review',
      badgeColor: 'bg-amber-100 text-amber-700',
      to: '/lvcos/sop-registry',
    })),
    ...workflowsInDev.slice(0, 3).map(w => ({
      title: `Workflow — ${w.title || w.workflow_id}`,
      subtitle: w.status,
      icon: Workflow,
      badge: w.status,
      badgeColor: 'bg-indigo-100 text-indigo-700',
      to: '/lvcos/workflow-registry',
    })),
    ...packsInDev.slice(0, 3).map(p => ({
      title: `Process pack — ${p.title || p.pack_id}`,
      subtitle: p.status,
      icon: PackageCheck,
      badge: p.status,
      badgeColor: 'bg-purple-100 text-purple-700',
      to: '/lvcos/process-packs',
    })),
  ].slice(0, 10);

  const upcomingReviews = sops
    .filter(s => s.next_review_date)
    .sort((a, b) => new Date(a.next_review_date) - new Date(b.next_review_date))
    .slice(0, 8);

  const schedule = upcomingReviews.map(s => ({
    title: s.title || s.sop_id,
    subtitle: s.department,
    date: s.next_review_date,
    to: '/lvcos/sop-registry',
  }));

  const quickActions = [
    { label: 'Forms Center', to: '/forms', icon: FileText, color: 'bg-blue-100 text-blue-600' },
    { label: 'Process Packs', to: '/lvcos/process-packs', icon: PackageCheck, color: 'bg-purple-100 text-purple-600' },
    { label: 'Release Board', to: '/lvcos/status-board', icon: KanbanSquare, color: 'bg-amber-100 text-amber-600' },
    { label: 'Approve Change', to: '/lvcos/sop-registry', icon: CheckSquare, color: 'bg-green-100 text-green-600' },
  ];

  const recentActivity = [
    ...sops.slice(0, 4).map(s => ({
      title: `SOP — ${s.title || s.sop_id}`,
      subtitle: s.lifecycle_stage || s.status,
      timestamp: s.updated_date || s.created_date,
      icon: FileStack,
      to: '/lvcos/sop-registry',
    })),
    ...workflows.slice(0, 4).map(w => ({
      title: `Workflow — ${w.title || w.workflow_id}`,
      subtitle: w.status,
      timestamp: w.updated_date || w.created_date,
      icon: Workflow,
      to: '/lvcos/workflow-registry',
    })),
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 8);

  return { kpis, tasks, schedule, quickActions, recentActivity };
}