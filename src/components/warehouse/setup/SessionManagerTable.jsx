import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Archive, Copy, Trash2, AlertTriangle, CheckCircle2, Clock, Loader2, FlaskConical, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { archiveSession, duplicateSession, deleteSession } from '@/lib/warehouseSetupSession';

const STEP_LABELS = ['Create Location', 'Add Bins', 'Assign Materials', 'Inventory Count', 'Review', 'Activate'];

const STATUS_CONFIG = {
  in_progress: { label: 'In Progress', color: 'text-blue-600 bg-blue-50' },
  awaiting_review: { label: 'Awaiting Review', color: 'text-amber-600 bg-amber-50' },
  approved: { label: 'Approved', color: 'text-green-600 bg-green-50' },
  posting: { label: 'Posting', color: 'text-purple-600 bg-purple-50' },
  partially_posted: { label: 'Partially Posted', color: 'text-orange-600 bg-orange-50' },
  completed: { label: 'Completed', color: 'text-green-700 bg-green-100' },
  abandoned: { label: 'Archived', color: 'text-gray-500 bg-gray-100' },
};

function calcProgress(session) {
  const counts = session.count_data_json ? (() => { try { return JSON.parse(session.count_data_json); } catch { return {}; } })() : {};
  const assigned = session.assigned_item_ids?.length || 0;
  const counted = Object.values(counts).filter(v => v?.count !== undefined && v?.count !== '').length;
  const step = session.current_step || 0;
  const stepPct = ((step + 1) / 6) * 100;
  if (session.status === 'completed') return 100;
  if (assigned > 0) return Math.round((counted / assigned) * 100);
  return Math.round(stepPct);
}

export default function SessionManagerTable({ sessions, onRefresh, canDelete, canStartTest, isTestTab, onClassifyAsTest, onClassifyAsProduction }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiving, setArchiving] = useState(false);

  const handleResume = (session) => {
    navigate(`/warehouse/setup/${session.id}`);
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await archiveSession(archiveTarget.id);
      toast({ title: 'Session archived', description: `${archiveTarget.session_id} has been preserved for audit.` });
      setArchiveTarget(null);
      onRefresh();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Archive failed', description: e.response?.data?.error || e.message });
    } finally {
      setArchiving(false);
    }
  };

  const handleDuplicate = async (session) => {
    try {
      const { session: newSession } = await duplicateSession(session.id);
      toast({ title: 'Session duplicated', description: `New session ${newSession.session_id} created at Step 1.` });
      onRefresh();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Duplicate failed', description: e.response?.data?.error || e.message });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSession(deleteTarget.id);
      toast({ title: 'Session deleted', description: `${deleteTarget.session_id} has been permanently removed.` });
      setDeleteTarget(null);
      onRefresh();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Delete failed', description: e.response?.data?.error || e.message });
    }
  };

  if (sessions.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground border rounded-lg">
        <Clock className="w-10 h-10 mx-auto mb-2 opacity-40" />
        <p>No sessions in this category.</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3 font-medium">Session ID</th>
              <th className="text-left p-3 font-medium">Warehouse</th>
              <th className="text-left p-3 font-medium">Started By</th>
              <th className="text-left p-3 font-medium">Date Created</th>
              <th className="text-left p-3 font-medium">Last Activity</th>
              <th className="text-left p-3 font-medium">Step</th>
              <th className="text-left p-3 font-medium">Assigned</th>
              <th className="text-left p-3 font-medium">Counted</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium">Progress</th>
              <th className="text-right p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sessions.map(session => {
              const config = STATUS_CONFIG[session.status] || STATUS_CONFIG.in_progress;
              const progress = calcProgress(session);
              const step = session.current_step || 0;
              const isArchived = session.status === 'abandoned';
              const isCompleted = session.status === 'completed';
              const canArchive = !isArchived && !isCompleted;
              const canResume = !isArchived;
              const assignedCount = session.assigned_item_ids?.length || 0;
              const countData = session.count_data_json ? (() => { try { return JSON.parse(session.count_data_json); } catch { return {}; } })() : {};
              const countedCount = Object.values(countData).filter(v => v?.count !== undefined && v?.count !== '').length;

              return (
                <tr key={session.id} className="hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs">{session.session_id}</td>
                  <td className="p-3">{session.warehouse_location_name || '—'}</td>
                  <td className="p-3 text-xs">{session.started_by}</td>
                  <td className="p-3 text-xs">{session.started_at ? new Date(session.started_at).toLocaleDateString() : '—'}</td>
                  <td className="p-3 text-xs">{session.updated_date ? new Date(session.updated_date).toLocaleDateString() : '—'}</td>
                  <td className="p-3 text-xs">{step + 1}/6 — {STEP_LABELS[step] || '—'}</td>
                  <td className="p-3 text-xs font-medium">{assignedCount}</td>
                  <td className="p-3 text-xs font-medium">{countedCount}</td>
                  <td className="p-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.color}`}>
                      {config.label}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-muted rounded-full h-1.5 overflow-hidden">
                        <div className={`h-full ${isCompleted ? 'bg-green-500' : isArchived ? 'bg-gray-400' : 'bg-accent'}`} style={{ width: `${progress}%` }} />
                      </div>
                      <span className="text-xs font-bold text-muted-foreground">{progress}%</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      {canResume && (
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleResume(session)} title="Resume">
                          <Play className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {canArchive && (
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setArchiveTarget(session)} title="Archive">
                          <Archive className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDuplicate(session)} title="Duplicate">
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      {canDelete && (isArchived || session.status === 'in_progress') && (
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(session)} title="Delete Draft">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {isTestTab ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => onClassifyAsProduction?.(session)}
                          title="Restore to production"
                        >
                          <ArrowUpRight className="w-3 h-3" /> Production
                        </Button>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-amber-600 hover:text-amber-700"
                          onClick={() => onClassifyAsTest?.(session)}
                          title="Classify as Test"
                        >
                          <FlaskConical className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-background rounded-lg border p-6 max-w-md w-full space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <h3 className="font-semibold">Delete Session?</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Session <span className="font-mono font-medium">{deleteTarget.session_id}</span> will be permanently deleted.
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete}>
                <Trash2 className="w-4 h-4" /> Delete Permanently
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Archive Confirmation Dialog ── */}
      {archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => !archiving && setArchiveTarget(null)}>
          <div className="bg-background rounded-lg border p-6 max-w-md w-full space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h3 className="font-semibold">Archive this warehouse setup?</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Session <span className="font-mono font-medium">{archiveTarget.session_id}</span> will be moved to Archived.
              The session will remain available for audit but cannot be resumed unless restored.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setArchiveTarget(null)} disabled={archiving}>Cancel</Button>
              <Button variant="destructive" onClick={handleArchive} disabled={archiving}>
                {archiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                Archive Session
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}