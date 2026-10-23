import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, FileWarning, Loader2, Link2 } from 'lucide-react';

export default function CapImportPreviewDialog({ open, preview, onConfirm, onClose, importing }) {
  const [ackUnresolved, setAckUnresolved] = useState(false);

  const skuResolution = preview?.skuResolution || [];
  const records = preview?.records || [];
  const hasUnresolved = records.some(r => r.material_sku && !r.material_id);

  useEffect(() => {
    if (open) setAckUnresolved(false);
  }, [open, preview]);

  if (!preview) return null;
  const { errors, skippedEmpty, totalRows } = preview;
  const hasValidRecords = records.length > 0;
  const hasErrors = errors.length > 0;

  const resCounts = skuResolution.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  const unresolvedResolutions = skuResolution.filter(r => r.status !== 'matched' && r.status !== 'blank');
  const matchedCount = resCounts.matched || 0;
  const canImport = hasValidRecords && (!hasUnresolved || ackUnresolved);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !importing) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onCloseAttempt={() => { if (!importing) onClose(); }}>
        <DialogHeader>
          <DialogTitle>Import Preview (Dry Run)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center p-3 border rounded-lg">
              <p className="text-2xl font-bold">{totalRows}</p>
              <p className="text-xs text-muted-foreground">Total Rows</p>
            </div>
            <div className="text-center p-3 border rounded-lg">
              <p className="text-2xl font-bold text-green-600">{records.length}</p>
              <p className="text-xs text-muted-foreground">Valid Records</p>
            </div>
            <div className="text-center p-3 border rounded-lg">
              <p className="text-2xl font-bold text-muted-foreground">{skippedEmpty}</p>
              <p className="text-xs text-muted-foreground">Empty (Skipped)</p>
            </div>
            <div className="text-center p-3 border rounded-lg">
              <p className={`text-2xl font-bold ${hasErrors ? 'text-red-600' : 'text-green-600'}`}>{errors.length}</p>
              <p className="text-xs text-muted-foreground">Errors</p>
            </div>
          </div>

          {skuResolution.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold flex items-center gap-1.5"><Link2 className="w-4 h-4" /> Material SKU Resolution</p>
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-300">{matchedCount} matched</Badge>
                {resCounts.not_found > 0 && <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-300">{resCounts.not_found} not found</Badge>}
                {resCounts.ambiguous > 0 && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300">{resCounts.ambiguous} ambiguous</Badge>}
              </div>
            </div>
          )}

          {hasUnresolved && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p>{unresolvedResolutions.length} record(s) have unresolved material SKUs and will be imported without a linked material (marked as requiring linkage).</p>
                  <p className="text-xs mt-1 text-amber-700">Use "Link Materials by SKU" after import to resolve them, or fix the SKUs in your source file.</p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={ackUnresolved} onCheckedChange={setAckUnresolved} disabled={importing} />
                I confirm — import records with unresolved SKUs anyway
              </label>
              <div className="max-h-[200px] overflow-y-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 sticky top-0">
                    <tr>
                      <th className="text-left py-2 px-3 font-semibold">Imported SKU</th>
                      <th className="text-left py-2 px-3 font-semibold">Status</th>
                      <th className="text-left py-2 px-3 font-semibold">Matched Material</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unresolvedResolutions.map((r, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="py-1.5 px-3"><code className="text-[10px]">{r.sku}</code></td>
                        <td className="py-1.5 px-3">
                          <Badge variant="outline" className={`text-[9px] ${r.status === 'not_found' ? 'bg-red-50 text-red-700 border-red-300' : 'bg-amber-50 text-amber-700 border-amber-300'}`}>
                            {r.status === 'not_found' ? 'Not Found' : `Ambiguous (${r.match_count || '?'})`}
                          </Badge>
                        </td>
                        <td className="py-1.5 px-3 text-muted-foreground">{r.material_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!hasValidRecords && !hasErrors && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg text-sm">
              <FileWarning className="w-4 h-4 text-amber-500" />
              No data rows found to import.
            </div>
          )}
          {hasValidRecords && !hasErrors && !hasUnresolved && (
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg text-sm text-green-700">
              <CheckCircle2 className="w-4 h-4" />
              All {records.length} record(s) passed validation. Ready to import.
            </div>
          )}
          {hasErrors && (
            <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-sm text-red-700">
              <AlertTriangle className="w-4 h-4" />
              {errors.length} row(s) have validation errors. Valid records ({records.length}) can still be imported.
            </div>
          )}

          {hasErrors && (
            <div>
              <p className="text-sm font-semibold mb-2">Validation Errors</p>
              <div className="max-h-[300px] overflow-y-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 sticky top-0">
                    <tr>
                      <th className="text-left py-2 px-3 font-semibold">CSV Row</th>
                      <th className="text-left py-2 px-3 font-semibold">Matrix Name</th>
                      <th className="text-left py-2 px-3 font-semibold">Field</th>
                      <th className="text-left py-2 px-3 font-semibold">Value</th>
                      <th className="text-left py-2 px-3 font-semibold">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errors.map((err, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="py-1.5 px-3">{err.row}</td>
                        <td className="py-1.5 px-3">{err.matrix_name}</td>
                        <td className="py-1.5 px-3"><code className="text-[10px]">{err.field}</code></td>
                        <td className="py-1.5 px-3 text-muted-foreground">{err.value || '(blank)'}</td>
                        <td className="py-1.5 px-3 text-red-600">{err.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={importing}>Cancel</Button>
          {hasValidRecords && (
            <Button onClick={onConfirm} disabled={importing || !canImport}>
              {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm Import ({records.length} records)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}