import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, ExternalLink, Loader2, CheckCircle2, Circle,
  AlertTriangle, BookOpen, Clock, Truck,
} from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import {
  getEffectiveStages, validateTransition, calculateLoadingTime, WF_WH_001_STAGES,
} from '@/lib/wfWh001';

export default function MorningMaterialRequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [sopRecord, setSopRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [hardwareChecklists, setHardwareChecklists] = useState([]);
  const [transferSheets, setTransferSheets] = useState([]);

  useEffect(() => {
    loadData();
    loadSop();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rec, hws, transfers] = await Promise.all([
        base44.entities.MorningMaterialRequest.get(id),
        base44.entities.HardwareChecklist.list('-created_date', 100),
        base44.entities.MaterialTransferSheet.list('-created_date', 100),
      ]);
      setRecord(rec);
      setEditData(rec);
      setHardwareChecklists(hws);
      setTransferSheets(transfers);
    } catch (err) {
      toast.error('Failed to load workflow record');
    } finally {
      setLoading(false);
    }
  };

  const loadSop = async () => {
    try {
      const sops = await base44.entities.SopRegistry.filter({ sop_id: 'WH-101' });
      setSopRecord(sops[0]);
    } catch {}
  };

  if (loading || !record) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stages = getEffectiveStages(record);
  const currentIndex = stages.findIndex(s => s.label === record.status);

  const handleAdvance = async (targetStage) => {
    const validation = validateTransition(record, targetStage.key);
    if (!validation.allowed) {
      toast.error(validation.error);
      return;
    }

    setAdvancing(true);
    try {
      const now = new Date().toISOString();
      const updates = { status: targetStage.label };

      if (targetStage.timestampField) {
        updates[targetStage.timestampField] = now;
      }

      // Set stage index
      const newIndex = stages.findIndex(s => s.key === targetStage.key);
      updates.current_stage_index = newIndex;

      // Rule: When Truck Released, calculate total loading time
      if (targetStage.key === 'truck_released') {
        updates.ts_truck_released = now;
        const loadTime = calculateLoadingTime({
          ...record,
          ...updates,
        });
        if (loadTime != null) {
          updates.total_loading_time_minutes = loadTime;
        }
      }

      await base44.entities.MorningMaterialRequest.update(record.id, updates);
      toast.success(`Stage: ${targetStage.label}`);
      loadData();
    } catch (err) {
      toast.error('Failed to advance stage');
    } finally {
      setAdvancing(false);
    }
  };

  const handleSaveEdit = async () => {
    try {
      await base44.entities.MorningMaterialRequest.update(record.id, editData);
      toast.success('Record updated');
      setEditing(false);
      loadData();
    } catch (err) {
      toast.error('Failed to update record');
    }
  };

  const trainualUrl = record.trainual_url || sopRecord?.trainual_url;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/warehouse/morning-material-request')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {record.technician} — Truck {record.truck_number}
            </h1>
            <p className="text-muted-foreground text-sm">
              WF-WH-001 Morning Material Request · {record.date} · Job {record.job_number}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {trainualUrl && (
            <a href={trainualUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline">
                <BookOpen className="w-4 h-4 mr-2" /> View SOP
                <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
            </a>
          )}
          <Button variant="outline" onClick={() => setEditing(!editing)}>
            {editing ? 'Cancel' : 'Edit'}
          </Button>
        </div>
      </div>

      {/* Status Banner */}
      <Card className="border-accent/30 bg-accent/5">
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
              <Truck className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="font-medium">Current Stage {currentIndex + 1} of {stages.length}</p>
              <p className="text-sm text-muted-foreground">{record.status}</p>
            </div>
          </div>
          {record.total_loading_time_minutes != null && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total Loading Time</p>
              <p className="text-lg font-bold">{record.total_loading_time_minutes} min</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Workflow Timeline */}
      <Card className="border shadow-sm">
        <CardContent className="p-5">
          <h2 className="font-semibold mb-4">Workflow Stages</h2>
          <div className="space-y-1">
            {stages.map((stage, i) => {
              const isComplete = i < currentIndex || (i === currentIndex && record[stage.timestampField]);
              const isCurrent = i === currentIndex;
              const isFuture = i > currentIndex;
              const canAdvance = isCurrent && i < stages.length - 1;
              const StageIcon = stage.icon;

              const validation = canAdvance ? validateTransition(record, stages[i + 1].key) : { allowed: true };
              const showValidationError = canAdvance && !validation.allowed;

              return (
                <div key={stage.key}>
                  <div className="flex items-center gap-3 py-2.5">
                    <div className="shrink-0">
                      {isComplete ? (
                        <CheckCircle2 className="w-6 h-6 text-green-500" />
                      ) : isCurrent ? (
                        <div className="w-6 h-6 rounded-full border-2 border-accent bg-accent/10 flex items-center justify-center">
                          <div className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
                        </div>
                      ) : (
                        <Circle className="w-6 h-6 text-muted-foreground/30" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <StageIcon className={`w-4 h-4 ${isComplete ? 'text-green-500' : isCurrent ? 'text-accent' : 'text-muted-foreground/40'}`} />
                        <p className={`text-sm font-medium ${isFuture ? 'text-muted-foreground/50' : ''}`}>
                          {stage.label}
                        </p>
                      </div>
                      {stage.timestampField && record[stage.timestampField] && (
                        <p className="text-xs text-muted-foreground ml-6 mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {moment.utc(record[stage.timestampField]).format('MMM D, h:mm A')}
                        </p>
                      )}
                    </div>
                    {canAdvance && (
                      <Button
                        size="sm"
                        onClick={() => handleAdvance(stages[i + 1])}
                        disabled={advancing || !validation.allowed}
                        className="bg-accent text-accent-foreground hover:bg-accent/90"
                      >
                        {advancing && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                        Advance →
                      </Button>
                    )}
                  </div>
                  {showValidationError && (
                    <div className="ml-9 mb-2 p-2 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <p className="text-xs text-red-700">{validation.error}</p>
                    </div>
                  )}
                  {i < stages.length - 1 && (
                    <div className="ml-3 w-0.5 h-4 bg-border" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Record Details / Edit Form */}
      <Card className="border shadow-sm">
        <CardContent className="p-5">
          <h2 className="font-semibold mb-4">Record Details</h2>
          {editing ? (
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Technician *</Label>
                <Input value={editData.technician || ''} onChange={e => setEditData(p => ({ ...p, technician: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Truck Number *</Label>
                <Input value={editData.truck_number || ''} onChange={e => setEditData(p => ({ ...p, truck_number: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Date *</Label>
                <Input type="date" value={editData.date || ''} onChange={e => setEditData(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Job Number *</Label>
                <Input value={editData.job_number || ''} onChange={e => setEditData(p => ({ ...p, job_number: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Linked Hardware Checklist</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={editData.hardware_checklist_id || ''}
                  onChange={e => setEditData(p => ({ ...p, hardware_checklist_id: e.target.value || null }))}
                >
                  <option value="">— Select —</option>
                  {hardwareChecklists.map(hc => (
                    <option key={hc.id} value={hc.id}>
                      {hc.technician} — {hc.date} (Truck {hc.truck_number || '—'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Linked Material Transfer Sheet</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={editData.material_transfer_sheet_id || ''}
                  onChange={e => setEditData(p => ({ ...p, material_transfer_sheet_id: e.target.value || null }))}
                >
                  <option value="">— Select —</option>
                  {transferSheets.map(ts => (
                    <option key={ts.id} value={ts.id}>
                      {ts.technician} — {ts.date} (Truck {ts.truck_number || '—'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Warehouse Associate</Label>
                <Input value={editData.warehouse_associate || ''} onChange={e => setEditData(p => ({ ...p, warehouse_associate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Forklift Required</Label>
                <div className="flex items-center gap-2 h-9">
                  <Switch checked={editData.forklift_required || false} onCheckedChange={v => setEditData(p => ({ ...p, forklift_required: v }))} />
                  <span className="text-sm text-muted-foreground">{editData.forklift_required ? 'Yes' : 'No'}</span>
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Notes</Label>
                <Textarea rows={3} value={editData.notes || ''} onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))} />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setEditing(false); setEditData(record); }}>Cancel</Button>
                <Button onClick={handleSaveEdit} className="bg-accent text-accent-foreground hover:bg-accent/90">Save Changes</Button>
              </div>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              <DetailField label="Technician" value={record.technician} />
              <DetailField label="Truck Number" value={record.truck_number} />
              <DetailField label="Date" value={record.date} />
              <DetailField label="Job Number" value={record.job_number} />
              <DetailField label="Warehouse Associate" value={record.warehouse_associate || '—'} />
              <DetailField label="Forklift Required" value={record.forklift_required ? 'Yes' : 'No'} />
              <DetailField label="Hardware Checklist Linked" value={record.hardware_checklist_id ? 'Yes' : 'No'} />
              <DetailField label="Transfer Sheet Linked" value={record.material_transfer_sheet_id ? 'Yes' : 'No'} />
              <DetailField label="Related SOP" value={record.related_sop_id || 'WH-101'} />
              <DetailField label="Total Loading Time" value={record.total_loading_time_minutes != null ? `${record.total_loading_time_minutes} min` : '—'} />
              {record.notes && (
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-sm">{record.notes}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DetailField({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}