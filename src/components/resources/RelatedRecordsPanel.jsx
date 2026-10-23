import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, X, Link2, Plus } from 'lucide-react';
import {
  Factory, Package, Wrench, ClipboardList, GraduationCap, FileText, HelpCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { RELATIONSHIP_TYPES } from '@/lib/resourceLinkConfig';
import SearchableEntityPicker from './SearchableEntityPicker';

const ICON_MAP = {
  Factory, Package, Wrench, ClipboardList, GraduationCap, FileText, HelpCircle,
};

/**
 * Unified Related Records panel — replaces 7 separate manual ID-entry sections.
 * Shows all linked records as chips with type icons and remove buttons.
 * "Add Link" opens a dialog with a type selector and searchable picker.
 *
 * Props:
 * - resource: ProductResource object
 * - canManage: boolean — show Add Link / remove buttons
 * - onLinkChange: (updatedResource) => void
 */
export default function RelatedRecordsPanel({ resource, canManage, onLinkChange }) {
  const [resolved, setResolved] = useState({});
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [activeType, setActiveType] = useState(RELATIONSHIP_TYPES[0].key);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!resource?.id) return;
    let cancelled = false;
    setLoading(true);
    base44.functions.invoke('manageProductResource', {
      action: 'resolve_links',
      resource_id: resource.id,
    }).then((res) => {
      if (!cancelled && res.data?.success) {
        setResolved(res.data.resolved || {});
      }
    }).catch(() => {}).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [resource?.id]);

  const handleAdd = async (relType, item) => {
    const field = relType.linkField;
    const currentVal = resource[field];
    let newVal;
    if (relType.isArray) {
      const arr = Array.isArray(currentVal) ? [...currentVal] : [];
      if (arr.includes(item.id)) {
        toast.error('Already linked');
        return;
      }
      arr.push(item.id);
      newVal = arr;
    } else {
      newVal = item.id;
    }
    setSaving(true);
    try {
      const res = await base44.functions.invoke('manageProductResource', {
        action: 'link',
        resource_id: resource.id,
        [field]: newVal,
      });
      if (res.data?.success) {
        const key = relType.key;
        setResolved((prev) => {
          if (relType.isArray) {
            return { ...prev, [key]: [...(prev[key] || []), { id: item.id, name: item.name, sub: item.sub }] };
          }
          return { ...prev, [key]: [{ id: item.id, name: item.name, sub: item.sub }] };
        });
        toast.success('Link added');
        onLinkChange?.(res.data.resource);
      } else {
        toast.error(res.data?.error || 'Failed to add link');
      }
    } catch (e) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  const handleRemove = async (relType, itemId) => {
    const field = relType.linkField;
    let newVal;
    if (relType.isArray) {
      newVal = (Array.isArray(resource[field]) ? resource[field] : []).filter((v) => v !== itemId);
    } else {
      newVal = '';
    }
    setSaving(true);
    try {
      const res = await base44.functions.invoke('manageProductResource', {
        action: 'link',
        resource_id: resource.id,
        [field]: newVal,
      });
      if (res.data?.success) {
        const key = relType.key;
        setResolved((prev) => {
          if (relType.isArray) {
            return { ...prev, [key]: (prev[key] || []).filter((r) => r.id !== itemId) };
          }
          return { ...prev, [key]: [] };
        });
        toast.success('Link removed');
        onLinkChange?.(res.data.resource);
      }
    } catch (e) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  const totalLinks = Object.values(resolved).reduce(
    (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0
  );
  const activeRel = RELATIONSHIP_TYPES.find((r) => r.key === activeType);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <Link2 className="h-4 w-4" /> Related Records
          {totalLinks > 0 && <span className="text-xs text-muted-foreground">({totalLinks})</span>}
        </CardTitle>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setAddDialogOpen(true)} disabled={saving}>
            <Plus className="h-3 w-3 mr-1" /> Add Link
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading linked records...
          </div>
        ) : totalLinks === 0 ? (
          <p className="text-sm text-muted-foreground">
            No linked records. Click <strong>Add Link</strong> to connect this resource to manufacturers, inventory, services, and more.
          </p>
        ) : (
          <div className="space-y-3">
            {RELATIONSHIP_TYPES.map((rel) => {
              const items = resolved[rel.key] || [];
              if (items.length === 0) return null;
              const Icon = ICON_MAP[rel.iconName] || Link2;
              return (
                <div key={rel.key}>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">{rel.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((item) => (
                      <span
                        key={item.id}
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs ${rel.color}`}
                      >
                        <Icon className="w-3 h-3 shrink-0" />
                        <span className="truncate max-w-[200px]">{item.name}</span>
                        {item.sub && <span className="text-muted-foreground opacity-70">· {item.sub}</span>}
                        {canManage && (
                          <button
                            onClick={() => handleRemove(rel, item.id)}
                            className="hover:text-destructive shrink-0 ml-0.5"
                            title="Remove link"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Add Link Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Related Record</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {RELATIONSHIP_TYPES.map((rel) => {
                const Icon = ICON_MAP[rel.iconName] || Link2;
                return (
                  <button
                    key={rel.key}
                    onClick={() => setActiveType(rel.key)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                      activeType === rel.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted border-input'
                    }`}
                  >
                    <Icon className="w-3 h-3" /> {rel.label}
                  </button>
                );
              })}
            </div>
            <SearchableEntityPicker
              entityType={activeRel?.entityName}
              onSelect={(item) => activeRel && handleAdd(activeRel, item)}
              excludeIds={(resolved[activeType] || []).map((r) => r.id)}
              placeholder={`Search ${activeRel?.label}...`}
            />
            {(resolved[activeType] || []).length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Currently linked:</p>
                <div className="flex flex-wrap gap-1.5">
                  {(resolved[activeType] || []).map((item) => (
                    <span
                      key={item.id}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs ${activeRel?.color}`}
                    >
                      {item.name}
                      <button
                        onClick={() => activeRel && handleRemove(activeRel, item.id)}
                        className="hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}