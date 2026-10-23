import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

export function getHealthColor(score) {
  if (score >= 80) return { bg: 'bg-green-50', text: 'text-green-700', bar: 'bg-green-500', dot: 'bg-green-500', label: 'Healthy' };
  if (score >= 60) return { bg: 'bg-yellow-50', text: 'text-yellow-700', bar: 'bg-yellow-500', dot: 'bg-yellow-500', label: 'Needs Attention' };
  return { bg: 'bg-red-50', text: 'text-red-700', bar: 'bg-red-500', dot: 'bg-red-500', label: 'Critical' };
}

export function getStatusColor(status) {
  const colors = {
    green: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
    yellow: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
    red: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  };
  return colors[status] || colors.green;
}

export function useOperationsData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().split('T')[0];

      const results = await Promise.allSettled([
        base44.entities.Job.list('-created_date', 500),
        base44.entities.BusinessProcess.list('-created_date', 500),
        base44.entities.SopRegistry.list('-created_date', 500),
        base44.entities.KpiRegistry.list('-created_date', 500),
        base44.entities.MorningMaterialRequest.list('-created_date', 100),
        base44.entities.InspectionReport.list('-created_date', 100),
      ]);

      const jobs = results[0].status === 'fulfilled' ? results[0].value : [];
      const bps = results[1].status === 'fulfilled' ? results[1].value : [];
      const sops = results[2].status === 'fulfilled' ? results[2].value : [];
      const kpis = results[3].status === 'fulfilled' ? results[3].value : [];
      const mmrs = results[4].status === 'fulfilled' ? results[4].value : [];
      const reports = results[5].status === 'fulfilled' ? results[5].value : [];

      const jobsToday = jobs.filter(j => j.service_date === today);
      const jobsCompleted = jobs.filter(j => j.status === 'completed');
      const overdueReviews = sops.filter(s => s.next_review_date && s.next_review_date < today);
      const sopsNeedingApproval = sops.filter(s => s.status === 'In Review' || s.status === 'Draft');
      const approvedSops = sops.filter(s => s.status === 'Approved');
      const sopCompliance = sops.length > 0 ? Math.round((approvedSops.length / sops.length) * 100) : 100;

      const trucksReleased = mmrs.filter(m => m.status === 'Truck Released');
      const warehouseReadiness = mmrs.length > 0 ? Math.round((trucksReleased.length / mmrs.length) * 100) : 100;

      const issues = [];
      overdueReviews.slice(0, 10).forEach(s => issues.push({
        title: `${s.sop_id || 'SOP'} — ${s.title} review overdue`,
        type: 'Overdue Review', severity: 'high', link: '/lvcos/sop-registry',
      }));
      sopsNeedingApproval.slice(0, 10).forEach(s => issues.push({
        title: `${s.sop_id || 'SOP'} — ${s.title} awaiting approval`,
        type: 'Missing Approval', severity: 'medium', link: '/lvcos/sop-registry',
      }));
      // Placeholder issues — will be replaced with real data sources
      issues.push({ title: 'Inventory shortage for 8" liner', type: 'Inventory Shortage', severity: 'high', link: '/warehouse' });
      issues.push({ title: 'Two customer escalations awaiting review', type: 'Customer Escalation', severity: 'high', link: '/admin/customers' });
      issues.push({ title: 'Payroll approvals due today', type: 'Payroll', severity: 'medium', link: '/tech/hr' });
      issues.push({ title: 'One technician has overdue training', type: 'Training', severity: 'medium', link: '/tech/hr' });

      const severityRank = { high: 0, medium: 1, low: 2 };
      issues.sort((a, b) => (severityRank[a.severity] || 2) - (severityRank[b.severity] || 2));

      const healthMetrics = {
        revenue: { score: 85, label: 'Revenue Goal', weight: 0.15 },
        technicianProductivity: { score: 88, label: 'Technician Productivity', weight: 0.15 },
        warehouseReadiness: { score: warehouseReadiness, label: 'Warehouse Readiness', weight: 0.15 },
        openCriticalIssues: { score: Math.max(0, 100 - issues.length * 8), label: 'Open Critical Issues', weight: 0.10 },
        customerSatisfaction: { score: 96, label: 'Customer Satisfaction', weight: 0.15 },
        sopCompliance: { score: sopCompliance, label: 'SOP Compliance', weight: 0.10 },
        trainingCompletion: { score: 82, label: 'Training Completion', weight: 0.10 },
        inventoryAccuracy: { score: 95, label: 'Inventory Accuracy', weight: 0.10 },
      };

      const healthScore = Math.round(
        Object.values(healthMetrics).reduce((sum, m) => sum + m.score * m.weight, 0)
      );

      setData({
        healthScore, healthMetrics,
        jobsScheduledToday: jobsToday.length,
        jobsCompleted: jobsCompleted.length,
        openCriticalIssues: issues.length,
        businessProcesses: bps,
        sops, kpiRegistry: kpis, mmrs, reports,
        issues, overdueReviews,
        warehouseReadiness,
        trucksReady: trucksReleased.length,
        trucksTotal: mmrs.length,
        techniciansWorking: jobsToday.filter(j => j.status === 'in_progress').length,
        crewsAvailable: 6,
        todayRevenue: 24500,
        customerSatisfaction: 96,
        trainingCompletion: 82,
        inventoryAccuracy: 95,
        yesterday: {
          revenue: 22100, averageTicket: 585, closeRate: 68,
          callbacks: 3, customerReviews: 4.8, trainingCompleted: 82,
          inventoryAccuracy: 95, truckDepartureTime: '7:42 AM',
        },
        goals: {
          revenue: 30000, averageTicket: 600, closeRate: 70,
          callbacks: 5, inventoryAccuracy: 99,
          truckDepartureTime: '7:30 AM', trainingCompletion: 90,
        },
      });
      setLoading(false);
    };
    load();
  }, []);

  return { data, loading };
}