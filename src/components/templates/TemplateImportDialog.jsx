import { useState, useRef } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

// Exact CSV column order required by importTaskTemplates
const HEADERS = [
  'template_key', 'template_name', 'category', 'department_name', 'description',
  'instructions', 'default_priority', 'urgency', 'business_impact',
  'interruptibility', 'assignment_mode', 'default_role_ids', 'default_department_id',
  'requires_approval', 'approval_role_ids', 'required_employee_count',
  'work_category', 'execution_mode',
];

// ── Minimal RFC-4180-ish CSV parser (handles quoted fields & commas in quotes) ──
function parseCSV(text) {
  const lines = [];
  let cur = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); lines.push(row); row = []; cur = ''; }
      else if (c === '\r') { /* skip CR */ }
      else cur += c;
    }
  }
  if (cur !== '' || row.length > 0) { row.push(cur); lines.push(row); }

  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].length === 1 && lines[i][0] === '') continue; // skip blank lines
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (lines[i][idx] ?? '').trim(); });
    rows.push(obj);
  }
  return { headers, rows };
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCSV(headers, rows) {
  return [headers.join(','), ...rows.map(r => headers.map(h => csvEscape(r[h])).join(','))].join('\n');
}

function downloadFile(filename, content, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const PREVIEW_COLS = ['template_key', 'template_name', 'category', 'default_priority', 'work_category', 'execution_mode'];

export default function TemplateImportDialog({ open, onOpenChange, onImported }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const reset = () => {
    setRows([]);
    setFileName('');
    setParseError('');
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = async (file) => {
    setResult(null);
    setParseError('');
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      setParseError('Please upload a .csv file');
      return;
    }
    try {
      const text = await file.text();
      const { headers, rows: parsed } = parseCSV(text);
      const missing = HEADERS.filter(h => !headers.includes(h));
      if (missing.length > 0) {
        setParseError(`Missing required columns: ${missing.join(', ')}`);
        setRows([]);
        setFileName(file.name);
        return;
      }
      setRows(parsed);
      setFileName(file.name);
    } catch (e) {
      setParseError('Failed to read CSV: ' + (e?.message || String(e)));
      setRows([]);
    }
  };

  const handleDownloadBlank = () => {
    downloadFile('task_templates_import_template.csv', HEADERS.join(',') + '\n');
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    try {
      const res = await base44.functions.invoke('importTaskTemplates', { rows });
      const data = res.data;
      if (!data?.success) {
        throw new Error(data?.error || 'Import failed');
      }
      setResult(data);
      toast.success(`Imported ${data.created} templates · ${data.skipped} skipped · ${data.errors} errors`);
      onImported?.();
    } catch (e) {
      toast.error('Import failed: ' + (e?.response?.data?.error || e?.message || String(e)));
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadReport = () => {
    if (!result?.report) return;
    const reportHeaders = ['row', 'template_key', 'template_name', 'status', 'message', 'template_id', 'template_number'];
    downloadFile('task_templates_import_report.csv', toCSV(reportHeaders, result.report));
  };

  const close = () => { reset(); onOpenChange(false); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); else onOpenChange(true); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" onCloseAttempt={close}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-accent" /> Import Task Templates
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Bulk-import templates as <strong>Draft</strong>. Duplicates are detected by <code>template_key</code> and skipped.
            No live tasks are created, no employees assigned, no notifications sent.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleDownloadBlank}>
              <Download className="w-4 h-4 mr-1" /> Blank CSV template
            </Button>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <span className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium h-8 px-3 border border-input bg-background hover:bg-accent/10">
                <FileSpreadsheet className="w-4 h-4" /> Choose CSV…
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </label>
            {fileName && <span className="text-xs text-muted-foreground truncate">{fileName} · {rows.length} row{rows.length !== 1 ? 's' : ''}</span>}
          </div>

          {parseError && (
            <div className="flex items-start gap-2 p-2 rounded-md border border-destructive/30 bg-destructive/5 text-xs text-destructive">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Preview */}
          {rows.length > 0 && !result && (
            <div className="rounded-md border">
              <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
                <span className="text-xs font-medium">Preview ({rows.length} rows)</span>
                <span className="text-[10px] text-muted-foreground">First 8 shown · all rows import on submit</span>
              </div>
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-xs">
                  <thead className="bg-muted/20 sticky top-0">
                    <tr>{PREVIEW_COLS.map(h => <th key={h} className="text-left font-medium px-2 py-1.5 whitespace-nowrap">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 8).map((r, i) => (
                      <tr key={i} className="border-t">
                        {PREVIEW_COLS.map(h => <td key={h} className="px-2 py-1.5 align-top max-w-[200px] truncate" title={r[h]}>{r[h] || '—'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Result summary */}
          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-center">
                  <CheckCircle2 className="w-5 h-5 mx-auto text-emerald-600 mb-1" />
                  <p className="text-2xl font-bold text-emerald-700">{result.created}</p>
                  <p className="text-[10px] uppercase text-emerald-700">Created</p>
                </div>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-center">
                  <AlertTriangle className="w-5 h-5 mx-auto text-amber-600 mb-1" />
                  <p className="text-2xl font-bold text-amber-700">{result.skipped}</p>
                  <p className="text-[10px] uppercase text-amber-700">Skipped</p>
                </div>
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-center">
                  <XCircle className="w-5 h-5 mx-auto text-red-600 mb-1" />
                  <p className="text-2xl font-bold text-red-700">{result.errors}</p>
                  <p className="text-[10px] uppercase text-red-700">Errors</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{result.total} rows processed</span>
                <Button type="button" variant="outline" size="sm" onClick={handleDownloadReport}>
                  <Download className="w-4 h-4 mr-1" /> Download report
                </Button>
              </div>
              {/* Report table */}
              <div className="rounded-md border max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/20 sticky top-0">
                    <tr>
                      <th className="text-left font-medium px-2 py-1.5">#</th>
                      <th className="text-left font-medium px-2 py-1.5">Status</th>
                      <th className="text-left font-medium px-2 py-1.5">template_key</th>
                      <th className="text-left font-medium px-2 py-1.5">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.report.map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1.5">{r.row}</td>
                        <td className="px-2 py-1.5">
                          <span className={
                            r.status === 'created' ? 'text-emerald-700 font-medium' :
                            r.status.startsWith('skipped') ? 'text-amber-700 font-medium' :
                            'text-red-700 font-medium'
                          }>{r.status.replace('skipped_', 'skipped · ')}</span>
                        </td>
                        <td className="px-2 py-1.5 truncate max-w-[140px]" title={r.template_key}>{r.template_key || '—'}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{r.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={close} disabled={importing}>Close</Button>
          {rows.length > 0 && !result && (
            <Button onClick={handleImport} disabled={importing || rows.length === 0}>
              {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
              Import {rows.length} row{rows.length !== 1 ? 's' : ''} as Draft
            </Button>
          )}
          {result && (
            <Button variant="outline" onClick={reset}>Import another file</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}