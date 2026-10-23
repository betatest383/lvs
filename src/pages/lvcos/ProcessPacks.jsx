import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Plus, Package, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import ProcessPackFormDialog from '@/components/lvcos/ProcessPackFormDialog';

const STATUS_STYLES = {
  Planned: 'bg-slate-100 text-slate-600',
  'In Development': 'bg-amber-100 text-amber-700',
  Ready: 'bg-blue-100 text-blue-700',
  Live: 'bg-green-100 text-green-700',
};

// Must match ProcessPackDetail.jsx
const SECTIONS = [
  'trainual_url',
  'policies',
  'form_ids',
  'workflow_ids',
  'dashboard_ids',
  'kpi_ids',
  'automations',
  'reports',
];

function calcCompletion(pack) {
  if (!pack) return 0;
  const filled = SECTIONS.filter(key => {
    const val = pack[key];
    return Array.isArray(val) ? val.length > 0 : !!val;
  }).length;
  return Math.round((filled / SECTIONS.length) * 100);
}

export default function ProcessPacks() {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    try {
      const recs = await base44.entities.ProcessPack.list('-created_date', 200);
      setPacks(recs);
    } catch (err) {
      toast.error('Failed to load process packs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (form) => {
    if (editing) {
      await base44.entities.ProcessPack.update(editing.id, form);
      toast.success('Process pack updated');
    } else {
      await base44.entities.ProcessPack.create(form);
      toast.success('Process pack created');
    }
    load();
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Process Packs</h1>
          <p className="text-muted-foreground text-sm">Bundle everything required to launch a business process.</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> New Pack
        </Button>
      </div>

      {packs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="w-12 h-12 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground mb-4">No process packs yet.</p>
            <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="w-4 h-4" /> Create your first pack
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {packs.map(pack => {
            const pct = calcCompletion(pack);
            return (
              <Link key={pack.id} to={`/lvcos/process-packs/${pack.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-mono text-xs text-muted-foreground">{pack.pack_id}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[pack.status] || STATUS_STYLES['Planned']}`}>
                        {pack.status}
                      </span>
                    </div>
                    <h3 className="font-semibold leading-snug mb-1">{pack.title}</h3>
                    {pack.department && <p className="text-xs text-muted-foreground mb-3">{pack.department}</p>}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Completion</span>
                        <span className={pct === 100 ? 'text-green-600 font-medium' : 'text-muted-foreground'}>{pct}%</span>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </div>
                    <div className="flex items-center justify-end mt-3 text-xs text-muted-foreground">
                      View details <ChevronRight className="w-3 h-3" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <ProcessPackFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initial={editing}
      />
    </div>
  );
}