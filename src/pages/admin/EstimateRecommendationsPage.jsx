import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, ArrowLeft, Check, Plus, Layers, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import RepairSystemCard from '@/components/recommendations/RepairSystemCard';

function ManualItemForm({ onAdd }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('1');
  const [desc, setDesc] = useState('');

  const add = () => {
    if (!name.trim()) return;
    onAdd({
      recommendation_title: name,
      options: [{
        tier: 'standalone',
        label: name,
        pricebook_item_name: name,
        unit_price: parseFloat(price) || 0,
        quantity: parseInt(qty) || 1,
        unit: 'ea',
        line_total: (parseInt(qty) || 1) * (parseFloat(price) || 0),
        customer_description: desc || '',
        selected: true,
      }],
    });
    setName(''); setPrice(''); setQty('1'); setDesc('');
  };

  return (
    <Card className="border-dashed">
      <CardContent className="p-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Add Manual Line Item</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Input placeholder="Item name" value={name} onChange={e => setName(e.target.value)} className="h-8 text-sm" />
          <Input placeholder="Unit price" type="number" value={price} onChange={e => setPrice(e.target.value)} className="h-8 text-sm" />
          <Input placeholder="Qty" type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} className="h-8 text-sm" />
          <Button size="sm" className="h-8 gap-1" onClick={add}><Plus className="w-3.5 h-3.5" /> Add</Button>
        </div>
        <Input placeholder="Customer description (optional)" value={desc} onChange={e => setDesc(e.target.value)} className="h-8 text-sm" />
      </CardContent>
    </Card>
  );
}

