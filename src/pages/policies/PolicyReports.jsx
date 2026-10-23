import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, BarChart3, Building2, Shield, ClipboardCheck, AlertTriangle, CalendarClock, ExternalLink } from 'lucide-react';
import {
  POLICY_STATUS_COLORS, ENFORCEMENT_LEVEL_COLORS, POLICY_TYPES
} from '@/lib/policyRegistryConstants';
import { format, differenceInDays } from 'date-fns';

export default function PolicyReports() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.PolicyRegistry.list('-created_date', 500)
      .then(setPolicies)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const today = new Date();

  // Breakdowns
  const byStatus = {};
  policies.forEach(p => { const s = p.status || 'Unknown'; byStatus[s] = (byStatus[s] || 0) + 1; });

  const byType = {};
  policies.forEach(p => { const t = p.policy_type || 'Unassigned'; byType[t] = (byType[t] || 0) + 1; });

  const byEnforcement = {};
  policies.forEach(p => { const e = p.enforcement_level || 'Medium'; byEnforcement[e] = (byEnforcement[e] || 0) + 1; });

  const byDept = {};
  policies.forEach(p => { const d = p.department || 'Unassigned'; byDept[d] = (byDept[d] || 0) + 1; });

  // Needs review (within 30 days or overdue)
  const needsReview = policies.filter(p => {
    if (!p.review_date || p.status === 'Retired') return false;
    return differenceInDays(new Date(p.review_date), today) <= 30;
  }).sort((a, b) => new Date(a.review_date) - new Date(b.review_date));

  const overdue = needsReview.filter(p => new Date(p.review_date) < today);
  const upcoming = needsReview.filter(p => new Date(p.review_date) >= today);

  // Missing Trainual
  const missingTrainual = policies.filter(p => p.status === 'Active' && !p.trainual_link);

  // Missing acknowledgment frequency
  const missingAckFreq = policies.filter(p => p.requires_acknowledgment && !p.acknowledgment_frequency);

  const maxType = Math.max(...Object.values(byType), 1);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Policy Reports</h1>
        <p className="text-muted-foreground text-sm">Analytics across all company policies</p>
      </div>

      {/* Status breakdown */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Policy Status Breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {Object.entries(byStatus).map(([status, count]) => (
              <div key={status} className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-full text-sm font-medium ${POLICY_STATUS_COLORS[status] || 'bg-muted'}`}>{status}</span>
                <span className="text-lg font-bold">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* By Type */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Policies by Type</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <div key={type}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{type}</span>
                  <span className="text-muted-foreground">{count}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div className="bg-accent h-full rounded-full" style={{ width: `${(count / maxType) * 100}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* By Enforcement */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4" /> Enforcement Level Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {['Critical', 'High', 'Medium', 'Low'].map(level => (
                <div key={level} className="flex justify-between items-center text-sm">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ENFORCEMENT_LEVEL_COLORS[level]}`}>{level}</span>
                  <span className="font-bold">{byEnforcement[level] || 0}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Needs Review */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Policies Requiring Review</CardTitle></CardHeader>
        <CardContent>
          {needsReview.length === 0 ? (
            <p className="text-sm text-muted-foreground">No policies due for review within 30 days.</p>
          ) : (
            <div className="space-y-3">
              {overdue.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-600 mb-1">Overdue ({overdue.length})</p>
                  <div className="space-y-1">
                    {overdue.map(p => (
                      <Link key={p.id} to={`/lvcos/policies/detail/${p.id}`} className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                        <span className="truncate">{p.policy_name}</span>
                        <span className="text-xs text-red-600 font-medium">Due {format(new Date(p.review_date), 'MMM d, yyyy')}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {upcoming.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-amber-600 mb-1">Upcoming within 30 days ({upcoming.length})</p>
                  <div className="space-y-1">
                    {upcoming.map(p => (
                      <Link key={p.id} to={`/lvcos/policies/detail/${p.id}`} className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                        <span className="truncate">{p.policy_name}</span>
                        <span className="text-xs text-amber-600 font-medium">Due {format(new Date(p.review_date), 'MMM d, yyyy')}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Missing Trainual */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Missing Trainual Links ({missingTrainual.length})</CardTitle></CardHeader>
        <CardContent>
          {missingTrainual.length === 0 ? (
            <p className="text-sm text-muted-foreground">All active policies have Trainual links.</p>
          ) : (
            <div className="space-y-1">
              {missingTrainual.map(p => (
                <Link key={p.id} to={`/lvcos/policies/detail/${p.id}`} className="flex justify-between text-sm hover:bg-muted/50 rounded px-2 py-1 transition-colors">
                  <span className="truncate">{p.policy_name}</span>
                  <span className="text-xs text-orange-600">No Trainual link</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Coverage table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Policy Summary by Type</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 font-medium">Type</th>
                  <th className="py-2 font-medium text-center">Total</th>
                  <th className="py-2 font-medium text-center hidden md:table-cell">Active</th>
                  <th className="py-2 font-medium text-center hidden md:table-cell">Critical</th>
                  <th className="py-2 font-medium text-center hidden lg:table-cell">Needs Ack</th>
                  <th className="py-2 font-medium text-center hidden lg:table-cell">Missing Trainual</th>
                </tr>
              </thead>
              <tbody>
                {POLICY_TYPES.map(type => {
                  const typePolicies = policies.filter(p => p.policy_type === type);
                  if (typePolicies.length === 0) return null;
                  const active = typePolicies.filter(p => p.status === 'Active').length;
                  const critical = typePolicies.filter(p => p.enforcement_level === 'Critical').length;
                  const needsAck = typePolicies.filter(p => p.requires_acknowledgment).length;
                  const missingT = typePolicies.filter(p => p.status === 'Active' && !p.trainual_link).length;
                  return (
                    <tr key={type} className="border-b hover:bg-muted/30">
                      <td className="py-2 font-medium">{type}</td>
                      <td className="py-2 text-center">{typePolicies.length}</td>
                      <td className="py-2 text-center hidden md:table-cell">{active}</td>
                      <td className="py-2 text-center hidden md:table-cell">{critical || '—'}</td>
                      <td className="py-2 text-center hidden lg:table-cell">{needsAck || '—'}</td>
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