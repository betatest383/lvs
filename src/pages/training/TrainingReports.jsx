import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, BarChart3, Building2, RefreshCw, HelpCircle, AlertTriangle, Award } from 'lucide-react';
import { TRAINING_STATUS_COLORS, TRAINING_TYPE_COLORS, TRAINING_TYPES } from '@/lib/trainingRegistryConstants';

export default function TrainingReports() {
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.TrainingRegistry.list('-created_date', 500)
      .then(setTrainings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const byStatus = {};
  trainings.forEach(t => { const s = t.status || 'Unknown'; byStatus[s] = (byStatus[s] || 0) + 1; });

  const byType = {};
  trainings.forEach(t => { const tp = t.training_type || 'Unassigned'; byType[tp] = (byType[tp] || 0) + 1; });

  const requiresRenewal = trainings.filter(t => t.renewal_required && t.status === 'Active');
  const byRenewalFreq = {};
  requiresRenewal.forEach(t => {
    const f = t.renewal_frequency || 'Unspecified';
    byRenewalFreq[f] = (byRenewalFreq[f] || 0) + 1;
  });

  const withQuiz = trainings.filter(t => t.quiz_required);
  const missingTrainual = trainings.filter(t => t.status === 'Active' && !t.trainual_link);
  const withCerts = trainings.filter(t => (t.related_certifications?.length || 0) > 0);
  const unassigned = trainings.filter(t => (t.required_roles?.length || 0) === 0 && t.status === 'Active');

  const maxType = Math.max(...Object.values(byType), 1);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Training Reports</h1>
        <p className="text-muted-foreground text-sm">Analytics across all company training</p>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Status Breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {Object.entries(byStatus).map(([status, count]) => (
              <div key={status} className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-full text-sm font-medium ${TRAINING_STATUS_COLORS[status] || 'bg-muted'}`}>{status}</span>
                <span className="text-lg font-bold">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Trainings by Type</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <div key={type}>
                <div className="flex justify-between text-sm mb-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TRAINING_TYPE_COLORS[type] || 'bg-muted'}`}>{type}</span>
                  <span className="font-bold">{count}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div className="bg-accent h-full rounded-full" style={{ width: `${(count / maxType) * 100}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Renewal Distribution</CardTitle></CardHeader>
          <CardContent>
            {Object.keys(byRenewalFreq).length === 0 ? (
              <p className="text-sm text-muted-foreground">No trainings require renewal.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(byRenewalFreq).map(([freq, count]) => (
                  <div key={freq} className="flex justify-between items-center text-sm">
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">{freq}</span>
                    <span className="font-bold">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-purple-100 text-purple-600"><HelpCircle className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{withQuiz.length}</p><p className="text-xs text-muted-foreground">Have Quiz</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-amber-100 text-amber-600"><RefreshCw className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{requiresRenewal.length}</p><p className="text-xs text-muted-foreground">Require Renewal</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-orange-100 text-orange-600"><AlertTriangle className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{missingTrainual.length}</p><p className="text-xs text-muted-foreground">Missing Trainual</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-cyan-100 text-cyan-600"><Award className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{withCerts.length}</p><p className="text-xs text-muted-foreground">With Certifications</p>
        </CardContent></Card>
      </div>

      {/* Missing Trainual */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Missing Trainual Links ({missingTrainual.length})</CardTitle></CardHeader>
        <CardContent>
          {missingTrainual.length === 0 ? (
            <p className="text-sm text-muted-foreground">All active trainings have Trainual links.</p>
          ) : (
            <div className="space-y-1">
              {missingTrainual.map(t => (
                <Link key={t.id} to={`/lvcos/training/detail/${t.id}`} className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                  <span className="truncate">{t.training_name}</span>
                  <span className="text-xs text-orange-600">No Trainual link</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unassigned trainings */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Building2 className="w-4 h-4" /> Active Trainings Without Role Assignment ({unassigned.length})</CardTitle></CardHeader>
        <CardContent>
          {unassigned.length === 0 ? (
            <p className="text-sm text-muted-foreground">All active trainings have role assignments.</p>
          ) : (
            <div className="space-y-1">
              {unassigned.map(t => (
                <Link key={t.id} to={`/lvcos/training/detail/${t.id}`} className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                  <span className="truncate">{t.training_name}</span>
                  <span className="text-xs text-amber-600">No roles assigned</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Coverage table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Summary by Type</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 font-medium">Type</th>
                  <th className="py-2 font-medium text-center">Total</th>
                  <th className="py-2 font-medium text-center hidden md:table-cell">Active</th>
                  <th className="py-2 font-medium text-center hidden md:table-cell">Quiz</th>
                  <th className="py-2 font-medium text-center hidden lg:table-cell">Renewal</th>
                  <th className="py-2 font-medium text-center hidden lg:table-cell">Missing Trainual</th>
                </tr>
              </thead>
              <tbody>
                {TRAINING_TYPES.map(type => {
                  const typeTrainings = trainings.filter(t => t.training_type === type);
                  if (typeTrainings.length === 0) return null;
                  const active = typeTrainings.filter(t => t.status === 'Active').length;
                  const quiz = typeTrainings.filter(t => t.quiz_required).length;
                  const renewal = typeTrainings.filter(t => t.renewal_required).length;
                  const missingT = typeTrainings.filter(t => t.status === 'Active' && !t.trainual_link).length;
                  return (
                    <tr key={type} className="border-b hover:bg-muted/30">
                      <td className="py-2 font-medium">{type}</td>
                      <td className="py-2 text-center">{typeTrainings.length}</td>
                      <td className="py-2 text-center hidden md:table-cell">{active}</td>
                      <td className="py-2 text-center hidden md:table-cell">{quiz || '—'}</td>
                      <td className="py-2 text-center hidden lg:table-cell">{renewal || '—'}</td>
                      <td className="py-2 text-center hidden lg:table-cell">{missingT || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}