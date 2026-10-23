import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Shield, FileText, AlertTriangle, ClipboardCheck, ExternalLink,
  Building2, CheckCircle2, Plus, CalendarClock
} from 'lucide-react';
import {
  POLICY_STATUS_COLORS, ENFORCEMENT_LEVEL_COLORS
} from '@/lib/policyRegistryConstants';
import { format, differenceInDays } from 'date-fns';

export default function PolicyDashboard() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.PolicyRegistry.list('-created_date', 500)
      .then(setPolicies)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  const active = policies.filter(p => p.status === 'Active');
  const draft = policies.filter(p => p.status === 'Draft');
  const underReview = policies.filter(p => p.status === 'Under Review');
  const retired = policies.filter(p => p.status === 'Retired');
  const requiresAck = policies.filter(p => p.requires_acknowledgment);
  const missingTrainual = policies.filter(p => p.status === 'Active' && !p.trainual_link);

  const today = new Date();
  const needsReview = active.filter(p => {
    if (!p.review_date) return false;
    const diff = differenceInDays(new Date(p.review_date), today);
    return diff <= 30;
  });

  const byType = {};
  policies.forEach(p => {
    const t = p.policy_type || 'Unassigned';
    byType[t] = (byType[t] || 0) + 1;
  });

  const byEnforcement = {};
  policies.forEach(p => {
    const e = p.enforcement_level || 'Medium';
    byEnforcement[e] = (byEnforcement[e] || 0) + 1;
  });

  const kpis = [
    { label: 'Total Policies', value: policies.length, icon: FileText, to: '/lvcos/policies/registry', color: 'bg-blue-100 text-blue-600' },
    { label: 'Active', value: active.length, icon: CheckCircle2, to: '/lvcos/policies/registry', color: 'bg-green-100 text-green-600' },
    { label: 'Needs Review', value: needsReview.length, icon: CalendarClock, to: '/lvcos/policies/reports', color: 'bg-amber-100 text-amber-600' },
    { label: 'Missing Trainual', value: missingTrainual.length, icon: AlertTriangle, to: '/lvcos/policies/reports', color: 'bg-orange-100 text-orange-600' },
    { label: 'Requires Acknowledgment', value: requiresAck.length, icon: ClipboardCheck, to: '/lvcos/policies/acknowledgments', color: 'bg-purple-100 text-purple-600' },
    { label: 'Draft', value: draft.length, icon: FileText, to: '/lvcos/policies/registry', color: 'bg-gray-100 text-gray-600' },
    { label: 'Under Review', value: underReview.length, icon: AlertTriangle, to: '/lvcos/policies/registry', color: 'bg-yellow-100 text-yellow-700' },
    { label: 'Critical Enforcement', value: byEnforcement.Critical || 0, icon: Shield, to: '/lvcos/policies/reports', color: 'bg-red-100 text-red-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Policy Registry Dashboard</h1>
          <p className="text-muted-foreground text-sm">Master database for all company policies — rules, requirements, and standards.</p>
        </div>
        <Link to="/lvcos/policies/registry">
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="w-4 h-4 mr-2" /> New Policy</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <Link key={i} to={kpi.to}>
            <Card className="hover:shadow-md transition-shadow h-full">
              <CardContent className="p-4">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${kpi.color}`}>
                  <kpi.icon className="w-4 h-4" />
                </div>
                <p className="text-2xl font-bold">{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><CalendarClock className="w-4 h-4 text-muted-foreground" /> Policies Requiring Review</h3>
            {needsReview.length === 0 ? (
              <p className="text-sm text-muted-foreground">No policies due for review.</p>
            ) : (
              <div className="space-y-1">
                {needsReview.slice(0, 6).map(p => {
                  const isOverdue = new Date(p.review_date) < today;
                  return (
                    <Link key={p.id} to={`/lvcos/policies/detail/${p.id}`} className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                      <span className="truncate">{p.policy_name}</span>
                      <span className={`text-xs font-medium ${isOverdue ? 'text-red-600' : 'text-amber-600'}`}>
                        {isOverdue ? 'Overdue' : format(new Date(p.review_date), 'MMM d')}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-muted-foreground" /> Missing Trainual Links</h3>
            {missingTrainual.length === 0 ? (
              <p className="text-sm text-muted-foreground">All active policies have Trainual links.</p>
            ) : (
              <div className="space-y-1">
                {missingTrainual.slice(0, 6).map(p => (
                  <Link key={p.id} to={`/lvcos/policies/detail/${p.id}`} className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                    <span className="truncate">{p.policy_name}</span>
                    <span className="text-xs text-orange-600">No link</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /> Policies by Type</h3>
            <div className="space-y-2">
              {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                <div key={type} className="flex justify-between text-sm">
                  <span>{type}</span>
                  <span className="px-2 py-0.5 rounded-full bg-muted text-xs font-medium">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Shield className="w-4 h-4 text-muted-foreground" /> Enforcement Level Distribution</h3>
            <div className="space-y-2">
              {['Critical', 'High', 'Medium', 'Low'].map(level => (
                <div key={level} className="flex justify-between text-sm">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ENFORCEMENT_LEVEL_COLORS[level]}`}>{level}</span>
                  <span className="text-sm font-bold">{byEnforcement[level] || 0}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}