import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldCheck, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_META = {
  ready_to_link: { label: 'Ready to Link', className: 'bg-blue-50 text-blue-700 border-blue-300' },
  already_linked: { label: 'Already Linked', className: 'bg-green-50 text-green-700 border-green-300' },
  not_found: { label: 'Not Found', className: 'bg-red-50 text-red-700 border-red-300' },
  ambiguous: { label: 'Ambiguous', className: 'bg-amber-50 text-amber-700 border-amber-300' },
  link_conflict: { label: 'Link Conflict', className: 'bg-orange-50 text-orange-700 border-orange-300' },
};

export default function RecoverTruncatedLinksDialog({ open, onClose, onCompleted }) {
  const [relinkExisting, setRelinkExisting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState(null);
  const [execResult, setExecResult] = useState(null);

  const runDryRun = useCallback(async () => {
    setLoading(true);
    setExecResult(null);
    try {
      const res = await base44.functions.invoke('recoverTruncatedMaterialLinks', { dry_run: true, relink_existing: relinkExisting });
      setResult(res.data);
    } catch (e) {
      toast.error('Dry run failed: ' + (e.response?.data?.error || e.message));
    }
    setLoading(false);
  }, [relinkExisting]);

  useEffect(() => {
    if (open) {
      setResult(null);
      setExecResult(null);
      runDryRun();
    }
  }, [open, runDryRun]);

  const handleConfirm = async () => {
    setExecuting(true);
    try {
      const res = await base44.functions.invoke('recoverTruncatedMaterialLinks', { dry_run: false, relink_existing: relinkExisting });
      setExecResult(res.data);
      toast.success(`Recovered ${res.data.linked_count || 0} link(s)`);
      onCompleted?.();
    } catch (e) {
      toast.error('Recovery failed: ' + (e.response?.data?.error || e.message));
    }
    setExecuting(false);
  };

  const summary = result?.summary;
  const details = result?.details || [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !loading && !executing) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto" onCloseAttempt={() => { if (!loading && !executing) onClose(); }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> Recover Truncated Material Links</DialogTitle>
          <DialogDescription>
            One-time recovery for records whose SKU was truncated with a trailing ellipsis (e.g. <code className="text-[10px]">03602844...</code>).
            The ellipsis is stripped to form a search prefix, then matched against Inventory Master SKU, Vendor Part Number, and Barcode — narrowed by manufacturer, model, and dimensions.
            On confirm, the matched <code className="text-[10px]">material_id</code> is saved and the truncated SKU is replaced with the complete canonical SKU. Prefix matching is never used for future imports.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={relinkExisting} onCheckedChange={setRelinkExisting} disabled={loading || executing} />
            Relink Existing Records (overwrite existing material links)
          </label>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={runDryRun} disabled={loading || executing}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Re-run Dry Run
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
        ) : summary ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {[
                { key: 'total_truncated', label: 'Truncated', cls: '' },
                { key: 'ready_to_link', label: 'Ready', cls: 'text-blue-600' },
                { key: 'already_linked', label: 'Linked', cls: 'text-green-600' },
                { key: 'not_found', label: 'Not Found', cls: 'text-red-600' },
                { key: 'ambiguous', label: 'Ambiguous', cls: 'text-amber-600' },
                { key: 'link_conflict', label: 'Conflict', cls: 'text-orange-600' },
              ].map(s => (
                <div key={s.key} className="text-center p-2 border rounded-lg">
                  <p className={`text-xl font-bold ${s.cls}`}>{summary[s.key]}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            {execResult && (
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg text-sm text-green-700 flex-wrap">
                <CheckCircle2 className="w-4 h-4" />
                <span><strong>{execResult.linked_count}</strong> recovered</span>
                <span><strong>{execResult.summary?.skipped || 0}</strong> skipped</span>
                {execResult.failed_count > 0 && <span className="text-red-600"><strong>{execResult.failed_count}</strong> failed</span>}
              </div>
            )}

            <div>
              <p className="text-sm font-semibold mb-2">Candidate Detail</p>
              <div className="max-h-[380px] overflow-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 sticky top-0">
                    <tr>
                      <th className="text-left py-2 px-3 font-semibold">Matrix Product</th>
                      <th className="text-left py-2 px-3 font-semibold">Truncated SKU</th>
                      <th className="text-left py-2 px-3 font-semibold">Prefix</th>
                      <th className="text-left py-2 px-3 font-semibold">Candidate Material</th>
                      <th className="text-left py-2 px-3 font-semibold">Canonical SKU</th>
                      <th className="text-left py-2 px-3 font-semibold">Vendor PN</th>
                      <th className="text-left py-2 px-3 font-semibold">Confidence</th>
                      <th className="text-left py-2 px-3 font-semibold">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.map((d) => {
                      const meta = STATUS_META[d.status] || { label: d.status, className: '' };
                      const c = d.candidates?.[0];
                      return (
                        <tr key={d.matrix_id} className="border-t align-top hover:bg-muted/20">
                          <td className="py-1.5 px-3 font-medium">{d.matrix_name || '(unnamed)'}</td>
                          <td className="py-1.5 px-3"><code className="text-[10px]">{d.imported_sku}</code></td>
                          <td className="py-1.5 px-3"><code className="text-[10px] text-muted-foreground">{d.prefix}</code></td>
                          <td className="py-1.5 px-3">
                            {d.candidates?.map((cand, i) => (
                              <div key={i} className={d.candidates.length > 1 ? 'mb-1 pb-1 border-b last:border-0' : ''}>
                                {cand.material_name}
                                {cand.manufacturer && <span className="text-[10px] text-muted-foreground block">{cand.manufacturer}</span>}
                              </div>
                            )) || '—'}
                          </td>
                          <td className="py-1.5 px-3">
                            {d.candidates?.map((cand, i) => (
                              <div key={i} className={d.candidates.length > 1 ? 'mb-1 pb-1 border-b last:border-0' : ''}>
                                <code className="text-[10px]">{cand.material_sku || '—'}</code>
                                <span className="text-[9px] text-muted-foreground block">via {cand.matched_field}</span>
                              </div>
                            )) || '—'}
                          </td>
                          <td className="py-1.5 px-3">
                            {d.candidates?.map((cand, i) => (
                              <div key={i} className={d.candidates.length > 1 ? 'mb-1 pb-1 border-b last:border-0' : ''}>
                                <code className="text-[10px]">{cand.vendor_sku || '—'}</code>
                              </div>
                            )) || '—'}
                          </td>
                          <td className="py-1.5 px-3">
                            {c?.confidence_reasons?.length > 0
                              ? c.confidence_reasons.map((r, i) => <div key={i} className="text-[10px] text-green-700">✓ {r}</div>)
                              : <span className="text-[10px] text-muted-foreground">No supporting signals</span>}
                          </td>
                          <td className="py-1.5 px-3">
                            <Badge variant="outline" className={`text-[9px] ${meta.className}`}>{meta.label}</Badge>
                            {d.reason && <div className="text-[10px] text-muted-foreground mt-1 max-w-[220px]">{d.reason}</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 p-4 bg-muted rounded-lg text-sm text-muted-foreground">
            <AlertTriangle className="w-4 h-4" /> No truncated SKUs detected.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading || executing}>Close</Button>
          {!execResult && summary?.ready_to_link > 0 && (
            <Button onClick={handleConfirm} disabled={executing || loading} className="gap-1.5">
              {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Confirm Recovery ({summary.ready_to_link} record{summary.ready_to_link !== 1 ? 's' : ''})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}