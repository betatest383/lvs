import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Pencil, ExternalLink, Save } from 'lucide-react';
import { toast } from 'sonner';
import ArrayField from '@/components/lvcos/ArrayField';
import ProcessPackFormDialog from '@/components/lvcos/ProcessPackFormDialog';

const SECTIONS = [
  { key: 'trainual_url', label: 'Trainual Documentation', type: 'url' },
  { key: 'policies', label: 'Policies', type: 'array', placeholder: 'e.g. One Material Request Policy' },
  { key: 'form_ids', label: 'Forms', type: 'array', placeholder: 'e.g. Hardware Checklist' },
  { key: 'workflow_ids', label: 'Workflows', type: 'array', placeholder: 'e.g. WF-WH-001 Morning Material Request' },
  { key: 'dashboard_ids', label: 'Dashboards', type: 'array', placeholder: 'e.g. Warehouse Morning Dashboard' },
  { key: 'kpi_ids', label: 'KPIs', type: 'array', placeholder: 'e.g. Average Truck Departure Time' },
  { key: 'automations', label: 'Automations', type: 'array', placeholder: 'e.g. Notify Warehouse Associate' },
  { key: 'reports', label: 'Reports', type: 'array', placeholder: 'e.g. Daily Warehouse Performance' },
];

function calcCompletion(pack) {
  if (!pack) return 0;
  const filled = SECTIONS.filter(s => {
    const val = pack[s.key];
    return Array.isArray(val) ? val.length > 0 : !!val;
  }).length;
  return Math.round((filled / SECTIONS.length) * 100);
}

const STATUS_STYLES = {
  Planned: 'bg-slate-100 text-slate-600',
  'In Development': 'bg-amber-100 text-amber-700',
  Ready: 'bg-blue-100 text-blue-700',
  Live: 'bg-green-100 text-green-700',
};

export default function ProcessPackDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pack, setPack] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editDialog, setEditDialog] = useState(false);

  const load = async () => {
    try {
      const rec = await base44.entities.ProcessPack.get(id);
      setPack(rec);
    } catch {
      toast.error('Failed to load process pack');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const updateField = async (key, value) => {
    const prev = pack;
    setPack({ ...pack, [key]: value }); // optimistic
    try {
      await base44.entities.ProcessPack.update(pack.id, { [key]: value });
    } catch {
      toast.error('Failed to save');
      setPack(prev); // rollback
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;
  }

  if (!pack) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-3">Process pack not found.</p>
        <Link to="/lvcos/process-packs"><Button variant="outline">Back to list</Button></Link>
      </div>
    );
  }

  const pct = calcCompletion(pack);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/lvcos/process-packs')} className="shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm text-muted-foreground">{pack.pack_id}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[pack.status] || STATUS_STYLES['Planned']}`}>
                {pack.status}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{pack.title}</h1>
            {pack.department && <p className="text-sm text-muted-foreground">{pack.department}</p>}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditDialog(true)}>
          <Pencil className="w-3.5 h-3.5" /> Edit
        </Button>
      </div>

      {/* Description */}
      {pack.description && (
        <p className="text-sm text-muted-foreground">{pack.description}</p>
      )}

      {/* Completion banner */}
      <Card className={pct === 100 ? 'border-green-400 bg-green-50 dark:bg-green-950/20' : ''}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              {pct === 100 ? '✅ Process Pack Complete — Ready for Production' : 'Process Pack Completion'}
            </span>
            <span className={`text-sm font-semibold ${pct === 100 ? 'text-green-600' : ''}`}>{pct}%</span>
          </div>
          <Progress value={pct} className="h-2.5" />
          <p className="text-xs text-muted-foreground mt-2">
            {SECTIONS.filter(s => {
              const val = pack[s.key];
              return Array.isArray(val) ? val.length > 0 : !!val;
            }).length} of {SECTIONS.length} components configured
          </p>
        </CardContent>
      </Card>

      {/* Primary SOP link */}
      {pack.primary_sop_id && (
        <div className="text-sm text-muted-foreground">
          Primary SOP: <Link to="/lvcos/sop-registry" className="text-accent hover:underline font-mono">{pack.primary_sop_id}</Link>
        </div>
      )}

      {/* Sections */}
      <div className="grid gap-3 md:grid-cols-2">
        {SECTIONS.map(section => {
          const val = pack[section.key];
          const isComplete = Array.isArray(val) ? val.length > 0 : !!val;
          return (
            <Card key={section.key} className={isComplete ? 'border-green-200 dark:border-green-900' : ''}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  {isComplete ? (
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                  )}
                  {section.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {section.type === 'url' ? (
                  <div className="flex gap-1.5">
                    <Input
                      value={pack.trainual_url || ''}
                      onChange={e => setPack({ ...pack, trainual_url: e.target.value })}
                      onBlur={e => updateField('trainual_url', e.target.value)}
                      placeholder="https://trainual.com/..."
                      className="h-8 text-sm"
                    />
                    {pack.trainual_url && (
                      <a href={pack.trainual_url} target="_blank" rel="noreferrer">
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </a>
                    )}
                  </div>
                ) : (
                  <ArrayField
                    label=""
                    items={pack[section.key] || []}
                    onChange={items => updateField(section.key, items)}
                    placeholder={section.placeholder}
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Owner / Go-live / Notes (read-only summary) */}
      <Card>
        <CardContent className="p-4 grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <Label className="text-xs text-muted-foreground">Owner</Label>
            <p className="font-medium">{pack.owner || '—'}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Target Go-Live</Label>
            <p className="font-medium">{pack.target_go_live || '—'}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Primary SOP</Label>
            <p className="font-medium font-mono">{pack.primary_sop_id || '—'}</p>
          </div>
          {pack.notes && (
            <div className="sm:col-span-3">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <p className="text-sm">{pack.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <ProcessPackFormDialog
        open={editDialog}
        onClose={() => setEditDialog(false)}
        onSave={async (form) => {
          await base44.entities.ProcessPack.update(pack.id, form);
          toast.success('Process pack updated');
          load();
        }}
        initial={pack}
      />
    </div>
  );
}