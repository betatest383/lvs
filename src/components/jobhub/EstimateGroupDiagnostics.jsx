import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Activity, Building2, Layers, AlertTriangle,
  CheckCircle2, XCircle, FileWarning,
} from 'lucide-react';
import { detectOverlaps } from '@/lib/committedWorkKey';

export default function EstimateGroupDiagnostics({ jobId }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!jobId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [groups, assets, groupItems, recs, scopes, snapshots, estimates, draftItems] = await Promise.all([
          base44.entities.EstimateGroup.filter({ job_id: jobId }).catch(() => []),
          base44.entities.PropertyAsset.filter({ job_id: jobId }).catch(() => []),
          base44.entities.EstimateGroupItem.filter({ job_id: jobId }).catch(() => []),
          base44.entities.RepairSystemRecommendation.filter({ job_id: jobId }).catch(() => []),
          base44.entities.ScopeOfWork.filter({ job_id: jobId }).catch(() => []),
          base44.entities.PricingCalculationSnapshot.filter({ job_id: jobId }).catch(() => []),
          base44.entities.Estimate.filter({ job_id: jobId }).catch(() => []),
          base44.entities.DraftEstimateItem.filter({ job_id: jobId }).catch(() => []),
        ]);
        setData({ groups, assets, groupItems, recs, scopes, snapshots, estimates, draftItems });
      } catch (e) {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [jobId]);

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (!data) return null;

  const { groups, assets, groupItems, recs, scopes, snapshots, estimates, draftItems } = data;

  // Compute diagnostics
  const ungroupedRecs = recs.filter(r => !groupItems.some(gi => gi.repair_recommendation_id === r.id));
  const recsWithoutAsset = groupItems.filter(gi => !gi.property_asset_id);
  const groupsWithoutItems = groups.filter(g => !groupItems.some(gi => gi.estimate_group_id === g.id));
  const groupsWithoutScope = groups.filter(g => !scopes.some(s => s.estimate_group_id === g.id));
  const groupsWithoutPricing = groups.filter(g => !snapshots.some(s => s.estimate_group_id === g.id));

  // Overlap detection
  const overlaps = detectOverlaps(
    groups.map(g => ({
      group_id: g.id,
      group_name: g.group_name,
      committed_work_keys: groupItems
        .filter(gi => gi.estimate_group_id === g.id)
        .map(gi => gi.committed_work_key),
    }))
  );

  const diagItems = [
    { label: 'Property Assets', value: assets.length, icon: Building2, status: assets.length > 0 ? 'ok' : 'warn' },
    { label: 'Estimate Groups', value: groups.length, icon: Layers, status: groups.length > 0 ? 'ok' : 'warn' },
    { label: 'Group Items', value: groupItems.length, icon: Activity, status: 'ok' },
    { label: 'Recommendations', value: recs.length, icon: Activity, status: 'ok' },
    { label: 'Draft Estimate Items', value: draftItems.length, icon: Activity, status: 'ok' },
    { label: 'Scope Records', value: scopes.length, icon: FileWarning, status: 'ok' },
    { label: 'Pricing Snapshots', value: snapshots.length, icon: Activity, status: 'ok' },
    { label: 'Customer Estimates', value: estimates.length, icon: Activity, status: 'ok' },
  ];

  const issues = [
    ...ungroupedRecs.map(r => ({ type: 'ungrouped', message: `Recommendation "${r.recommendation_title}" is not assigned to any group` })),
    ...recsWithoutAsset.map(gi => ({ type: 'missing_asset', message: `Group item for recommendation ${gi.repair_recommendation_id} has no property asset` })),
    ...groupsWithoutItems.map(g => ({ type: 'empty_group', message: `Group "${g.group_name}" has no items` })),
    ...groupsWithoutScope.map(g => ({ type: 'missing_scope', message: `Group "${g.group_name}" has no Scope of Work` })),
    ...groupsWithoutPricing.map(g => ({ type: 'missing_pricing', message: `Group "${g.group_name}" has no Pricing Snapshot` })),
    ...overlaps.map(o => ({ type: 'overlap', message: `Overlap: ${o.sources.map(s => s.group_name).join(' vs ')}` })),
  ];

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="w-4 h-4" /> Estimate Group Diagnostics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-2">
          {diagItems.map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={i} className="rounded-lg border p-2 text-center">
                <Icon className={`w-4 h-4 mx-auto mb-1 ${item.status === 'ok' ? 'text-green-500' : 'text-amber-500'}`} />
                <p className="text-lg font-bold">{item.value}</p>
                <p className="text-[10px] text-muted-foreground">{item.label}</p>
              </div>
            );
          })}
        </div>

        {/* Groups Breakdown */}
        {groups.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Groups</p>
            {groups.map(g => {
              const items = groupItems.filter(gi => gi.estimate_group_id === g.id);
              const scope = scopes.find(s => s.estimate_group_id === g.id);
              const pricing = snapshots.find(s => s.estimate_group_id === g.id);
              const estimate = estimates.find(e => e.estimate_group_id === g.id);
              return (
                <div key={g.id} className="flex items-center justify-between text-xs border-b pb-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{g.group_type}</Badge>
                    <span className="font-medium">{g.group_name}</span>
                    {g.confirmed && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>{items.length} items</span>
                    {scope ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-red-400" />}
                    {pricing ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-red-400" />}
                    {estimate ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-red-400" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Issues */}
        {issues.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-500" /> Issues ({issues.length})
            </p>
            {issues.map((issue, i) => (
              <div key={i} className="text-xs text-amber-700 flex items-start gap-1">
                <span className="text-amber-500">•</span>
                <span>{issue.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Property Assets */}
        {assets.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Property Assets</p>
            <div className="flex flex-wrap gap-1">
              {assets.map(a => (
                <Badge key={a.id} variant="outline" className="text-[10px]">
                  <Building2 className="w-2.5 h-2.5 mr-0.5" />
                  {a.asset_name} · {a.asset_type}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}