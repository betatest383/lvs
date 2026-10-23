import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Loader2, Layers, Plus, Trash2, CheckCircle2, ArrowRight, Building2,
  Shield, Package, Edit3, AlertCircle, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { detectOverlaps, formatConflict } from '@/lib/committedWorkKey';

const GROUP_TYPE_LABELS = {
  interior: 'Interior',
  exterior: 'Exterior',
  combined: 'Combined',
  appliance: 'Appliance',
  venting: 'Venting',
  safety: 'Safety',
  maintenance: 'Maintenance',
  upgrade: 'Upgrade',
  value_package: 'Value Package',
  whole_property: 'Whole Property',
  custom: 'Custom',
};

const GROUP_TYPE_COLORS = {
  interior: 'bg-orange-100 text-orange-700',
  exterior: 'bg-blue-100 text-blue-700',
  combined: 'bg-purple-100 text-purple-700',
  safety: 'bg-red-100 text-red-700',
  value_package: 'bg-green-100 text-green-700',
  whole_property: 'bg-indigo-100 text-indigo-700',
  custom: 'bg-gray-100 text-gray-700',
};

export default function EstimateGroupReview({ jobId, onContinue, onRefresh }) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [assets, setAssets] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [groupItems, setGroupItems] = useState([]);
  const [autoGrouping, setAutoGrouping] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [editGroup, setEditGroup] = useState(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [grps, asts, recs, items] = await Promise.all([
        base44.entities.EstimateGroup.filter({ job_id: jobId }, 'display_order').catch(() => []),
        base44.entities.PropertyAsset.filter({ job_id: jobId, status: 'active' }).catch(() => []),
        base44.entities.RepairSystemRecommendation.filter({ job_id: jobId }).catch(() => []),
        base44.entities.EstimateGroupItem.filter({ job_id: jobId }).catch(() => []),
      ]);
      setGroups(grps);
      setAssets(asts);
      setRecommendations(recs);
      setGroupItems(items);
    } catch (e) {
      toast.error('Failed to load estimate groups');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { loadData(); }, [loadData]);

  const allConfirmed = groups.length > 0 && groups.every(g => g.confirmed);
  const ungroupedRecs = recommendations.filter(r =>
    !groupItems.some(gi => gi.repair_recommendation_id === r.id)
  );

  // Overlap detection
  const overlapConflicts = detectOverlaps(
    groups.map(g => ({
      group_id: g.id,
      group_name: g.group_name,
      committed_work_keys: groupItems
        .filter(gi => gi.estimate_group_id === g.id)
        .map(gi => gi.committed_work_key),
    }))
  );

  const handleAutoGroup = async () => {
    setAutoGrouping(true);
    try {
      const response = await base44.functions.invoke('autoGroupEstimates', { job_id: jobId });
      toast.success(response.data?.message || 'Auto-grouping complete');
      await loadData();
      onRefresh?.();
    } catch (e) {
      toast.error('Auto-grouping failed: ' + (e?.response?.data?.error || e?.message));
    } finally {
      setAutoGrouping(false);
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await Promise.all(groups.map(g =>
        !g.confirmed ? base44.entities.EstimateGroup.update(g.id, {
          confirmed: true,
          confirmed_by: 'technician',
          confirmed_at: new Date().toISOString(),
          status: 'options_ready',
        }).catch(() => {}) : Promise.resolve()
      ));
      toast.success('Estimate groups confirmed');
      await loadData();
      onContinue?.();
    } catch (e) {
      toast.error('Failed to confirm groups');
    } finally {
      setConfirming(false);
    }
  };

  const handleUpdateGroup = async (groupId, updates) => {
    try {
      await base44.entities.EstimateGroup.update(groupId, updates);
      await loadData();
    } catch (e) {
      toast.error('Failed to update group');
    }
  };

  const handleDeleteGroup = async (groupId) => {
    try {
      await base44.entities.EstimateGroupItem.deleteMany({ estimate_group_id: groupId }).catch(() => {});
      await base44.entities.EstimateGroup.delete(groupId);
      toast.success('Group deleted');
      await loadData();
    } catch (e) {
      toast.error('Failed to delete group');
    }
  };

  const handleCreateGroup = async (groupData) => {
    try {
      await base44.entities.EstimateGroup.create({
        job_id: jobId,
        grouping_source: 'technician',
        status: 'draft',
        customer_visible: true,
        allow_independent_decision: true,
        ...groupData,
      });
      toast.success('Group created');
      setNewGroupOpen(false);
      await loadData();
    } catch (e) {
      toast.error('Failed to create group');
    }
  };

  const handleMoveRecommendation = async (recId, fromGroupId, toGroupId) => {
    try {
      // Update the group item's estimate_group_id
      const item = groupItems.find(gi =>
        gi.repair_recommendation_id === recId && gi.estimate_group_id === fromGroupId
      );
      if (item) {
        await base44.entities.EstimateGroupItem.update(item.id, {
          estimate_group_id: toGroupId,
        });
        toast.success('Recommendation moved');
        await loadData();
      }
    } catch (e) {
      toast.error('Failed to move recommendation');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
        <p className="text-sm text-muted-foreground">Loading estimate groups...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-accent" />
          <h3 className="text-lg font-bold">Estimate Groups</h3>
          <Badge variant="outline">{groups.length} group(s)</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleAutoGroup} disabled={autoGrouping}>
            {autoGrouping ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Layers className="w-4 h-4 mr-1" />}
            Auto-Group
          </Button>
          <Button variant="outline" size="sm" onClick={() => setNewGroupOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> New Group
          </Button>
        </div>
      </div>

      {/* Property Assets Summary */}
      {assets.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium">Property Assets ({assets.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {assets.map(a => (
                <Badge key={a.id} variant="outline" className="text-xs">
                  {a.asset_name}
                  <span className="text-muted-foreground ml-1">· {a.asset_type}</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overlap Warnings */}
      {overlapConflicts.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-900">Overlap Detected ({overlapConflicts.length})</p>
                {overlapConflicts.map((c, i) => (
                  <p key={i} className="text-xs text-amber-700 mt-0.5">{formatConflict(c)}</p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Groups List */}
      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No estimate groups yet. Click "Auto-Group" to generate groups from recommendations,
            or create a custom group manually.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map(group => {
            const groupRecs = groupItems.filter(gi => gi.estimate_group_id === group.id);
            const groupAssets = assets.filter(a => group.asset_ids?.includes(a.id));
            return (
              <GroupCard
                key={group.id}
                group={group}
                groupRecs={groupRecs}
                groupAssets={groupAssets}
                recommendations={recommendations}
                allGroups={groups}
                onEdit={() => setEditGroup(group)}
                onDelete={() => handleDeleteGroup(group.id)}
                onMoveRec={handleMoveRecommendation}
                onUpdate={(updates) => handleUpdateGroup(group.id, updates)}
              />
            );
          })}
        </div>
      )}

      {/* Ungrouped Recommendations */}
      {ungroupedRecs.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Ungrouped Recommendations ({ungroupedRecs.length})</span>
            </div>
            <div className="space-y-1">
              {ungroupedRecs.map(rec => (
                <div key={rec.id} className="flex items-center justify-between rounded border bg-white p-2 text-sm">
                  <span>{rec.recommendation_title}</span>
                  <Badge variant="outline" className="text-xs">{rec.repair_system_type}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm & Continue */}
      <div className="flex items-center justify-between pt-2 border-t">
        <div className="text-sm text-muted-foreground">
          {allConfirmed
            ? <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> All groups confirmed</span>
            : `${groups.filter(g => g.confirmed).length} of ${groups.length} confirmed`}
        </div>
        <Button
          onClick={handleConfirm}
          disabled={confirming || allConfirmed || groups.length === 0 || overlapConflicts.length > 0}
          className="bg-accent text-accent-foreground hover:bg-accent/90"
        >
          {confirming ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-1" />}
          Confirm Groups & Continue
        </Button>
      </div>

      {/* Edit Group Dialog */}
      {editGroup && (
        <EditGroupDialog
          group={editGroup}
          assets={assets}
          onClose={() => setEditGroup(null)}
          onSave={(updates) => { handleUpdateGroup(editGroup.id, updates); setEditGroup(null); }}
        />
      )}

      {/* New Group Dialog */}
      {newGroupOpen && (
        <NewGroupDialog
          jobId={jobId}
          assets={assets}
          recommendations={recommendations}
          onClose={() => setNewGroupOpen(false)}
          onCreate={handleCreateGroup}
        />
      )}
    </div>
  );
}

function GroupCard({ group, groupRecs, groupAssets, recommendations, allGroups, onEdit, onDelete, onMoveRec, onUpdate }) {
  const [showItems, setShowItems] = useState(false);
  const typeLabel = GROUP_TYPE_LABELS[group.group_type] || group.group_type;
  const typeColor = GROUP_TYPE_COLORS[group.group_type] || GROUP_TYPE_COLORS.custom;
  const recDetails = groupRecs.map(gi =>
    recommendations.find(r => r.id === gi.repair_recommendation_id)
  ).filter(Boolean);

  return (
    <Card className={group.confirmed ? 'border-green-300' : ''}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm">{group.group_name}</h4>
              <Badge className={`text-xs ${typeColor}`}>{typeLabel}</Badge>
              {group.is_combined_group && <Badge variant="outline" className="text-xs"><Package className="w-3 h-3 mr-0.5" /> Combined</Badge>}
              {group.confirmed && <CheckCircle2 className="w-4 h-4 text-green-600" />}
            </div>
            {group.description && <p className="text-xs text-muted-foreground mt-0.5">{group.description}</p>}
            {groupAssets.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {groupAssets.map(a => (
                  <Badge key={a.id} variant="outline" className="text-[10px]"><Building2 className="w-2.5 h-2.5 mr-0.5" />{a.asset_name}</Badge>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}><Edit3 className="w-3.5 h-3.5" /></Button>
            {!group.confirmed && groupRecs.length === 0 && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}><Trash2 className="w-3.5 h-3.5" /></Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{groupRecs.length} item(s)</span>
          {group.allow_independent_decision && <span>· Independent decision</span>}
        </div>

        {groupRecs.length > 0 && (
          <div>
            <button className="text-xs text-muted-foreground flex items-center gap-1" onClick={() => setShowItems(!showItems)}>
              {showItems ? 'Hide' : 'Show'} items
            </button>
            {showItems && (
              <div className="mt-1 space-y-1">
                {recDetails.map(rec => (
                  <div key={rec.id} className="flex items-center justify-between rounded border bg-white p-1.5 text-xs">
                    <span>{rec.recommendation_title}</span>
                    {rec.safety_concern && <Shield className="w-3 h-3 text-red-500" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EditGroupDialog({ group, assets, onClose, onSave }) {
  const [name, setName] = useState(group.group_name || '');
  const [description, setDescription] = useState(group.description || '');
  const [assetIds, setAssetIds] = useState(group.asset_ids || []);
  const [customerVisible, setCustomerVisible] = useState(group.customer_visible !== false);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Estimate Group</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Group Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Description</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Associated Assets</label>
            <div className="space-y-1">
              {assets.map(a => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={assetIds.includes(a.id)}
                    onChange={e => {
                      if (e.target.checked) setAssetIds([...assetIds, a.id]);
                      else setAssetIds(assetIds.filter(id => id !== a.id));
                    }}
                  />
                  {a.asset_name}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={customerVisible} onChange={e => setCustomerVisible(e.target.checked)} />
            Customer Visible
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({ group_name: name, description, asset_ids: assetIds, customer_visible: customerVisible })}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewGroupDialog({ jobId, assets, recommendations, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [groupType, setGroupType] = useState('custom');
  const [description, setDescription] = useState('');
  const [assetIds, setAssetIds] = useState([]);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Create New Estimate Group</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Group Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Chimney 2 — Liner Repair" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Group Type</label>
            <select className="w-full rounded-md border border-input p-2 text-sm" value={groupType} onChange={e => setGroupType(e.target.value)}>
              {Object.entries(GROUP_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Description</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Associated Assets</label>
            <div className="space-y-1">
              {assets.map(a => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={assetIds.includes(a.id)}
                    onChange={e => {
                      if (e.target.checked) setAssetIds([...assetIds, a.id]);
                      else setAssetIds(assetIds.filter(id => id !== a.id));
                    }}
                  />
                  {a.asset_name}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onCreate({ group_name: name, group_type: groupType, description, asset_ids: assetIds })} disabled={!name.trim()}>
            Create Group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}