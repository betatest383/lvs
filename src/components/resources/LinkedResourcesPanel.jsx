import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useCurrentRole } from '@/hooks/useCurrentRole';
import { hasResourceCapability } from '@/lib/roleUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Loader2, FileText, Image as ImageIcon, Video, ExternalLink, FolderOpen,
  Plus, X, AlertCircle, RotateCcw, Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { RELATIONSHIP_BY_ENTITY } from '@/lib/resourceLinkConfig';

/**
 * Bidirectional resource panel — embeds on any entity detail page to show
 * all ProductResources that link to that entity.
 *
 * Props:
 * - entityType: string — entity name (e.g. 'InventoryMaster')
 * - entityId: string — the entity record ID
 * - title: string — panel title (default: 'Resources')
 */
export default function LinkedResourcesPanel({ entityType, entityId, title = 'Resources' }) {
  const { role } = useCurrentRole();
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const canManage = hasResourceCapability(role, 'resource.manage');

  const relConfig = RELATIONSHIP_BY_ENTITY[entityType];
  const linkField = relConfig?.linkField;
  const isArray = relConfig?.isArray !== false;

  const fetchResources = useCallback(async () => {
    const res = await base44.functions.invoke('manageProductResource', {
      action: 'get_related_resources',
      entity_type: entityType,
      entity_id: entityId,
    });
    if (res.data?.success) {
      return res.data.resources || [];
    }
    throw new Error(res.data?.error || 'Failed to load resources');
  }, [entityType, entityId]);

  const load = useCallback(async () => {
    if (!entityId || !linkField) return;
    setLoading(true);
    setError(null);
    try {
      const rsrcs = await fetchResources();
      setResources(rsrcs);
    } catch (err) {
      console.error(`[LinkedResourcesPanel] Load failed for ${entityType}:${entityId}`, err);
      setError(err.message || 'Failed to load resources');
    } finally {
      setLoading(false);
    }
  }, [fetchResources, entityId, linkField]);

  useEffect(() => { load(); }, [load]);

  const handleRemoveLink = async (resourceId) => {
    if (!entityId) return;
    setActionLoading(true);
    try {
      const res = await base44.functions.invoke('manageProductResource', {
        action: 'remove_link',
        resource_id: resourceId,
        entity_type: entityType,
        entity_id: entityId,
      });
      if (!res.data?.success) {
        toast.error(res.data?.error || 'The link could not be removed. Please try again.');
        return;
      }
      // Re-fetch to verify the removal persisted
      const verified = await fetchResources();
      if (!verified.some(r => r.id === resourceId)) {
        setResources(verified);
        toast.success('Link removed');
      } else {
        toast.error('The link could not be removed. Please try again.');
      }
    } catch (err) {
      console.error(`[LinkedResourcesPanel] Remove failed for ${entityType}:${entityId}`, err);
      toast.error(err.message || 'The link could not be removed. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddLink = async (resourceId) => {
    if (!entityId) {
      toast.error('Save the SOP before linking resources.');
      return;
    }
    if (resources.some(r => r.id === resourceId)) {
      toast.error('This resource is already linked.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await base44.functions.invoke('manageProductResource', {
        action: 'add_link',
        resource_id: resourceId,
        entity_type: entityType,
        entity_id: entityId,
      });
      if (!res.data?.success) {
        toast.error(res.data?.error || 'The resource could not be linked. Please try again.');
        return;
      }
      // Re-fetch to verify the link actually persisted before showing success
      const verified = await fetchResources();
      if (verified.some(r => r.id === resourceId)) {
        setResources(verified);
        setAddOpen(false);
        toast.success(res.data.already_linked ? 'Resource already linked' : 'Resource linked');
      } else {
        toast.error('The resource could not be linked. Please try again.');
      }
    } catch (err) {
      console.error(`[LinkedResourcesPanel] Add failed for ${entityType}:${entityId}`, err);
      toast.error(err.message || 'The resource could not be linked. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const getIcon = (resource) => {
    const ft = resource.file_type || '';
    const fn = resource.file_name || '';
    if (ft.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(fn)) return ImageIcon;
    if (ft.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(fn)) return Video;
    return FileText;
  };

  const displayName = (r) => r.title || r.file_name || 'Untitled Resource';

  return (
    <>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="w-4 h-4" /> {title}
            {resources.length > 0 && (
              <span className="text-xs text-muted-foreground">({resources.length})</span>
            )}
          </CardTitle>
          {canManage && entityId && (
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} disabled={actionLoading}>
              <Plus className="w-3 h-3 mr-1" /> Add Resource
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading resources...
            </div>
          ) : error ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Linked resources could not be loaded. The rest of this record is still available.
              </p>
              <Button size="sm" variant="outline" onClick={load}>
                <RotateCcw className="w-3 h-3 mr-1" /> Retry
              </Button>
            </div>
          ) : resources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No resources linked to this record.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {resources.map((r) => {
                const Icon = getIcon(r);
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 p-2 rounded-md border hover:bg-muted/50 transition-colors group"
                  >
                    <Link to={`/resources/detail/${r.id}`} className="flex items-center gap-2 flex-1 min-w-0">
                      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate group-hover:text-primary">{displayName(r)}</p>
                        <p className="text-xs text-muted-foreground">{r.resource_type}</p>
                      </div>
                      <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </Link>
                    {canManage && (
                      <button
                        onClick={() => handleRemoveLink(r.id)}
                        disabled={actionLoading}
                        className="text-muted-foreground hover:text-destructive p-1 rounded shrink-0 disabled:opacity-50"
                        title="Remove link"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {addOpen && (
        <AddResourceDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onAdd={handleAddLink}
          excludeIds={resources.map(r => r.id)}
          actionLoading={actionLoading}
        />
      )}
    </>
  );
}

function AddResourceDialog({ open, onOpenChange, onAdd, excludeIds, actionLoading }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  const doSearch = useCallback(async (q) => {
    setSearching(true);
    try {
      const res = await base44.functions.invoke('manageProductResource', {
        action: 'list',
        search: q || undefined,
        limit: 20,
      });
      if (res.data?.success) {
        setResults(res.data.resources || []);
      }
    } catch { /* non-fatal */ }
    finally { setSearching(false); }
  }, []);

  useEffect(() => {
    if (!open) { setSearch(''); setResults([]); return; }
    doSearch('');
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [open, doSearch]);

  const handleSearchChange = (val) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 400);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!actionLoading) onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Resource</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search resources by title, manufacturer, model..."
              className="pl-9"
              autoFocus
            />
          </div>
          {searching ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No resources found.</p>
          ) : (
            <div className="max-h-[300px] overflow-y-auto space-y-1">
              {results.map(r => {
                const isExcluded = excludeIds.includes(r.id);
                return (
                  <button
                    key={r.id}
                    onClick={() => !isExcluded && !actionLoading && onAdd(r.id)}
                    disabled={isExcluded || actionLoading}
                    className={`w-full text-left p-2 rounded-md border text-sm transition-colors ${
                      isExcluded
                        ? 'opacity-50 cursor-not-allowed border-muted'
                        : 'hover:bg-muted/50 hover:border-primary'
                    }`}
                  >
                    <span className="font-medium">{r.title || r.file_name || 'Untitled Resource'}</span>
                    <span className="text-xs text-muted-foreground ml-2">{r.resource_type}</span>
                    {r.manufacturer && <span className="text-xs text-muted-foreground ml-2">· {r.manufacturer}</span>}
                    {isExcluded && <span className="text-xs text-amber-600 ml-2">· Already linked</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}