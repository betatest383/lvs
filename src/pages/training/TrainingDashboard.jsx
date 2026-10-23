import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  GraduationCap, FileText, AlertTriangle, CheckCircle2, RefreshCw,
  HelpCircle, Plus, Clock, Building2
} from 'lucide-react';
import { TRAINING_STATUS_COLORS, TRAINING_TYPE_COLORS } from '@/lib/trainingRegistryConstants';

export default function TrainingDashboard() {
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.functions.invoke('manageTraining', { action: 'list' })
      .then(res => setTrainings(res.data?.guides || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  const active = trainings.filter(t => t.status === 'Published');
  const draft = trainings.filter(t => t.status === 'Draft');
  const requiresRenewal = trainings.filter(t => t.renewal_required && t.status === 'Active');
  const hasQuiz = trainings.filter(t => t.quiz_required);
  const missingTrainual = trainings.filter(t => t.status === 'Active' && !t.trainual_link);

  const byType = {};
  trainings.forEach(t => {
    const tp = t.training_type || 'Unassigned';
    byType[tp] = (byType[tp] || 0) + 1;
  });

  const kpis = [
    { label: 'Total Trainings', value: trainings.length, icon: GraduationCap, to: '/lvcos/training/registry', color: 'bg-blue-100 text-blue-600' },
    { label: 'Active', value: active.length, icon: CheckCircle2, to: '/lvcos/training/registry', color: 'bg-green-100 text-green-600' },
    { label: 'Requires Renewal', value: requiresRenewal.length, icon: RefreshCw, to: '/lvcos/training/reports', color: 'bg-amber-100 text-amber-600' },
    { label: 'Missing Trainual', value: missingTrainual.length, icon: AlertTriangle, to: '/lvcos/training/reports', color: 'bg-orange-100 text-orange-600' },
    { label: 'Has Quiz', value: hasQuiz.length, icon: HelpCircle, to: '/lvcos/training/reports', color: 'bg-purple-100 text-purple-600' },
    { label: 'Draft', value: draft.length, icon: FileText, to: '/lvcos/training/registry', color: 'bg-gray-100 text-gray-600' },
    { label: 'With Certs', value: trainings.filter(t => (t.related_certifications?.length || 0) > 0).length, icon: GraduationCap, to: '/lvcos/training/reports', color: 'bg-cyan-100 text-cyan-600' },
    { label: 'Role Coverage', value: new Set(trainings.flatMap(t => t.required_roles || [])).size, icon: Building2, to: '/lvcos/training/matrix', color: 'bg-indigo-100 text-indigo-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Training Registry Dashboard</h1>
          <p className="text-muted-foreground text-sm">Master database for all required training — roles, SOPs, policies, certifications, and onboarding.</p>
        </div>
        <Link to="/lvcos/training/registry">
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="w-4 h-4 mr-2" /> New Training</Button>
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
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><RefreshCw className="w-4 h-4 text-muted-foreground" /> Training Requiring Renewal</h3>
            {requiresRenewal.length === 0 ? (
              <p className="text-sm text-muted-foreground">No trainings require renewal.</p>
            ) : (
              <div className="space-y-1">
                {requiresRenewal.slice(0, 6).map(t => (
                  <Link key={t.id} to={`/lvcos/training/detail/${t.id}`} className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                    <span className="truncate">{t.training_name}</span>
                    <span className="text-xs text-amber-600 font-medium">{t.renewal_frequency}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-muted-foreground" /> Missing Trainual Links</h3>
            {missingTrainual.length === 0 ? (
              <p className="text-sm text-muted-foreground">All active trainings have Trainual links.</p>
            ) : (
              <div className="space-y-1">
                {missingTrainual.slice(0, 6).map(t => (
                  <Link key={t.id} to={`/lvcos/training/detail/${t.id}`} className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                    <span className="truncate">{t.training_name}</span>
                    <span className="text-xs text-orange-600">No link</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /> Trainings by Type</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <div key={type} className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TRAINING_TYPE_COLORS[type] || 'bg-muted'}`}>{type}</span>
                <span className="text-sm font-bold">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}