import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Upload, AlertCircle } from 'lucide-react';
import { parseServicesCsv, buildImportUpdate, findMatchingService } from '@/lib/serviceCatalogImportExport';

export default function ServiceImportDialog({ open, existingServices, onImport, onClose }) {
  const [file, setFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [clearBlanks, setClearBlanks] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);

  const handleFileSelect = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseServicesCsv(ev.target.result);
      setParsedRows(rows);
    };
    reader.readAsText(selected);
  };

  const handleImport = async () => {
    if (parsedRows.length === 0) return;
    setProcessing(true);
    try {
      // Log comparison: imported values vs manual upload format
      console.log('[ServiceCatalog Import] === Image Value Comparison ===');
      console.log('[ServiceCatalog Import] Manual upload format: https://media.base44.com/images/public/{appId}/...');
      parsedRows.forEach((row, i) => {
        if (row.service_image) {
          console.log(`[ServiceCatalog Import] Row ${i + 1} (${row.service_name || 'unknown'}):`, {
            raw_value: row.service_image,
            is_full_url: row.service_image.startsWith('http'),
            type: row.service_image.startsWith('http') ? 'public_url' : 'relative_path'
          });
        }
      });
      console.log('[ServiceCatalog Import] === End Comparison ===');

      let created = 0, updated = 0, skipped = 0;
      for (const row of parsedRows) {
        const existing = findMatchingService(existingServices, row);
        if (existing) {
          const update = buildImportUpdate(existing, row, clearBlanks);
          if (update && Object.keys(update).length > 0) {
            await onImport('update', existing, update);
            updated++;
          } else {
            skipped++;
          }
        } else {
          // New service — include service_image if valid URL
          const create = buildImportUpdate(null, row, false);
          if (create && create.service_name) {
            await onImport('create', null, create);
            created++;
          } else {
            skipped++;
          }
        }
      }
      setResult({ created, updated, skipped });
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setParsedRows([]);
    setClearBlanks(false);
    setResult(null);
    setProcessing(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !processing) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Service Catalog (CSV)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>CSV File</Label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground"
            />
          </div>

          {parsedRows.length > 0 && (
            <div className="text-sm text-muted-foreground space-y-1">
              <div>{parsedRows.length} row(s) detected.</div>
              <div className="text-xs">
                Image URLs: {parsedRows.filter(r => r.service_image && r.service_image.startsWith('http')).length} ·
                Relative paths: {parsedRows.filter(r => r.service_image && !r.service_image.startsWith('http') && r.service_image !== '').length}
              </div>
            </div>
          )}

          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/50 space-y-2">
            <div className="flex items-center gap-2">
              <Switch checked={clearBlanks} onCheckedChange={setClearBlanks} />
              <Label>Overwrite blank fields</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              When enabled, blank cells (including blank <code>service_image</code>) will clear existing values.
              When disabled, blank <code>service_image</code> cells preserve the existing image URL.
            </p>
          </div>

          {result && !result.error && (
            <div className="p-3 rounded-lg border border-green-200 bg-green-50/50 text-sm space-y-1">
              <div className="font-medium text-green-800">Import complete</div>
              <div className="text-muted-foreground">
                Created: {result.created} · Updated: {result.updated} · Skipped: {result.skipped}
              </div>
            </div>
          )}
          {result?.error && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50/50 text-sm text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{result.error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={processing}>Close</Button>
          <Button onClick={handleImport} disabled={processing || parsedRows.length === 0}>
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}