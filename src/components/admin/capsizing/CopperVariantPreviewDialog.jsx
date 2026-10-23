import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, AlertTriangle, CheckCircle2, RefreshCw, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export default function CopperVariantPreviewDialog({ open, onClose, onCompleted, sourceProducts }) {
  const [multiplier, setMultiplier] = useState('3.0');
  const [updateExisting, setUpdateExisting] = useState(false);
  const [previews, setPreviews] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const sourceIds = (sourceProducts || []).map(p => p.id);

  // Generate preview
  const generatePreview = async () => {
    if (sourceIds.length === 0) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke('generateCopperVariants', {
        source_matrix_ids: sourceIds,
        multiplier: Number(multiplier) || 3.0,
        dry_run: true,
        update_existing: updateExisting,
      });
      setPreviews(res.data);
    } catch (e) {
      toast.error('Preview failed: ' + e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open && sourceIds.length > 0 && !previews) {
      generatePreview();
    }
    if (!open) {
      setPreviews(null);
      setMultiplier('3.0');
      setUpdateExisting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleMultiplierChange = (v) => {
    setMultiplier(v);
    setPreviews(null);
  };

  const handleUpdateExistingChange = (checked) => {
    setUpdateExisting(checked);
    setPreviews(null);
  };

  const handleConfirm = async () => {
    setCreating(true);
    try {
      const res = await base44.functions.invoke('generateCopperVariants', {
        source_matrix_ids: sourceIds,
        multiplier: Number(multiplier) || 3.0,
        dry_run: false,
        update_existing: updateExisting,
      });
      const s = res.data.summary;
      toast.success(`Created ${s.created} copper variant(s)${s.updated > 0 ? `, updated ${s.updated}` : ''}${s.skipped > 0 ? `, skipped ${s.skipped}` : ''}`);
      onCompleted();
    } catch (e) {
      toast.error('Generation failed: ' + e.message);
    }
    setCreating(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              Bulk Create Copper Variants
            </DialogTitle>
            <DialogDescription>
              Generate copper draft variants from {sourceIds.length} selected stainless steel product(s). Variants remain inactive until SKU, material link, and price approval are completed.
            </DialogDescription>
          </DialogHeader>

          {/* Config */}
          <div className="flex items-end gap-4 pb-3 border-b">
            <div className="space-y-1">
              <Label className="text-xs">Copper Price Multiplier</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={multiplier}
                onChange={(e) => handleMultiplierChange(e.target.value)}
                className="w-28"
              />
            </div>
            <div className="text-xs text-muted-foreground pb-2">
              suggested_price = stainless_source_price × {multiplier || '3.0'}
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer pb-2.5 ml-auto">
              <Checkbox
                checked={updateExisting}
                onCheckedChange={(checked) => handleUpdateExistingChange(checked === true)}
              />
              Update existing copper variants (sync sizing + recalculate price)
            </label>
            {(previews || loading) && (
              <Button variant="outline" size="sm" onClick={generatePreview} disabled={loading} className="mb-1.5">
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Refresh Preview
              </Button>
            )}
          </div>

          {/* Preview Table */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
            </div>
          ) : !previews ? (
            <div className="flex justify-center py-12">
              <Button onClick={generatePreview} variant="outline">Generate Preview</Button>
            </div>
          ) : previews.previews.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No valid sources to process.</div>
          ) : (
            <div className="overflow-auto flex-1">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/30">
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-semibold uppercase tracking-wider">Stainless Source</th>
                    <th className="text-left py-2 px-2 font-semibold uppercase tracking-wider">New Copper Product</th>
                    <th className="text-center py-2 px-2 font-semibold uppercase tracking-wider">Dimensions</th>
                    <th className="text-center py-2 px-2 font-semibold uppercase tracking-wider">Height</th>
                    <th className="text-right py-2 px-2 font-semibold uppercase tracking-wider">Source Price</th>
                    <th className="text-center py-2 px-2 font-semibold uppercase tracking-wider">×</th>
                    <th className="text-right py-2 px-2 font-semibold uppercase tracking-wider">Suggested</th>
                    <th className="text-left py-2 px-2 font-semibold uppercase tracking-wider">Action</th>
                    <th className="text-left py-2 px-2 font-semibold uppercase tracking-wider">Warnings</th>
                  </tr>
                </thead>
                <tbody>
                  {previews.previews.map((p) => (
                    <tr key={p.source_id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="py-2 px-2">
                        <div className="font-medium">{p.source_name}</div>
                        <div className="text-[10px] text-muted-foreground">{[p.source_manufacturer, p.source_model].filter(Boolean).join(' ')}</div>
                        <div className="text-[10px] text-muted-foreground">SKU: {p.source_material_sku || '—'}</div>
                      </td>
                      <td className="py-2 px-2 font-medium">
                        {p.copper_product_name}
                        {p.has_existing_variant && (
                          <div className="text-[10px] text-blue-600 mt-0.5">
                            Existing: {p.existing_variant_name} ({p.existing_variant_status || 'draft'})
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {p.nominal_length && p.nominal_width ? `${p.nominal_length}×${p.nominal_width}"` : '—'}
                      </td>
                      <td className="py-2 px-2 text-center">{p.nominal_height ? `${p.nominal_height}"` : '—'}</td>
                      <td className="py-2 px-2 text-right">${(p.source_price || 0).toFixed(2)}</td>
                      <td className="py-2 px-2 text-center text-muted-foreground">{p.multiplier}</td>
                      <td className="py-2 px-2 text-right font-bold text-blue-700">${(p.suggested_copper_price || 0).toFixed(2)}</td>
                      <td className="py-2 px-2">
                        {p.status === 'skipped' ? (
                          <Badge variant="outline" className="text-[10px] bg-gray-100">Skipped</Badge>
                        ) : p.action === 'create' ? (
                          <Badge className="text-[10px] bg-green-100 text-green-700">Create</Badge>
                        ) : p.action === 'update' ? (
                          <Badge className="text-[10px] bg-blue-100 text-blue-700">Update</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700">Skip (exists)</Badge>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {p.warnings.length === 0 ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {p.warnings.map((w, i) => (
                              <div key={i} className="flex items-start gap-1 text-[10px] text-amber-600">
                                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                                <span>{w}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Summary */}
              <div className="flex items-center gap-4 p-3 border-t bg-muted/20 text-xs">
                <span>Total: <strong>{previews.summary.total_sources}</strong></span>
                <span className="text-green-700">Create: <strong>{previews.summary.will_create}</strong></span>
                <span className="text-blue-700">Update: <strong>{previews.summary.will_update}</strong></span>
                <span className="text-amber-700">Skip: <strong>{previews.summary.will_skip + previews.summary.skipped}</strong></span>
              </div>
            </div>
          )}

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={handleConfirm}
              disabled={creating || !previews || previews.summary.will_create + previews.summary.will_update === 0}
              className="gap-1.5"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {previews ? `Create ${previews.summary.will_create}${updateExisting ? ` + Update ${previews.summary.will_update}` : ''} Variant(s)` : 'Create Variants'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}