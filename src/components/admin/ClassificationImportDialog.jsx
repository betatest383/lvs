import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Upload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

export default function ClassificationImportDialog({ open, onClose, onImported }) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  const handleFile = async (file) => {
    setLoading(true);
    try {
      const text = await file.text();
      let records;
      try {
        records = JSON.parse(text);
      } catch {
        // Try CSV
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        records = lines.slice(1).map(line => {
          const vals = line.split(',').map(v => v.trim());
          const obj = {};
          headers.forEach((h, i) => { obj[h] = vals[i]; });
          return obj;
        });
      }
      if (!Array.isArray(records)) {
        toast.error('File must contain an array of classification objects');
        setPreview(null);
        return;
      }
      const valid = records.filter(r => r.classification_type && r.value);
      setPreview({ total: records.length, valid, invalid: records.length - valid.length });
    } catch (e) {
      toast.error('Failed to read file: ' + e.message);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const payload = preview.valid.map(r => ({
        classification_type: r.classification_type,
        value: r.value,
        label: r.label || r.value,
        parent_value: r.parent_value || '',
        description: r.description || '',
        sort_order: Number(r.sort_order) || 0,
        is_active: r.is_active !== false && r.is_active !== 'false',
      }));
      const created = await base44.entities.MasterClassification.bulkCreate(payload);
      toast.success(`Imported ${created.length} classifications`);
      onImported();
      onClose();
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      toast.error('Import failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !loading) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import Classifications</DialogTitle>
          <DialogDescription>Upload a JSON array or CSV file of classification records.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-dashed p-6 text-center">
            <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <input
              ref={fileRef}
              type="file"
              accept=".json,.csv"
              onChange={e => e.target.files[0] && handleFile(e.target.files[0])}
              className="hidden"
              id="classification-import-file"
            />
            <Label htmlFor="classification-import-file" className="cursor-pointer text-sm text-primary underline">
              Click to select a file
            </Label>
            <p className="text-xs text-muted-foreground mt-1">JSON array or CSV with headers</p>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {preview && !loading && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium">{preview.valid.length} valid records</span>
              </div>
              {preview.invalid > 0 && (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span className="text-sm text-amber-700">{preview.invalid} records skipped (missing type or value)</span>
                </div>
              )}
              <div className="rounded border bg-muted/30 p-2 max-h-32 overflow-y-auto">
                {preview.valid.slice(0, 10).map((r, i) => (
                  <div key={i} className="text-xs font-mono text-muted-foreground">
                    {r.classification_type}: {r.value}
                  </div>
                ))}
                {preview.valid.length > 10 && (
                  <div className="text-xs text-muted-foreground">... and {preview.valid.length - 10} more</div>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleImport} disabled={!preview || loading} className="gap-1.5">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Import {preview ? `${preview.valid.length} ` : ''}Records
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}