function safeParse(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

export default function EstimateRecommendationsPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [repairSystems, setRepairSystems] = useState([]);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const jobData = await base44.entities.Job.get(jobId);
      setJob(jobData);
      const recs = await base44.entities.RepairSystemRecommendation.filter({ job_id: jobId });
      recs.sort((a, b) => (b.confidence_score || 0) - (a.confidence_score || 0));
      setRepairSystems(recs);
    } catch {
      toast.error('Failed to load repair system recommendations');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await base44.functions.invoke('generateRepairSystemRecommendations', { job_id: jobId });
      toast.success(`${res.data?.repair_systems_created || 0} repair system recommendations generated`);
      load();
    } catch {
      toast.error('Failed to generate repair system recommendations');
    } finally {
      setGenerating(false);
    }
  };

  const updateRec = async (recId, changes) => {
    setRepairSystems(prev => prev.map(r => r.id === recId ? { ...r, ...changes } : r));
    try {
      await base44.entities.RepairSystemRecommendation.update(recId, changes);
    } catch { /* will retry */ }
  };

  const addManualItem = async (item) => {
    try {
      const rec = await base44.entities.RepairSystemRecommendation.create({
        recommendation_id: `RSR-MANUAL-${Date.now()}`,
        job_id: jobId,
        inspection_id: '',
        customer_id: job?.customer_id || '',
        customer_name: job?.customer_name || '',
        repair_system_type: 'other',
        recommendation_title: item.recommendation_title,
        recommendation_summary: '',
        related_findings: '[]',
        related_findings_detail: '[]',
        related_photos: [],
        related_measurements: '{}',
        code_nfpa_references: '',
        severity: 'moderate',
        safety_concern: false,
        confidence_score: 100,
        confidence_reason: 'Manual addition',
        customer_facing_explanation: '',
        internal_technician_notes: '',
        suggested_pricebook_items: '[]',
        good_better_best_options: JSON.stringify(item.options),
        selected_option_tier: 'standalone',
        material_calculation_inputs: '{}',
        estimate_status: 'accepted',
        requires_review: false,
        created_by: 'technician',
      });
      setRepairSystems(prev => [...prev, rec]);
      toast.success('Item added');
    } catch {
      toast.error('Failed to add item');
    }
  };

  const handleCreateEstimate = async () => {
    const accepted = repairSystems.filter(r => r.estimate_status === 'accepted');
    if (accepted.length === 0) {
      toast.error('Accept at least one repair system before creating an estimate');
      return;
    }
    setCreating(true);
    try {
      const lineItems = [];
      for (const rsr of accepted) {
        const options = safeParse(rsr.good_better_best_options, []);
        const selectedTier = rsr.selected_option_tier;
        // If a tier is selected, use that option; otherwise include all options marked selected
        const chosenOptions = selectedTier && selectedTier !== 'none'
          ? options.filter(o => o.tier === selectedTier)
          : options.filter(o => o.selected);

        if (chosenOptions.length > 0) {
          for (const opt of chosenOptions) {
            lineItems.push({
              name: opt.pricebook_item_name,
              description: opt.customer_description || rsr.customer_facing_explanation || '',
              quantity: opt.quantity,
              unit_price: opt.unit_price,
              amount: opt.line_total,
              repair_system: rsr.recommendation_title,
            });
          }
        } else {
          // No specific option selected — use first option as default
          if (options.length > 0) {
            const opt = options[0];
            lineItems.push({
              name: opt.pricebook_item_name,
              description: opt.customer_description || rsr.customer_facing_explanation || '',
              quantity: opt.quantity,
              unit_price: opt.unit_price,
              amount: opt.line_total,
              repair_system: rsr.recommendation_title,
            });
          }
        }
      }

      const subtotal = lineItems.reduce((sum, li) => sum + (li.amount || 0), 0);
      const inspectionId = repairSystems[0]?.inspection_id || '';

      const estimate = await base44.entities.Estimate.create({
        job_id: jobId,
        inspection_id: inspectionId,
        customer_id: job?.customer_id || '',
        customer_name: job?.customer_name || '',
        line_items: JSON.stringify(lineItems),
        subtotal,
        tax_rate: 0,
        tax_amount: 0,
        total: subtotal,
        status: 'draft',
        notes: 'Generated from inspection findings — grouped repair system recommendations.',
      });

      // Update accepted repair systems with estimate_id
      for (const rsr of accepted) {
        await base44.entities.RepairSystemRecommendation.update(rsr.id, {
          estimate_id: estimate.id,
          estimate_status: 'estimate_created',
        });
      }

      toast.success('Estimate draft created from repair systems');
      navigate(`/admin/estimates/${estimate.id}`);
    } catch {
      toast.error('Failed to create estimate');
    } finally {
      setCreating(false);
    }
  };

  const acceptedCount = repairSystems.filter(r => r.estimate_status === 'accepted').length;
  const acceptedTotal = repairSystems
    .filter(r => r.estimate_status === 'accepted')
    .reduce((sum, r) => {
      const options = safeParse(r.good_better_best_options, []);
      const selectedTier = r.selected_option_tier;
      if (selectedTier && selectedTier !== 'none') {
        const opt = options.find(o => o.tier === selectedTier);
        return sum + (opt?.line_total || 0);
      }
      // Sum all selected options, or first if none selected
      const selected = options.filter(o => o.selected);
      if (selected.length > 0) return sum + selected.reduce((s, o) => s + (o.line_total || 0), 0);
      if (options.length > 0) return sum + (options[0].line_total || 0);
      return sum;
    }, 0);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Repair System Recommendations</h1>
          <p className="text-xs text-muted-foreground">
            {job?.customer_name} — Grouped repair systems from inspection findings
          </p>
        </div>
      </div>

      {/* Summary bar */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Accepted</p>
              <p className="font-medium">{acceptedCount} repair system{acceptedCount !== 1 ? 's' : ''}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Estimate Total</p>
              <p className="font-bold text-lg text-accent">${acceptedTotal.toFixed(2)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Regenerate from Findings
            </Button>
            <Button className="gap-1.5 bg-green-600 hover:bg-green-700" onClick={handleCreateEstimate} disabled={creating || acceptedCount === 0}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Create Draft Estimate
            </Button>
          </div>
        </CardContent>
      </Card>

      {repairSystems.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center">
            <Layers className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-3">No repair system recommendations yet.</p>
            <Button onClick={handleGenerate} disabled={generating} className="gap-1.5">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
              Generate from Inspection Findings
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Repair System Cards */}
      <div className="space-y-3">
        {repairSystems.map(rec => (
          <RepairSystemCard key={rec.id} rec={rec} onUpdate={updateRec} />
        ))}
      </div>

      {/* Manual add */}
      {repairSystems.length > 0 && <ManualItemForm onAdd={addManualItem} />}
    </div>
  );
}