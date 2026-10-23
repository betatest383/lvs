import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ClipboardCheck, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function PhysicalCountWizard() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({});
  const [reasons, setReasons] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState([]);

  useEffect(() => {
    base44.entities.EquipmentMaster.filter({ is_active: true }, 'item_name', 500)
      .then(m => { setItems(m); const c = {}; m.forEach(i => c[i.id] = ''); setCounts(c); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const itemsWithVariance = items.filter(i => {
    const actual = Number(counts[i.id]);
    if (actual === '' || isNaN(actual)) return false;
    return actual !== (i.quantity_available || 0);
  });

  const submitAll = async () => {
    if (itemsWithVariance.length === 0) { toast({ title: 'Nothing to adjust', description: 'No variances detected' }); return; }
    const missingReason = itemsWithVariance.some(i => !reasons[i.id]);
    if (missingReason) { toast({ title: 'Reason required', description: 'A reason is required for every adjusted item', variant: 'destructive' }); return; }

    setSubmitting(true); setResults([]);
    const res = [];
    for (const item of itemsWithVariance) {
      try {
        const r = await base44.functions.invoke('processInventoryTransaction', {
          transaction_type: 'physical_count',
          equipment_master_id: item.id,
          quantity: Number(counts[item.id]),
          reason: reasons[item.id]
        });
        res.push({ item: item.item_name, success: !r.data?.error, error: r.data?.error, transaction_id: r.data?.transaction_id });
      } catch (err) {
        res.push({ item: item.item_name, success: false, error: err.message });
      }
    }
    setResults(res);
    setSubmitting(false);
    const successCount = res.filter(r => r.success).length;
    toast({ title: 'Count processed', description: `${successCount} of ${res.length} adjustments completed` });
    // Reload items
    base44.entities.EquipmentMaster.filter({ is_active: true }, 'item_name', 500).then(setItems).catch(() => {});
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-teal-600" /> Physical Inventory Count</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">Enter the actual count for each item. Items with variances will require a reason before submission.</p>
          <div className="border rounded-lg overflow-hidden">
            <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 bg-muted text-xs font-medium text-muted-foreground">
              <span className="col-span-4">Equipment</span>
              <span className="col-span-2 text-center">Expected</span>
              <span className="col-span-2 text-center">Actual</span>
              <span className="col-span-1 text-center">Diff</span>
              <span className="col-span-1 text-center">Variance %</span>
              <span className="col-span-2">Reason (if variance)</span>
            </div>
            {items.map(item => {
              const actual = counts[item.id] === '' ? null : Number(counts[item.id]);
              const expected = item.quantity_available || 0;
              const diff = actual !== null ? actual - expected : 0;
              const variancePct = actual !== null && expected > 0 ? ((diff / expected) * 100).toFixed(1) : actual !== null && expected === 0 ? '—' : '';
              const hasVariance = actual !== null && actual !== expected;
              return (
                <div key={item.id} className={`grid grid-cols-12 gap-2 px-4 py-2 border-t text-sm items-center ${hasVariance ? 'bg-amber-50' : 'bg-card'}`}>
                  <span className="col-span-12 md:col-span-4 truncate">{item.equipment_id || ''} — {item.item_name}</span>
                  <span className="col-span-3 md:col-span-2 text-center">{expected}</span>
                  <div className="col-span-3 md:col-span-2 flex justify-center">
                    <Input type="number" min="0" value={counts[item.id]} onChange={e => setCounts(c => ({ ...c, [item.id]: e.target.value }))} className="h-8 w-20 text-center" placeholder={String(expected)} />
                  </div>
                  <span className={`col-span-2 md:col-span-1 text-center font-medium ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : ''}`}>{actual !== null ? (diff > 0 ? `+${diff}` : diff) : '—'}</span>
                  <span className="col-span-4 md:col-span-1 text-center text-xs text-muted-foreground">{variancePct}{variancePct && variancePct !== '—' ? '%' : ''}</span>
                  <div className="col-span-12 md:col-span-2">
                    {hasVariance ? (
                      <Input value={reasons[item.id] || ''} onChange={e => setReasons(r => ({ ...r, [item.id]: e.target.value }))} className="h-8 text-xs" placeholder="Required" />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {itemsWithVariance.length > 0 && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-300 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">{itemsWithVariance.length} item(s) have count variances. Reasons required for all adjustments.</p>
        </div>
      )}

      <Button onClick={submitAll} disabled={submitting || itemsWithVariance.length === 0} className="w-full">
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
        Submit Physical Count ({itemsWithVariance.length} adjustments)
      </Button>

      {results.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Adjustment Results</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {r.success ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <AlertTriangle className="w-4 h-4 text-red-600" />}
                <span className="flex-1 truncate">{r.item}</span>
                {r.success ? <span className="text-xs text-muted-foreground">{r.transaction_id}</span> : <span className="text-xs text-red-600">{r.error}</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}