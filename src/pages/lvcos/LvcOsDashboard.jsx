import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, GitBranch, Shield, Building2, CheckCircle2, FileEdit, Eye, Workflow, Zap, GraduationCap, CalendarClock, Network } from 'lucide-react';

export default function LvcOsDashboard() {
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [upcoming, setUpcoming] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const recs = await base44.entities.SopRegistry.list('-created_date', 500);
        const today = new Date();
        const in30 = new Date(today);
        in30.setDate(in30.getDate() + 30);

        const upcomingReviews = recs
          .filter(r => r.next_review_date && new Date(r.next_review_date) >= today && new Date(r.next_review_date) <= in30)
          .sort((a, b) => new Date(a.next_review_date) - new Date(b.next_review_date));

        let bpCount = 0;
        try {
          const bps = await base44.entities.BusinessProcess.list('-created_date', 500);
          bpCount = bps.length;
        } catch (e) { /* entity may not be ready yet */ }

        setStats({
          total: recs.length,
          businessProcesses: bpCount,
          processes: recs.filter(r => r.type === 'Process').length,
          policies: recs.filter(r => r.type === 'Policy').length,
          company: recs.filter(r => r.type === 'Company').length,
          approved: recs.filter(r => r.status === 'Approved').length,
          draft: recs.filter(r => r.status === 'Draft').length,
          needsReview: recs.filter(r => r.status === 'In Review').length,
          workflowsLive: recs.filter(r => r.workflow_status === 'Live').length,
          automationsBuilt: recs.filter(r => r.automation_required).length,
          trainingRequired: recs.filter(r => r.training_required).length,
        });
        setUpcoming(upcomingReviews);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const cards = [
    { label: 'Total SOPs', value: stats.total, icon: FileText, to: '/lvcos/sop-registry', color: 'text-blue-600 bg-blue-50' },
    { label: 'Business Processes', value: stats.businessProcesses, icon: Network, to: '/lvcos/business-process-registry', color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Processes', value: stats.processes, icon: GitBranch, to: '/lvcos/sop-registry', color: 'text-indigo-600 bg-indigo-50' },
    { label: 'Policies', value: stats.policies, icon: Shield, to: '/lvcos/policy-registry', color: 'text-purple-600 bg-purple-50' },
    { label: 'Company Docs', value: stats.company, icon: Building2, to: '/lvcos/sop-registry', color: 'text-cyan-600 bg-cyan-50' },
    { label: 'Approved', value: stats.approved, icon: CheckCircle2, to: '/lvcos/sop-registry', color: 'text-green-600 bg-green-50' },
    { label: 'Draft', value: stats.draft, icon: FileEdit, to: '/lvcos/sop-registry', color: 'text-gray-600 bg-gray-50' },
    { label: 'Needs Review', value: stats.needsReview, icon: Eye, to: '/lvcos/sop-registry', color: 'text-amber-600 bg-amber-50' },
    { label: 'Workflows Live', value: stats.workflowsLive, icon: Workflow, to: '/lvcos/workflow-registry', color: 'text-teal-600 bg-teal-50' },
    { label: 'Automations', value: stats.automationsBuilt, icon: Zap, to: '/lvcos/automation-registry', color: 'text-orange-600 bg-orange-50' },
    { label: 'Training Req\'d', value: stats.trainingRequired, icon: GraduationCap, to: '/lvcos/sop-registry', color: 'text-pink-600 bg-pink-50' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">LVC OS Registry</h1>
        <p className="text-muted-foreground text-sm">
          Master database for every operational asset in the Lehigh Valley Chimney Operating System.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {cards.map((card, i) => (
              <Link key={i} to={card.to}>
                <Card className="border shadow-sm hover:shadow-md transition-shadow h-full">
                  <CardContent className="p-4">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${card.color}`}>
                      <card.icon className="w-4 h-4" />
                    </div>
                    <p className="text-2xl font-bold">{card.value ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">{card.label}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <CalendarClock className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold">Upcoming Reviews (Next 30 Days)</h2>
            </div>
            {upcoming.length === 0 ? (
              <Card><CardContent className="p-4 text-center text-sm text-muted-foreground">No reviews due in the next 30 days.</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {upcoming.map(sop => (
                  <Link key={sop.id} to="/lvcos/sop-registry">
                    <Card className="border shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{sop.sop_id} — {sop.title}</p>
                          <p className="text-xs text-muted-foreground">{sop.department || 'No department'}</p>
                        </div>
                        <span className="text-xs font-medium text-accent whitespace-nowrap">
                          {new Date(sop.next_review_date).toLocaleDateString()}
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}