import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RotateCcw, X, Zap, CheckCircle2, CalendarClock, Archive, FileEdit, FolderOpen, FlaskConical, History } from 'lucide-react';
import RestoreVersionDialog from '@/components/admin/RestoreVersionDialog';
import RestoreSuccessDialog from '@/components/admin/RestoreSuccessDialog';

const STATUS_TABS = [
  { value: 'active', label: 'Active' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All Versions' },
];

function formatStatus(v) {
  if (v.data_classification === 'test') return 'Test Version';
  if (v.data_classification === 'superseded_test') return 'Superseded Test';
  if (v.status === 'published' && v.is_active) return 'Active';
  if (v.status === 'scheduled' && v.is_active) return 'Scheduled';
  if (v.status === 'draft') return 'Draft';
  if (v.status === 'archived') return 'Archived';
  return v.status;
}

function statusBadgeClass(status) {
  if (status === 'Test Version' || status === 'Superseded Test') return 'text-purple-600 border-purple-300';
  if (status === 'Active') return 'text-green-600 border-green-300';
  if (status === 'Scheduled') return 'text-blue-600 border-blue-300';
  if (status === 'Draft') return 'text-amber-600 border-amber-300';
  return 'text-muted-foreground';
}

function statusIcon(status) {
  if (status === 'Test Version' || status === 'Superseded Test') return FlaskConical;
  if (status === 'Active') return CheckCircle2;
  if (status === 'Scheduled') return CalendarClock;
  if (status === 'Draft') return FileEdit;
  return Archive;
}

function isTestVersion(v) {
  return v.data_classification === 'test' || v.data_classification === 'superseded_test';
}

/**
 * Version manager panel for NavigationVisibilityOverride records.
 * Shows tabs (Active / Scheduled / Archived / All) and version cards
 * filtered to the selected role. Explicit buttons load or act on versions.
 */
export default function PortalVersionManager({
  versions,
  selectedVersionId,
  onSelectVersion,
  onRestore,
  onCancelScheduled,
  onActivateNow,
  onCreateNewVersion,
  publishing,
  roleLabel,
}) {
  const [tab, setTab] = useState('active');
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [restoreReason, setRestoreReason] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);

  const counts = useMemo(() => ({
    active: versions.filter(v => v.status === 'published' && v.is_active && !isTestVersion(v)).length,
    scheduled: versions.filter(v => v.status === 'scheduled' && v.is_active && !isTestVersion(v)).length,
    archived: versions.filter(v => v.status === 'archived' && !isTestVersion(v)).length,
    all: versions.length,
  }), [versions]);

  const filtered = useMemo(() => {
    if (tab === 'all') return versions;
    if (tab === 'active') return versions.filter(v => v.status === 'published' && v.is_active && !isTestVersion(v));
    if (tab === 'scheduled') return versions.filter(v => v.status === 'scheduled' && v.is_active && !isTestVersion(v));
    if (tab === 'archived') return versions.filter(v => v.status === 'archived' && !isTestVersion(v));
    return versions;
  }, [versions, tab]);

  const activeVersion = versions.find(v => v.status === 'published' && v.is_active && !isTestVersion(v));
  const newVersionNumber = activeVersion ? (activeVersion.version || 1) + 1 : 1;

  const handleRestoreClick = (version) => {
    setRestoreTarget(version);
    setRestoreReason('');
  };

  const handleRestoreConfirm = async (reason) => {
    if (!restoreTarget || restoring) return;
    setRestoring(true);
    const restoreRequestId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      const result = await onRestore(restoreTarget, reason.trim(), restoreRequestId);
      setRestoreResult(result);
      setRestoreTarget(null);
    } catch {
      // parent shows toast on error
    } finally {
      setRestoring(false);
    }
  };

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="font-semibold text-sm">Configuration Versions</h3>
            <div className="flex gap-1 flex-wrap">
              {STATUS_TABS.map(t => (
                <Button
                  type="button"
                  key={t.value}
                  variant={tab === t.value ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setTab(t.value)}
                >
                  {t.label} ({counts[t.value] || 0})
                </Button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-muted-foreground">No versions in this category for the selected role.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(v => {
                const status = formatStatus(v);
                const Icon = statusIcon(status);
                const isSelected = v.id === selectedVersionId;
                const isActive = status === 'Active';
                const isScheduled = status === 'Scheduled';
                const isTest = isTestVersion(v);
                const canRestore = !isActive && !isScheduled && !isTest;

                return (
                  <div
                    key={v.id}
                    className={`p-3 border rounded-lg ${isSelected ? 'border-primary bg-accent/5' : ''} ${isTest ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={isActive ? 'default' : 'outline'} className="text-[10px]">Version {v.version}</Badge>
                          <Badge variant="outline" className={`text-[10px] ${statusBadgeClass(status)}`}>
                            <Icon className="w-2.5 h-2.5 mr-0.5" /> {status}
                          </Badge>
                          {v.published_by && <span className="text-[10px] text-muted-foreground">by {v.published_by}</span>}
                          {isSelected && <Badge variant="outline" className="text-[9px] text-primary border-primary">Loaded in Builder</Badge>}
                        </div>
                        <div className="text-[11px] text-muted-foreground space-y-0.5">
                          {isActive && v.published_at && <div>Active from: {new Date(v.published_at).toLocaleString()}</div>}
                          {isScheduled && v.scheduled_publish_at && <div>Activates: {new Date(v.scheduled_publish_at).toLocaleString()}</div>}
                          {status === 'Archived' && v.published_at && <div>Published: {new Date(v.published_at).toLocaleString()}</div>}
                          {status === 'Draft' && v.created_date && <div>Created: {new Date(v.created_date).toLocaleString()}</div>}
                          {v.restored_from_version && (
                            <div className="flex items-center gap-1 text-blue-600">
                              <History className="w-2.5 h-2.5" /> Restored from Version {v.restored_from_version}
                            </div>
                          )}
                          {v.replaced_version && (
                            <div className="text-muted-foreground">Replaced: Version {v.replaced_version}</div>
                          )}
                          {v.restored_by && <div>Restored by: {v.restored_by}</div>}
                          {v.restore_reason && <div className="truncate">Restore reason: {v.restore_reason}</div>}
                          {v.internal_reason && <div className="truncate">Reason: {v.internal_reason}</div>}
                          {v.overrides_json && (
                            <div>Overrides: {(() => { try { return JSON.parse(v.overrides_json).length; } catch { return 0; } })()}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onSelectVersion(v)}>
                          <FolderOpen className="w-3 h-3 mr-1" /> Open Version
                        </Button>
                        {isActive && (
                          <Badge variant="outline" className="text-[10px] text-green-600 border-green-300 h-7 flex items-center">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Currently Active
                          </Badge>
                        )}
                        {isScheduled && (
                          <>
                            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onActivateNow(v.id)} disabled={publishing || restoring}>
                              <Zap className="w-3 h-3 mr-1" /> Activate Now
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onCancelScheduled(v.id)} disabled={publishing || restoring}>
                              <X className="w-3 h-3 mr-1" /> Cancel
                            </Button>
                          </>
                        )}
                        {canRestore && (
                          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleRestoreClick(v)} disabled={publishing || restoring}>
                            {restoring ? <RotateCcw className="w-3 h-3 mr-1 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                            {restoring ? 'Restoring...' : 'Restore as New Active'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 pt-3 border-t">
            <Button type="button" variant="outline" size="sm" onClick={onCreateNewVersion} disabled={publishing || restoring}>
              <FileEdit className="w-4 h-4 mr-1" /> Create New Version
            </Button>
          </div>
        </CardContent>
      </Card>

      <RestoreVersionDialog
        open={!!restoreTarget}
        onOpenChange={(open) => { if (!open && !restoring) setRestoreTarget(null); }}
        targetVersion={restoreTarget}
        activeVersionNumber={activeVersion?.version}
        newVersionNumber={newVersionNumber}
        roleLabel={roleLabel}
        restoring={restoring}
        onConfirm={handleRestoreConfirm}
      />

      <RestoreSuccessDialog
        open={!!restoreResult}
        onOpenChange={(open) => { if (!open) setRestoreResult(null); }}
        result={restoreResult}
        onOpenActive={() => {
          if (restoreResult?.newVersionId) {
            const newActive = versions.find(v => v.id === restoreResult.newVersionId);
            if (newActive) onSelectVersion(newActive);
          }
        }}
      />
    </>
  );
}