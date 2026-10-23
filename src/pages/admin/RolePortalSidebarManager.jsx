import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ChevronLeft, Eye, EyeOff, Ban, Clock, RotateCcw, Send, CalendarClock, Save, FileEdit, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { adminSidebarSections } from '@/components/layout/adminSidebarConfig';
import { getRoleNav, ROLE_CONFIG } from '@/components/dashboard/roleConfig';
import { useAuth } from '@/lib/AuthContext';
import PortalVersionManager from '@/components/admin/PortalVersionManager';

const VISIBILITY_OPTIONS = [
  { value: 'visible', label: 'Visible', icon: Eye, color: 'text-green-600' },
  { value: 'hidden_from_sidebar', label: 'Hidden from Sidebar', icon: EyeOff, color: 'text-amber-600' },
  { value: 'access_disabled', label: 'Access Disabled', icon: Ban, color: 'text-red-600' },
  { value: 'coming_soon', label: 'Coming Soon', icon: Clock, color: 'text-blue-600' },
];

const PROTECTED_ROUTES = ['/', '/admin/role-portal-manager', '/profile'];

const MANAGEABLE_ROLES = [
  'lead_technician', 'apprentice', 'warehouse_associate', 'inventory_specialist',
  'warehouse_manager', 'director_of_operations', 'operations_manager', 'office_manager',
  'csr', 'technician', 'customer', 'admin', 'owner',
];

function getRoleNavSections(role) {
  if (role === 'admin' || role === 'owner') {
    return adminSidebarSections.map(s => ({
      title: s.title,
      links: s.links.map(l => ({ to: l.to, label: l.label, icon: l.icon })),
    }));
  }
  return getRoleNav(role).map(g => ({
    title: g.label,
    links: g.items.map(item => ({ to: item.path, label: item.label, icon: item.icon })),
  }));
}

function loadOverridesFromRecord(record) {
  if (!record?.overrides_json) return {};
  try {
    const parsed = JSON.parse(record.overrides_json);
    const map = {};
    parsed.forEach(o => {
      map[o.route] = {
        visibility: o.visibility,
        reason: o.reason || '',
        coming_soon_explanation: o.coming_soon_explanation || '',
      };
    });
    return map;
  } catch {
    return {};
  }
}

