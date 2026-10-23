import { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, Download, ArrowRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  MATERIAL_COLUMNS,
  parseCSV,
  autoMatchColumns,
  validateRow,
  normalizeRow,
  generateErrorReportCSV,
  generateTemplateCSV,
  downloadCSV,
} from '@/lib/materialImportExport';

const BATCH_SIZE = 250;

const STEPS = {
  UPLOAD: 'upload',
  MAPPING: 'mapping',
  PREVIEW: 'preview',
  IMPORTING: 'importing',
  RESULTS: 'results',
};

export default function MaterialImportDialog({ open, onOpenChange, onImported }) {
  const [step, setStep] = useState(STEPS.UPLOAD);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [rawHeaders, setRawHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [duplicateMode, setDuplicateMode] = useState('skip');
  const [importResults, setImportResults] = useState(null);
  const [validatedRows, setValidatedRows] = useState([]);
  const [importProgress, setImportProgress] = useState(null);
  const [existingCheck, setExistingCheck] = useState(null);
  const [checkingExisting, setCheckingExisting] = useState(false);
  const fileInputRef = useRef(null);

  const reset = () => {
    setStep(STEPS.UPLOAD);
    setLoading(false);
    setFileName('');
    setRawHeaders([]);
    setRawRows([]);
    setColumnMapping({});
    setValidatedRows([]);
    setImportResults(null);
    setImportProgress(null);
    setExistingCheck(null);
    setCheckingExisting(false);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setLoading(true);

    try {
      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text();
        const { headers, rows } = parseCSV(text);
        if (rows.length === 0) {
          toast.error('CSV file has no data rows');
          setLoading(false);
          return;
        }
        setRawHeaders(headers);
        setRawRows(rows);
        setColumnMapping(autoMatchColumns(headers));
        setStep(STEPS.MAPPING);
      } else if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        // Excel: upload and extract via AI integration
        const uploadRes = await base44.integrations.Core.UploadFile({ file });
        const fileUrl = uploadRes.file_url;

        const extractSchema = {
          type: 'object',
          properties: {
            rows: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  'INV ID': { type: 'string' },
                  'SKU': { type: 'string' },
                  'Item Name': { type: 'string' },
                  'Description': { type: 'string' },
                  'Category': { type: 'string' },
                  'Manufacturer': { type: 'string' },
                  'Vendor': { type: 'string' },
                  'Vendor Part Number': { type: 'string' },
                  'Unit of Measure': { type: 'string' },
                  'Unit Cost': { type: 'string' },
                  'MSRP': { type: 'string' },
                  'Selling Price': { type: 'string' },
                  'Primary Location': { type: 'string' },
                  'Minimum Stock': { type: 'string' },
                  'Reorder Quantity': { type: 'string' },
                  'Opening Quantity': { type: 'string' },
                  'Image URL': { type: 'string' },
                  'Active Status': { type: 'string' },
                },
                additionalProperties: true,
              },
            },
          },
        };

        const extractRes = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url: fileUrl,
          json_schema: extractSchema,
        });

        const rows = (extractRes.output?.rows || extractRes.output || []);
        if (!Array.isArray(rows) || rows.length === 0) {
          toast.error('Could not extract data from Excel file');
          setLoading(false);
          return;
        }

        const headers = Object.keys(rows[0]);
        setRawHeaders(headers);
        setRawRows(rows);
        // Auto-match — Excel extraction already uses our column names
        const mapping = {};
        for (const col of MATERIAL_COLUMNS) {
          mapping[col.field] = headers.includes(col.header) ? col.header : '';
        }
        setColumnMapping(mapping);
        setStep(STEPS.MAPPING);
      } else {
        toast.error('Please upload a .csv or .xlsx file');
      }
    } catch (err) {
      toast.error('Failed to parse file: ' + err.message);
    }
    setLoading(false);
  };

  const handleMappingChange = (field, value) => {
    setColumnMapping(prev => ({ ...prev, [field]: value }));
  };

  const handlePreview = async () => {
    // Build mapped rows
    const mapped = rawRows.map((row, idx) => {
      const mappedRow = {};
      for (const col of MATERIAL_COLUMNS) {
        const sourceCol = columnMapping[col.field];
        mappedRow[col.field] = sourceCol ? (row[sourceCol] ?? '') : '';
      }
      return mappedRow;
    });

    // Collect all SKUs for duplicate detection
    const allSKUs = mapped.map(r => r.sku).filter(Boolean);

    // Validate
    const validated = mapped.map((row, idx) => {
      const { status, errors, warnings } = validateRow(row, allSKUs, idx);
      return {
        rowNumber: idx + 2, // +2 because row 1 is header, row 2 is first data
        ...row,
        status,
        errors,
        warnings,
      };
    });

    setValidatedRows(validated);
    setExistingCheck(null);
    setStep(STEPS.PREVIEW);

    // Auto-check existing SKUs against database
    const skus = validated.map(r => r.sku).filter(Boolean);
    if (skus.length > 0) {
      setCheckingExisting(true);
      try {
        const res = await base44.functions.invoke('importMaterials', { mode: 'check', skus });
        setExistingCheck(res.data || res);
      } catch {
        // silent — user can proceed without the pre-check
      } finally {
        setCheckingExisting(false);
      }
    }
  };

  const handleImport = async (isResume = false) => {
    setLoading(true);
    setStep(STEPS.IMPORTING);

    const allImportable = validatedRows
      .filter(r => r.status === 'valid' || r.status === 'warning')
      .map(r => normalizeRow(r));

    let rowsToProcess = allImportable;

    // On resume: re-check which SKUs already exist to skip partially-imported rows
    if (isResume) {
      const skus = allImportable.map(r => r.sku).filter(Boolean);
      if (skus.length > 0) {
        try {
          const res = await base44.functions.invoke('importMaterials', { mode: 'check', skus });
          const existingSet = new Set(
            (res.data?.existing || res.existing || []).map(s => (s || '').trim().toUpperCase())
          );
          rowsToProcess = allImportable.filter(r => !r.sku || !existingSet.has(r.sku.trim().toUpperCase()));
        } catch {
          // proceed with all rows if check fails
        }
      }
    }

    if (rowsToProcess.length === 0) {
      toast.info('All SKUs already imported — nothing to process.');
      setImportResults(isResume && importProgress ? importProgress : { created: 0, updated: 0, skipped: 0, opening_txns: 0, errors: [] });
      setStep(STEPS.RESULTS);
      setLoading(false);
      return;
    }

    // Chunk into batches of 250
    const batches = [];
    for (let i = 0; i < rowsToProcess.length; i += BATCH_SIZE) {
      batches.push(rowsToProcess.slice(i, i + BATCH_SIZE));
    }

    // Preserve accumulated counts on resume
    const accumulated = isResume && importProgress
      ? {
          created: importProgress.created || 0,
          updated: importProgress.updated || 0,
          skipped: importProgress.skipped || 0,
          opening_txns: importProgress.opening_txns || 0,
          errors: [...(importProgress.errors || [])],
        }
      : { created: 0, updated: 0, skipped: 0, opening_txns: 0, errors: [] };

    let failed = false;
    let errorMessage = null;

    for (let i = 0; i < batches.length; i++) {
      setImportProgress({
        currentBatch: i + 1,
        totalBatches: batches.length,
        processedRows: i * BATCH_SIZE,
        totalRows: rowsToProcess.length,
        ...accumulated,
        failed: false,
      });

      try {
        const res = await base44.functions.invoke('importMaterials', {
          materials: batches[i],
          duplicate_mode: duplicateMode,
          batch_number: i + 1,
          total_batches: batches.length,
        });
        const data = res.data || res;
        accumulated.created += data.created || 0;
        accumulated.updated += data.updated || 0;
        accumulated.skipped += data.skipped || 0;
        accumulated.opening_txns += data.opening_txns || 0;
        if (data.errors) accumulated.errors.push(...data.errors);

        // Update progress after batch completes
        setImportProgress({
          currentBatch: i + 1,
          totalBatches: batches.length,
          processedRows: Math.min((i + 1) * BATCH_SIZE, rowsToProcess.length),
          totalRows: rowsToProcess.length,
          ...accumulated,
          failed: false,
        });
      } catch (err) {
        failed = true;
        errorMessage = err.message;
        setImportProgress(prev => ({
          ...prev,
          ...accumulated,
          failed: true,
          errorMessage,
        }));
        break;
      }
    }

    if (!failed) {
      setImportResults(accumulated);
      setStep(STEPS.RESULTS);
      toast.success(`Import complete: ${accumulated.created} created, ${accumulated.skipped} skipped`);
      if (onImported) onImported();
    } else {
      toast.error(`Import interrupted: ${errorMessage}. Click Resume to continue.`);
    }

    setLoading(false);
  };

  const handleResume = () => handleImport(true);

  const handleDownloadErrorReport = () => {
    const errorRows = validatedRows.filter(r => r.status !== 'valid');
    if (errorRows.length === 0) {
      toast.info('No warnings or errors to report');
      return;
    }
    const csv = generateErrorReportCSV(errorRows);
    downloadCSV(csv, 'material-import-errors.csv');
  };

  const validCount = validatedRows.filter(r => r.status === 'valid').length;
  const warningCount = validatedRows.filter(r => r.status === 'warning').length;
  const rejectedCount = validatedRows.filter(r => r.status === 'rejected').length;
  const importableCount = validCount + warningCount;

  const stepLabels = ['Upload', 'Map Columns', 'Preview', 'Importing', 'Results'];
  const stepKeys = [STEPS.UPLOAD, STEPS.MAPPING, STEPS.PREVIEW, STEPS.IMPORTING, STEPS.RESULTS];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Import Materials
            {step !== STEPS.UPLOAD && (
              <span className="text-sm text-muted-foreground ml-2">
                {fileName}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs flex-wrap">
          {stepLabels.map((label, i) => {
            const isActive = step === stepKeys[i];
            const isDone = stepKeys.indexOf(step) > i;
            return (
              <div key={label} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${
                  isActive ? 'bg-primary text-primary-foreground' :
                  isDone ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
                }`}>
                  {isDone && <CheckCircle2 className="w-3 h-3" />}
                  <span>{label}</span>
                </div>
                {i < stepLabels.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
              </div>
            );
          })}
        </div>

        {/* Step: Upload */}
        {step === STEPS.UPLOAD && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-8">
                <div
                  className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                  <p className="font-medium">Click to upload a CSV or Excel file</p>
                  <p className="text-sm text-muted-foreground mt-1">Supports .csv and .xlsx formats — large files are processed in batches automatically</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                {loading && (
                  <div className="flex justify-center mt-4">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                )}
              </CardContent>
            </Card>
            <div className="flex justify-between items-center">
              <Button variant="outline" size="sm" onClick={() => {
                downloadCSV(generateTemplateCSV(), 'material-import-template.csv');
              }}>
                <Download className="w-4 h-4" /> Download Template
              </Button>
              <p className="text-xs text-muted-foreground">
                Opening Quantity creates an opening-balance ledger transaction — the ledger remains the source of truth.
              </p>
            </div>
          </div>
        )}

        {/* Step: Column Mapping */}
        {step === STEPS.MAPPING && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Map your spreadsheet columns to database fields. Auto-matched columns are pre-selected.
            </p>
            <div className="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto">
              {MATERIAL_COLUMNS.map(col => (
                <div key={col.field} className="flex items-center gap-2 p-2 rounded-md border">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{col.header}</p>
                    {col.required && <Badge variant="destructive" className="text-[10px]">Required</Badge>}
                  </div>
                  <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  <Select
                    value={columnMapping[col.field] || '__none__'}
                    onValueChange={(v) => handleMappingChange(col.field, v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      {rawHeaders.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step: Preview & Validation */}
        {step === STEPS.PREVIEW && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Badge className="bg-green-100 text-green-700">
                <CheckCircle2 className="w-3 h-3 mr-1" /> {validCount} Valid
              </Badge>
              <Badge className="bg-amber-100 text-amber-700">
                <AlertTriangle className="w-3 h-3 mr-1" /> {warningCount} Warnings
              </Badge>
              <Badge className="bg-red-100 text-red-700">
                <XCircle className="w-3 h-3 mr-1" /> {rejectedCount} Rejected
              </Badge>
              <Badge variant="outline">{importableCount} will be imported</Badge>
            </div>

            {/* Pre-import existing SKU check */}
            {checkingExisting && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Checking existing SKUs in database...
              </div>
            )}
            {existingCheck && existingCheck.existingCount > 0 && (
              <Card className="border-amber-300 bg-amber-50">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <p className="text-sm font-medium text-amber-800">
                      {existingCheck.existingCount} of {existingCheck.totalInput || (existingCheck.existingCount + existingCheck.notFoundCount)} SKUs already exist in the database
                    </p>
                  </div>
                  <p className="text-xs text-amber-700 mt-1">
                    These will be {duplicateMode === 'skip' ? 'skipped' : 'updated'} during import.
                    {existingCheck.existingCount > 10 && ' This may indicate a previous partial import occurred — resume is safe.'}
                  </p>
                </CardContent>
              </Card>
            )}
            {existingCheck && existingCheck.existingCount === 0 && !checkingExisting && (
              <div className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2 className="w-4 h-4" /> No existing SKUs found — all rows will be new imports.
              </div>
            )}

            {/* Duplicate handling */}
            <Card>
              <CardContent className="p-3">
                <p className="text-sm font-medium mb-2">Duplicate SKU Handling</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={duplicateMode === 'skip' ? 'default' : 'outline'}
                    onClick={() => setDuplicateMode('skip')}
                  >
                    Skip duplicates
                  </Button>
                  <Button
                    size="sm"
                    variant={duplicateMode === 'update' ? 'default' : 'outline'}
                    onClick={() => setDuplicateMode('update')}
                  >
                    Update existing
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Rows preview */}
            <div className="max-h-[40vh] overflow-auto border rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 sticky top-0">
                  <tr>
                    <th className="p-2 text-left font-medium">Row</th>
                    <th className="p-2 text-left font-medium">Status</th>
                    <th className="p-2 text-left font-medium">SKU</th>
                    <th className="p-2 text-left font-medium">Item Name</th>
                    <th className="p-2 text-left font-medium">Opening Qty</th>
                    <th className="p-2 text-left font-medium">Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {validatedRows.slice(0, 200).map((row) => (
                    <tr key={row.rowNumber} className={row.status === 'rejected' ? 'bg-red-50' : row.status === 'warning' ? 'bg-amber-50' : ''}>
                      <td className="p-2 text-muted-foreground">{row.rowNumber}</td>
                      <td className="p-2">
                        {row.status === 'valid' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                        {row.status === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
                        {row.status === 'rejected' && <XCircle className="w-4 h-4 text-red-600" />}
                      </td>
                      <td className="p-2 font-mono">{row.sku || '—'}</td>
                      <td className="p-2 font-medium">{row.item_name || <span className="text-red-600">(missing)</span>}</td>
                      <td className="p-2 tabular-nums">{row.opening_quantity || '—'}</td>
                      <td className="p-2 text-muted-foreground">
                        {[...(row.errors || []), ...(row.warnings || [])].join('; ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {validatedRows.length > 200 && (
                <p className="p-2 text-xs text-muted-foreground text-center">
                  Showing first 200 of {validatedRows.length} rows
                </p>
              )}
            </div>

            <Button variant="outline" size="sm" onClick={handleDownloadErrorReport}>
              <Download className="w-4 h-4" /> Download Error Report
            </Button>
          </div>
        )}

        {/* Step: Importing (progress bar) */}
        {step === STEPS.IMPORTING && importProgress && (
          <div className="space-y-4">
            {!importProgress.failed ? (
              <>
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <div>
                    <p className="font-medium">
                      Processing batch {importProgress.currentBatch} of {importProgress.totalBatches}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {Math.min(importProgress.processedRows, importProgress.totalRows)} / {importProgress.totalRows} rows processed
                    </p>
                  </div>
                </div>
                <Progress value={importProgress.totalRows > 0 ? (importProgress.processedRows / importProgress.totalRows) * 100 : 0} />
                <div className="grid grid-cols-4 gap-3">
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{importProgress.created}</p>
                    <p className="text-xs text-muted-foreground">Created</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600">{importProgress.updated}</p>
                    <p className="text-xs text-muted-foreground">Updated</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-gray-500">{importProgress.skipped}</p>
                    <p className="text-xs text-muted-foreground">Skipped</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">{importProgress.errors.length}</p>
                    <p className="text-xs text-muted-foreground">Errors</p>
                  </CardContent></Card>
                </div>
              </>
            ) : (
              <>
                <Card className="border-red-300">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 text-red-600">
                      <XCircle className="w-5 h-5" />
                      <p className="font-medium">Import interrupted at batch {importProgress.currentBatch} of {importProgress.totalBatches}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">{importProgress.errorMessage}</p>
                    <p className="text-sm">
                      {importProgress.processedRows} of {importProgress.totalRows} rows were processed before the interruption.
                      Records from completed batches are saved. Click "Resume Import" to continue — already-imported SKUs will be skipped automatically.
                    </p>
                  </CardContent>
                </Card>
                <div className="grid grid-cols-4 gap-3">
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{importProgress.created}</p>
                    <p className="text-xs text-muted-foreground">Created</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600">{importProgress.updated}</p>
                    <p className="text-xs text-muted-foreground">Updated</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-gray-500">{importProgress.skipped}</p>
                    <p className="text-xs text-muted-foreground">Skipped</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">{importProgress.errors.length}</p>
                    <p className="text-xs text-muted-foreground">Errors</p>
                  </CardContent></Card>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step: Results */}
        {step === STEPS.RESULTS && importResults && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <Card><CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-green-600">{importResults.created || 0}</p>
                <p className="text-xs text-muted-foreground">Created</p>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-blue-600">{importResults.updated || 0}</p>
                <p className="text-xs text-muted-foreground">Updated</p>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-gray-500">{importResults.skipped || 0}</p>
                <p className="text-xs text-muted-foreground">Skipped</p>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-emerald-600">{importResults.opening_txns || 0}</p>
                <p className="text-xs text-muted-foreground">Opening Balance Txns</p>
              </CardContent></Card>
            </div>

            {importResults.errors && importResults.errors.length > 0 && (
              <Card><CardContent className="p-3">
                <p className="text-sm font-medium text-red-600 mb-2">
                  {importResults.errors.length} errors during import:
                </p>
                <div className="max-h-[30vh] overflow-auto text-xs space-y-1">
                  {importResults.errors.map((err, i) => (
                    <div key={i} className="text-red-600">
                      Row {err.sku || err.item_name}: {err.error}
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => {
                  const csv = generateErrorReportCSV(
                    importResults.errors.map((e, i) => ({
                      rowNumber: i + 1, sku: e.sku, item_name: e.item_name,
                      status: 'rejected', errors: [e.error], warnings: [],
                    }))
                  );
                  downloadCSV(csv, 'material-import-errors.csv');
                }}>
                  <Download className="w-4 h-4" /> Download Error Report
                </Button>
              </CardContent></Card>
            )}

            {importResults.errors?.length === 0 && (
              <div className="flex items-center gap-2 p-4 bg-green-50 rounded-md">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <p className="text-sm text-green-700">All rows imported successfully with no errors.</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === STEPS.UPLOAD && (
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
          )}
          {step === STEPS.MAPPING && (
            <>
              <Button variant="outline" onClick={() => setStep(STEPS.UPLOAD)}>Back</Button>
              <Button onClick={handlePreview} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Preview'}
              </Button>
            </>
          )}
          {step === STEPS.PREVIEW && (
            <>
              <Button variant="outline" onClick={() => setStep(STEPS.MAPPING)}>Back</Button>
              <Button
                onClick={() => handleImport(false)}
                disabled={loading || importableCount === 0}
                className="gap-1.5"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Confirm Import ({importableCount} rows)
              </Button>
            </>
          )}
          {step === STEPS.IMPORTING && (
            importProgress?.failed ? (
              <>
                <Button variant="outline" onClick={() => { setImportResults(importProgress); setStep(STEPS.RESULTS); }}>
                  View Partial Results
                </Button>
                <Button onClick={handleResume} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Resume Import
                </Button>
              </>
            ) : (
              <Button variant="outline" disabled>
                <Loader2 className="w-4 h-4 animate-spin" /> Importing...
              </Button>
            )
          )}
          {step === STEPS.RESULTS && (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}