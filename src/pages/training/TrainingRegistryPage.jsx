import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Loader2, GraduationCap, Archive } from 'lucide-react';
import { toast } from 'sonner';
import TrainingGuideFormDialog from '@/components/training/TrainingGuideFormDialog';
import { useCurrentRole } from '@/hooks/useCurrentRole';
import {
  TRAINING_STATUSES, TRAINING_STATUS_COLORS, TRAINING_TYPES, TRAINING_TYPE_COLORS,
  TRAINING_TRANSITIONS, ROLE_OPTIONS
} from '@/lib/trainingRegistryConstants';

export default function TrainingRegistryPage() {
  const navigate = useNavigate();
  const { role, loading: roleLoading } = useCurrentRole();
  const [guides, setGuides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [isAuthor, setIsAuthor] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await base44.functions.invoke('manageTraining', {
        action: 'list',
        statusFilter: statusFilter || undefined,
        search: search || undefined,
      });
      if (res.data?.success) {
        setGuides(res.data.guides || []);
        setIsAuthor(res.data.is_author || false);
      } else {
        setGuides([]);
        setLoadError('generic');
      }
    } catch (err) {
      setGuides([]);
      setLoadError(err?.response?.status === 403 ? 'access_denied' : 'generic');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => { if (!roleLoading) load(); }, [roleLoading, load]);

  const handleSave = async (data) => {
    try {
      if (editing) {
        const res = await base44.functions.invoke('manageTraining', {
          action: 'update',
          trainingId: editing.id,
          trainingData: data,
        });
        if (res.data?.success) toast.success('Training guide updated');
        else throw new Error(res.data?.error);
      } else {
        const res = await base44.functions.invoke('manageTraining', {
          action: 'create',
          trainingData: data,
        });
        if (res.data?.success) toast.success('Training guide created');
        else throw new Error(res.data?.error);
      }
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to save');
    }
  };

  const handleTransition = async (guide, newStatus) => {
    try {
      const res = await base44.functions.invoke('manageTraining', {
        action: 'transition',
        trainingId: guide.id,
        newStatus,
      });
      if (res.data?.success) {
        toast.success(`Status changed to ${newStatus}`);
        load();
      } else {
        toast.error(res.data?.error || 'Transition failed');
      }
    } catch (err) {
      toast.error('Transition failed');
    }
  };

  const handleRetire = async (guide) => {
    if (!confirm(`Retire "${guide.title || guide.training_name}"? This will remove it from active use.`)) return;
    try {
      const res = await base44.functions.invoke('manageTraining', {
        action: 'retire',
        trainingId: guide.id,
      });
      if (res.data?.success) {
        toast.success('Training guide retired');
        load();
      } else {
        toast.error(res.data?.error || 'Retire failed');
      }
    } catch {
      toast.error('Retire failed');
    }
  };

  const filtered = guides.filter(g => {
    if (typeFilter && g.training_type !== typeFilter) return false;
    return true;
  });

  if (roleLoading || loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;
  }

  if (loadError === 'access_denied') {
    return (
      <div className="text-center py-12">
        <p className="text-lg font-semibold text-red-800">Access denied</p>
        <p className="text-sm text-muted-foreground mt-1">You do not have permission to view the Training Registry.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Training Registry</h1>
          <p className="text-muted-foreground text-sm">
            {isAuthor ? 'Create, review, and publish training guides' : 'Published training guides'}
          </p>
        </div>
        {isAuthor && (
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="w-4 h-4 mr-2" /> New Guide
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v === '__all' ? '' : v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Statuses</SelectItem>
            {TRAINING_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={v => setTypeFilter(v === '__all' ? '' : v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Types</SelectItem>
            {TRAINING_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search guides..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} guide{filtered.length !== 1 ? 's' : ''}</p>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-xl">
          No training guides found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Number</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Type</th>
                <th className="px-3 py-2 font-medium hidden lg:table-cell">Linked Task</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Version</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(g => (
                <tr
                  key={g.id}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => navigate(`/lvcos/training/detail/${g.id}`)}
                >
                  <td className="px-3 py-2 font-mono text-xs">{g.training_number || g.training_id}</td>
                  <td className="px-3 py-2 font-medium">{g.title || g.training_name}</td>
                  <td className="px-3 py-2 hidden md:table-cell">
                    {g.training_type && <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${TRAINING_TYPE_COLORS[g.training_type] || ''}`}>{g.training_type}</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs hidden lg:table-cell">{g.linked_task_number || '—'}</td>
                  <td className="px-3 py-2">
                    {g.status && <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${TRAINING_STATUS_COLORS[g.status] || ''}`}>{g.status}</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{g.version || '—'}</td>
                  <td className="px-3 py-2 text-right">
                    {g.status === 'Published' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/lvcos/training/guide/${g.id}`); }}
                        className="text-accent hover:bg-accent/10 p-1.5 rounded-md transition-colors"
                        title="Start guided training"
                      >
                        <GraduationCap className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isAuthor && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditing(g); setDialogOpen(true); }}
                        className="text-muted-foreground hover:bg-muted p-1.5 rounded-md transition-colors"
                        title="Edit"
                      >
                        <Plus className="w-3.5 h-3.5 rotate-45" />
                      </button>
                    )}
                    {isAuthor && g.status !== 'Retired' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRetire(g); }}
                        className="text-muted-foreground hover:bg-destructive/10 p-1.5 rounded-md transition-colors"
                        title="Retire"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TrainingGuideFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialData={editing || {}}
        onSave={handleSave}
      />
    </div>
  );
}