export default function RolePortalSidebarManager() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const authorName = user?.full_name || user?.email || 'admin';
  const [selectedRole, setSelectedRole] = useState('warehouse_manager');
  const [overrides, setOverrides] = useState({});
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [previewMode, setPreviewMode] = useState(false);
  const [internalReason, setInternalReason] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allVersions, setAllVersions] = useState([]);
  const [selectedVersionId, setSelectedVersionId] = useState(null);

  // Load ALL versions for the selected role, and populate the editor from the active published version
  useEffect(() => {
    setLoading(true);
    setOverrides({});
    setSelectedItems(new Set());
    setSelectedVersionId(null);
    base44.entities.NavigationVisibilityOverride.filter(
      { role: selectedRole },
      '-created_date', 100
    ).then(records => {
      setAllVersions(records);
      const currentPublished = records.find(r => r.status === 'published' && r.is_active);
      if (currentPublished) {
        setOverrides(loadOverridesFromRecord(currentPublished));
        setSelectedVersionId(currentPublished.id);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [selectedRole]);

  const navSections = useMemo(() => getRoleNavSections(selectedRole), [selectedRole]);

  const activeVersion = allVersions.find(v => v.status === 'published' && v.is_active);
  const scheduledVersion = allVersions.find(v => v.status === 'scheduled' && v.is_active);
  const selectedVersion = allVersions.find(v => v.id === selectedVersionId);

  // Builder is read-only when viewing Active or Archived versions
  const builderReadOnly = !!(selectedVersion && (selectedVersion.status === 'published' || selectedVersion.status === 'archived'));

  const getVisibility = (route) => overrides[route]?.visibility || 'visible';

  const setVisibility = (route, visibility) => {
    if (builderReadOnly) return;
    setOverrides(prev => ({
      ...prev,
      [route]: { ...prev[route], visibility, reason: internalReason },
    }));
  };

  const setSectionVisibility = (section, visibility) => {
    if (builderReadOnly) return;
    setOverrides(prev => {
      const next = { ...prev };
      for (const link of section.links) {
        if (PROTECTED_ROUTES.includes(link.to) && selectedRole === 'owner') continue;
        next[link.to] = { ...next[link.to], visibility, reason: internalReason };
      }
      return next;
    });
  };

  const toggleSelect = (route) => {
    if (builderReadOnly) return;
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(route)) next.delete(route);
      else next.add(route);
      return next;
    });
  };

  const applyBulkVisibility = (visibility) => {
    if (builderReadOnly) return;
    setOverrides(prev => {
      const next = { ...prev };
      for (const route of selectedItems) {
        if (PROTECTED_ROUTES.includes(route) && selectedRole === 'owner') continue;
        next[route] = { ...next[route], visibility, reason: internalReason };
      }
      return next;
    });
    setSelectedItems(new Set());
  };

  const restoreDefaults = () => {
    if (builderReadOnly) return;
    setOverrides({});
    setSelectedItems(new Set());
    setInternalReason('');
    toast.success('Restored inherited role defaults (working draft)');
  };

  const reloadVersions = async () => {
    const records = await base44.entities.NavigationVisibilityOverride.filter(
      { role: selectedRole },
      '-created_date', 100
    );
    setAllVersions(records);
    return records;
  };

  // Version selection — loads a version into the builder
  const handleSelectVersion = (version) => {
    setOverrides(loadOverridesFromRecord(version));
    setSelectedVersionId(version.id);
    setSelectedItems(new Set());
    setPreviewMode(false);
  };

  // Create new version — keeps current overrides as starting point, makes builder editable
  const handleCreateNewVersion = () => {
    setSelectedVersionId(null);
    setSelectedItems(new Set());
    setPreviewMode(false);
    toast.info('New version draft started from current builder state. Edit and publish when ready.');
  };

  // Save Draft — creates or updates a draft record
  const handleSaveDraft = async () => {
    setPublishing(true);
    try {
      const overridesArray = Object.entries(overrides).map(([route, config]) => ({
        route,
        visibility: config.visibility,
        reason: config.reason || internalReason,
        coming_soon_explanation: config.coming_soon_explanation || '',
      }));

      const existingDraft = selectedVersion && selectedVersion.status === 'draft'
        ? selectedVersion : null;

      if (existingDraft) {
        await base44.entities.NavigationVisibilityOverride.update(existingDraft.id, {
          overrides_json: JSON.stringify(overridesArray),
          internal_reason: internalReason || existingDraft.internal_reason,
        });
        const records = await reloadVersions();
        toast.success('Draft saved.', {
          description: `Version ${existingDraft.version} · Role: ${ROLE_CONFIG[selectedRole]?.label || selectedRole}`,
        });
      } else {
        let version = 1;
        if (activeVersion) version = (activeVersion.version || 1) + 1;
        else if (scheduledVersion) version = (scheduledVersion.version || 1) + 1;
        else if (allVersions.length > 0) version = Math.max(...allVersions.map(v => v.version || 0)) + 1;

        const created = await base44.entities.NavigationVisibilityOverride.create({
          role: selectedRole,
          status: 'draft',
          version,
          overrides_json: JSON.stringify(overridesArray),
          landing_page_override: null,
          scheduled_publish_at: null,
          published_at: null,
          published_by: authorName,
          internal_reason: internalReason || 'Draft saved',
          is_active: false,
        });
        const records = await reloadVersions();
        setSelectedVersionId(created.id);
        toast.success('Draft saved.', {
          description: `Version ${version} · Role: ${ROLE_CONFIG[selectedRole]?.label || selectedRole}`,
        });
      }
    } catch (e) {
      toast.error('Failed to save draft: ' + e.message);
    }
    setPublishing(false);
  };

  const handlePublishNow = async () => {
    const roleConfig = ROLE_CONFIG[selectedRole];
    const landingRoute = roleConfig?.landingPage || '/';
    if (getVisibility(landingRoute) === 'access_disabled') {
      toast.error(`The role's landing page (${landingRoute}) is Access Disabled. Select a replacement before publishing.`);
      return;
    }
    if (!internalReason.trim() && Object.keys(overrides).length > 0) {
      toast.error('Internal reason is required when publishing visibility changes.');
      return;
    }

    setPublishing(true);
    try {
      const overridesArray = Object.entries(overrides).map(([route, config]) => ({
        route,
        visibility: config.visibility,
        reason: config.reason || internalReason,
        coming_soon_explanation: config.coming_soon_explanation || '',
      }));

      let version = 1;
      if (activeVersion) {
        version = (activeVersion.version || 1) + 1;
        await base44.entities.NavigationVisibilityOverride.update(activeVersion.id, {
          status: 'archived',
          is_active: false,
        });
      }
      if (scheduledVersion) {
        await base44.entities.NavigationVisibilityOverride.update(scheduledVersion.id, {
          status: 'archived',
          is_active: false,
        });
      }

      const created = await base44.entities.NavigationVisibilityOverride.create({
        role: selectedRole,
        status: 'published',
        version,
        overrides_json: JSON.stringify(overridesArray),
        landing_page_override: null,
        scheduled_publish_at: null,
        published_at: new Date().toISOString(),
        published_by: authorName,
        internal_reason: internalReason,
        is_active: true,
      });

      const records = await reloadVersions();
      const newActive = records.find(r => r.status === 'published' && r.is_active);
      if (newActive) setSelectedVersionId(newActive.id);
      toast.success('Dashboard published successfully.', {
        description: `Active for: ${ROLE_CONFIG[selectedRole]?.label || selectedRole} · Version: ${version} · Effective: Immediately`,
      });
      setInternalReason('');
      setScheduleAt('');
    } catch (e) {
      toast.error('Failed to publish: ' + e.message);
    }
    setPublishing(false);
  };

  const handleSchedule = async () => {
    if (!scheduleAt) {
      toast.error('A date and time is required to schedule.');
      return;
    }
    const scheduledDate = new Date(scheduleAt);
    if (isNaN(scheduledDate.getTime())) {
      toast.error('Invalid schedule date.');
      return;
    }
    if (scheduledDate.getTime() <= Date.now()) {
      toast.error('Schedule time must be in the future.');
      return;
    }
    if (!internalReason.trim() && Object.keys(overrides).length > 0) {
      toast.error('Internal reason is required when scheduling visibility changes.');
      return;
    }

    setPublishing(true);
    try {
      const overridesArray = Object.entries(overrides).map(([route, config]) => ({
        route,
        visibility: config.visibility,
        reason: config.reason || internalReason,
        coming_soon_explanation: config.coming_soon_explanation || '',
      }));

      let version = 1;
      if (activeVersion) version = (activeVersion.version || 1) + 1;
      else if (scheduledVersion) version = (scheduledVersion.version || 1) + 1;

      if (scheduledVersion) {
        await base44.entities.NavigationVisibilityOverride.update(scheduledVersion.id, {
          status: 'archived',
          is_active: false,
        });
      }

      const created = await base44.entities.NavigationVisibilityOverride.create({
        role: selectedRole,
        status: 'scheduled',
        version,
        overrides_json: JSON.stringify(overridesArray),
        landing_page_override: null,
        scheduled_publish_at: scheduledDate.toISOString(),
        published_at: null,
        published_by: authorName,
        internal_reason: internalReason,
        is_active: true,
      });

      const records = await reloadVersions();
      const newScheduled = records.find(r => r.status === 'scheduled' && r.is_active);
      if (newScheduled) setSelectedVersionId(newScheduled.id);
      toast.success('Dashboard scheduled successfully.', {
        description: `Role: ${ROLE_CONFIG[selectedRole]?.label || selectedRole} · Activation: ${scheduledDate.toLocaleString()} · Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
      });
      setInternalReason('');
      setScheduleAt('');
    } catch (e) {
      toast.error('Failed to schedule: ' + e.message);
    }
    setPublishing(false);
  };

  const handleCancelScheduled = async (versionId) => {
    setPublishing(true);
    try {
      await base44.entities.NavigationVisibilityOverride.update(versionId, {
        status: 'archived',
        is_active: false,
      });
      const records = await reloadVersions();
      // If the cancelled version was selected, switch back to active
      if (selectedVersionId === versionId) {
        const currentActive = records.find(r => r.status === 'published' && r.is_active);
        if (currentActive) {
          setOverrides(loadOverridesFromRecord(currentActive));
          setSelectedVersionId(currentActive.id);
        }
      }
      toast.success('Scheduled version cancelled. The active published version remains in effect.');
    } catch (e) {
      toast.error('Cancel failed: ' + e.message);
    }
    setPublishing(false);
  };

  const handleActivateNow = async (versionId) => {
    setPublishing(true);
    try {
      if (activeVersion) {
        await base44.entities.NavigationVisibilityOverride.update(activeVersion.id, {
          status: 'archived',
          is_active: false,
        });
      }
      await base44.entities.NavigationVisibilityOverride.update(versionId, {
        status: 'published',
        published_at: new Date().toISOString(),
        published_by: authorName,
        scheduled_publish_at: null,
      });
      const records = await reloadVersions();
      const newActive = records.find(r => r.id === versionId);
      if (newActive) {
        setOverrides(loadOverridesFromRecord(newActive));
        setSelectedVersionId(newActive.id);
      }
      toast.success('Scheduled version activated immediately.', {
        description: `Version ${newActive?.version} is now Active for ${ROLE_CONFIG[selectedRole]?.label || selectedRole}`,
      });
    } catch (e) {
      toast.error('Activation failed: ' + e.message);
    }
    setPublishing(false);
  };

  const handleRestore = async (targetVersion, reason, restoreRequestId) => {
    setPublishing(true);
    try {
      // Idempotency: check if a version with this restore_request_id already exists
      const existing = await base44.entities.NavigationVisibilityOverride.filter(
        { role: selectedRole, restore_request_id: restoreRequestId },
        '-created_date', 5
      );
      if (existing.length > 0) {
        const existingRecord = existing[0];
        const records = await reloadVersions();
        const newActive = records.find(r => r.id === existingRecord.id);
        if (newActive) {
          setOverrides(loadOverridesFromRecord(newActive));
          setSelectedVersionId(newActive.id);
        }
        toast.info('This restore was already processed.', {
          description: `Version ${existingRecord.version} was already created from this request.`,
        });
        return {
          newVersionNumber: existingRecord.version,
          restoredFromVersion: existingRecord.restored_from_version,
          replacedVersion: existingRecord.replaced_version,
          restoredBy: existingRecord.restored_by,
          newVersionId: existingRecord.id,
        };
      }

      const replacedVersionNumber = activeVersion?.version || null;
      if (activeVersion && activeVersion.id !== targetVersion.id) {
        await base44.entities.NavigationVisibilityOverride.update(activeVersion.id, {
          status: 'archived',
          is_active: false,
        });
      }
      const newVersion = (activeVersion?.version || 1) + 1;
      const created = await base44.entities.NavigationVisibilityOverride.create({
        role: selectedRole,
        status: 'published',
        version: newVersion,
        overrides_json: targetVersion.overrides_json,
        landing_page_override: targetVersion.landing_page_override,
        published_at: new Date().toISOString(),
        published_by: authorName,
        internal_reason: `Restored from version ${targetVersion.version}`,
        is_active: true,
        restored_from_version: targetVersion.version,
        replaced_version: replacedVersionNumber,
        restored_by: authorName,
        restored_at: new Date().toISOString(),
        restore_reason: reason,
        restore_request_id: restoreRequestId,
      });
      const records = await reloadVersions();
      const newActive = records.find(r => r.status === 'published' && r.is_active);
      if (newActive) {
        setOverrides(loadOverridesFromRecord(newActive));
        setSelectedVersionId(newActive.id);
      }
      toast.success(`Restored from version ${targetVersion.version}`, {
        description: `New active version: ${newVersion} · Version ${replacedVersionNumber} archived · Effective: Immediately`,
      });
      return {
        newVersionNumber: newVersion,
        restoredFromVersion: targetVersion.version,
        replacedVersion: replacedVersionNumber,
        restoredBy: authorName,
        newVersionId: created.id,
      };
    } catch (e) {
      toast.error('Restore failed: ' + e.message);
      throw e;
    } finally {
      setPublishing(false);
    }
  };

  const hasChanges = Object.keys(overrides).length > 0;
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Builder mode indicator
  const builderModeLabel = (() => {
    if (!selectedVersion) return 'Editing New Draft (unsaved)';
    const s = selectedVersion.status;
    if (s === 'published' && selectedVersion.is_active) return `Viewing Active Version ${selectedVersion.version} (read-only)`;
    if (s === 'scheduled' && selectedVersion.is_active) return `Editing Scheduled Version ${selectedVersion.version}`;
    if (s === 'draft') return `Editing Draft Version ${selectedVersion.version}`;
    if (s === 'archived') return `Viewing Archived Version ${selectedVersion.version} (read-only)`;
    return 'Editing';
  })();

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/roles')} title="Back to Role Registry">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Role Portal & Sidebar Manager</h1>
          <p className="text-sm text-muted-foreground">Control navigation visibility per role. Hidden = navigation only. Disabled = blocks direct URL access.</p>
        </div>
      </div>

      {/* Role selector + version manager */}
      {!loading && (
        <PortalVersionManager
          versions={allVersions}
          selectedVersionId={selectedVersionId}
          onSelectVersion={handleSelectVersion}
          onRestore={handleRestore}
          onCancelScheduled={handleCancelScheduled}
          onActivateNow={handleActivateNow}
          onCreateNewVersion={handleCreateNewVersion}
          publishing={publishing}
        />
      )}

      {/* Builder mode indicator */}
      {!loading && (
        <Card>
          <CardContent className="p-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {builderReadOnly ? <Lock className="w-4 h-4 text-amber-600" /> : <FileEdit className="w-4 h-4 text-blue-600" />}
              <span className="text-sm font-medium">{builderModeLabel}</span>
              {selectedVersion && (
                <span className="text-xs text-muted-foreground">
                  · Role: {ROLE_CONFIG[selectedRole]?.label || selectedRole} · ID: {selectedVersion.id.slice(-8)}
                </span>
              )}
            </div>
            {selectedVersion?.published_at && (
              <span className="text-xs text-muted-foreground">Published: {new Date(selectedVersion.published_at).toLocaleString()}</span>
            )}
            {selectedVersion?.scheduled_publish_at && (
              <span className="text-xs text-muted-foreground">Activates: {new Date(selectedVersion.scheduled_publish_at).toLocaleString()}</span>
            )}
          </CardContent>
        </Card>
      )}

      {/* Action bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MANAGEABLE_ROLES.map(r => (
                  <SelectItem key={r} value={r}>{ROLE_CONFIG[r]?.label || r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={restoreDefaults} disabled={!hasChanges || builderReadOnly}>
              <RotateCcw className="w-4 h-4 mr-1" /> Restore Defaults
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreviewMode(!previewMode)} disabled={!hasChanges}>
              <Eye className="w-4 h-4 mr-1" /> {previewMode ? 'Edit Mode' : 'Preview as Role'}
            </Button>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={publishing || builderReadOnly || !hasChanges}>
              {publishing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Save Draft
            </Button>
            <Button variant="default" size="sm" onClick={handlePublishNow} disabled={publishing || !hasChanges || builderReadOnly}>
              {publishing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
              Publish Now
            </Button>
            <Button variant="outline" size="sm" onClick={handleSchedule} disabled={publishing || !hasChanges || builderReadOnly || !scheduleAt} title={!scheduleAt ? 'Set a schedule date first' : ''}>
              {publishing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CalendarClock className="w-4 h-4 mr-1" />}
              Schedule
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Internal Reason (required)</label>
              <Input value={internalReason} onChange={e => setInternalReason(e.target.value)} placeholder="e.g. Removing legacy reports for Lead Technicians" disabled={builderReadOnly} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Schedule Activation ({userTimezone})</label>
              <Input type="datetime-local" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)} disabled={builderReadOnly} />
            </div>
          </div>

          {selectedItems.size > 0 && (
            <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
              <span className="text-sm font-medium">{selectedItems.size} selected</span>
              <Select onValueChange={applyBulkVisibility}>
                <SelectTrigger className="w-[200px] h-8"><SelectValue placeholder="Apply to selected..." /></SelectTrigger>
                <SelectContent>
                  {VISIBILITY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => setSelectedItems(new Set())}>Clear</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Builder */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
      ) : (
        <div className="space-y-3">
          {builderReadOnly && (
            <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-xs text-amber-800">This version is read-only. Click "Create New Version" above to make edits.</span>
            </div>
          )}
          {navSections.map(section => {
            const visibleCount = section.links.filter(l => {
              const v = getVisibility(l.to);
              return v !== 'hidden_from_sidebar' && v !== 'access_disabled';
            }).length;
            const totalCount = section.links.length;
            const firstVis = section.links.length > 0 ? getVisibility(section.links[0].to) : 'visible';
            const allSame = section.links.every(l => getVisibility(l.to) === firstVis);
            const isAutoHidden = previewMode && visibleCount === 0 && totalCount > 0;

            return (
              <Card key={section.title} className={isAutoHidden ? 'opacity-40' : ''}>
                <CardContent className="p-0">
                  <div className="flex items-center justify-between p-3 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{section.title}</span>
                      <Badge variant="outline" className="text-[10px]">{visibleCount}/{totalCount} visible</Badge>
                      {isAutoHidden && <Badge variant="outline" className="text-[10px] text-red-600 border-red-300">Auto-hidden</Badge>}
                    </div>
                    <Select
                      value={allSame ? firstVis : ''}
                      onValueChange={v => setSectionVisibility(section, v)}
                      disabled={builderReadOnly || previewMode}
                    >
                      <SelectTrigger className="w-[190px] h-8"><SelectValue placeholder="Section: mixed" /></SelectTrigger>
                      <SelectContent>
                        {VISIBILITY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="divide-y">
                    {section.links.map(link => {
                      const vis = getVisibility(link.to);
                      const isProtected = PROTECTED_ROUTES.includes(link.to) && selectedRole === 'owner';
                      const isHidden = vis === 'hidden_from_sidebar' || vis === 'access_disabled';
                      if (previewMode && isHidden) return null;
                      return (
                        <div key={link.to} className={`flex items-center justify-between px-3 py-2 ${isHidden ? 'opacity-50' : ''}`}>
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {!previewMode && (
                              <Checkbox checked={selectedItems.has(link.to)} onCheckedChange={() => toggleSelect(link.to)} disabled={isProtected || builderReadOnly} />
                            )}
                            <span className="text-sm truncate">{link.label}</span>
                            <span className="text-[10px] text-muted-foreground font-mono truncate">{link.to}</span>
                            {isProtected && <Badge variant="outline" className="text-[9px] text-blue-700 border-blue-300">Protected</Badge>}
                          </div>
                          <Select value={vis} onValueChange={v => setVisibility(link.to, v)} disabled={isProtected || previewMode || builderReadOnly}>
                            <SelectTrigger className="w-[175px] h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {VISIBILITY_OPTIONS.map(o => (
                                <SelectItem key={o.value} value={o.value}>
                                  <span className={o.color}>{o.label}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}