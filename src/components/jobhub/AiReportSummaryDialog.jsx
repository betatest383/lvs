import { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useDeveloperMode } from '@/hooks/useDeveloperMode';
import {
  Sparkles, Loader2, CheckCircle2, RefreshCw, Edit3, AlertTriangle, FileText,
  ShieldAlert, Bug, ChevronDown, ChevronRight,
} from 'lucide-react';

const STATUS_CONFIG = {
  not_generated: { label: 'Not Generated', badge: 'bg-gray-100 text-gray-600' },
  draft: { label: 'Draft Generated', badge: 'bg-blue-100 text-blue-700' },
  edited: { label: 'Technician Edited', badge: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', badge: 'bg-green-100 text-green-700' },
};

const CRITICAL_RESPONSES = [
  'unsafe', 'failed', 'deficient', 'needs repair', 'water damage',
  'cracked', 'improper installation', 'immediate attention required',
];

function isCritical(val) {
  if (!val) return false;
  const v = String(val).toLowerCase().trim();
  return CRITICAL_RESPONSES.some(c => v === c || v.includes(c));
}

function safeParse(str, fallback) {
  try { return JSON.parse(str || 'null') ?? fallback; } catch { return fallback; }
}

export default function AiReportSummaryDialog({
  open, onClose, onContinue, loading: wfLoading, jobId, onComplete, effectiveName,
  findings = [], legacyFindings = [], submissions = [], repairRecs = [],
}) {
  const { isDevToolsVisible } = useDeveloperMode();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [summaryText, setSummaryText] = useState('');
  const [notes, setNotes] = useState('');
  const [dirty, setDirty] = useState(false);
  const [diagnostic, setDiagnostic] = useState(null);
  const [showDevPanel, setShowDevPanel] = useState(false);

  // Load report when dialog opens
  const loadReport = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const reports = await base44.entities.InspectionReport.filter({ job_id: jobId }).catch(() => []);
      const r = reports[0] || null;
      setReport(r);
      setSummaryText(r?.ai_summary_draft || r?.ai_summary_final || '');
      setNotes(r?.ai_summary_notes || '');
      setDirty(false);
    } catch (e) {
      console.error('Failed to load report:', e);
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    if (open) loadReport();
  }, [open, loadReport]);

  // Compute the unified findings — same source as Inspection Review
  const allFindings = useMemo(() => [...findings, ...legacyFindings], [findings, legacyFindings]);

  const deficiencies = useMemo(
    () => allFindings.filter(f => f.is_deficiency !== false && f.internal_only !== true && f.include_in_estimate !== false),
    [allFindings]
  );

  // Derive critical conditions from raw answers (same logic as PDF + Inspection Review)
  const derivedCriticalConditions = useMemo(() => {
    const mergedAnswers = {};
    for (const sub of submissions) {
      const subAnswers = safeParse(sub.answers, {});
      for (const [key, val] of Object.entries(subAnswers)) {
        const existingEmpty = mergedAnswers[key] === undefined || mergedAnswers[key] === null || mergedAnswers[key] === '';
        const incomingEmpty = val === undefined || val === null || val === '';
        if (existingEmpty && !incomingEmpty) {
          mergedAnswers[key] = val;
        } else if (!existingEmpty && !incomingEmpty) {
          if (key.endsWith('_photos') && Array.isArray(mergedAnswers[key]) && Array.isArray(val)) {
            const merged = [...mergedAnswers[key]];
            for (const url of val) { if (!merged.includes(url)) merged.push(url); }
            mergedAnswers[key] = merged;
          }
        }
      }
    }
    const conditions = [];
    for (const [key, val] of Object.entries(mergedAnswers)) {
      if (key.endsWith('_photos')) continue;
      const vals = Array.isArray(val) ? val : [val];
      if (vals.some(v => isCritical(v))) {
        conditions.push({ key, answer: vals.join(', ') });
      }
    }
    return conditions;
  }, [submissions]);

  // Validation: if deficiencies exist but AI summary doesn't reference them
  const summaryMissesFindings = useMemo(() => {
    if (!summaryText || deficiencies.length === 0) return false;
    const summaryLower = summaryText.toLowerCase();
    // Check if at least one deficiency type appears in the summary
    const referenced = deficiencies.some(f => {
      const type = (f.deficiency_type || f.finding_type || '').toLowerCase();
      return type && summaryLower.includes(type);
    });
    return !referenced;
  }, [summaryText, deficiencies]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const response = await base44.functions.invoke('generateInspectionSummary', { job_id: jobId });
      if (response.data?.error) {
        setGenError(response.data.error);
      } else {
        if (response.data?.diagnostic) setDiagnostic(response.data.diagnostic);
        await loadReport();
      }
    } catch (e) {
      setGenError(e.message || 'Failed to generate summary');
    }
    setGenerating(false);
  }, [jobId, loadReport]);

  const handleSaveDraft = useCallback(async () => {
    if (!report) return;
    try {
      const updated = await base44.entities.InspectionReport.update(report.id, {
        ai_summary_draft: summaryText,
        ai_summary_status: 'edited',
        ai_summary_notes: notes,
      });
      setReport(updated);
      setDirty(false);
    } catch (e) {
      console.error('Failed to save draft:', e);
    }
  }, [report, summaryText, notes]);

  const handleApprove = useCallback(async () => {
    if (!report || !summaryText.trim()) return;
    try {
      const updated = await base44.entities.InspectionReport.update(report.id, {
        ai_summary_draft: summaryText,
        ai_summary_final: summaryText,
        ai_summary_status: 'approved',
        ai_summary_approved_at: new Date().toISOString(),
        ai_summary_approved_by: effectiveName || '',
        ai_summary_notes: notes,
        summary: summaryText,
      });
      setReport(updated);
      setDirty(false);
    } catch (e) {
      console.error('Failed to approve summary:', e);
    }
  }, [report, summaryText, notes, effectiveName]);

  const isApproved = report?.ai_summary_status === 'approved';
  const status = report?.ai_summary_status || 'not_generated';
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.not_generated;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" /> AI-Assisted Inspection Report Summary
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4 max-h-[65vh]">
          {loading || (generating && !report) ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
              <p className="text-sm text-muted-foreground">
                {generating ? 'Generating AI summary from inspection results...' : 'Loading...'}
              </p>
            </div>
          ) : genError && !report ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-red-800">
                <AlertTriangle className="w-5 h-5" />
                <p className="font-medium">Generation Failed</p>
              </div>
              <p className="text-sm text-red-700">{genError}</p>
              <Button size="sm" variant="outline" onClick={handleGenerate} className="mt-2 gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> Retry Generation
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Status bar */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`${statusConfig.badge} text-xs`}>{statusConfig.label}</Badge>
                {isApproved && (
                  <Badge className="bg-green-100 text-green-700 text-xs gap-0.5">
                    <CheckCircle2 className="w-3 h-3" /> Approved
                  </Badge>
                )}
                {dirty && (
                  <Badge variant="outline" className="text-xs text-amber-600">Unsaved changes</Badge>
                )}
              </div>

              {/* Validation Warning: deficiencies exist but summary doesn't reference them */}
              {summaryMissesFindings && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-4 space-y-1">
                  <div className="flex items-center gap-2 text-red-800">
                    <ShieldAlert className="w-5 h-5" />
                    <p className="font-medium text-sm">AI summary may be missing inspection findings.</p>
                  </div>
                  <p className="text-xs text-red-700 ml-7">
                    {deficiencies.length} deficiency/deficiencies were found during inspection but are not referenced in the generated summary. Consider regenerating or editing the summary to include them.
                  </p>
                </div>
              )}

              {/* Summary editor */}
              {!summaryText && !generating ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 text-center space-y-3">
                  <Sparkles className="w-8 h-8 text-blue-500 mx-auto" />
                  <p className="text-sm font-medium text-blue-900">No summary generated yet.</p>
                  <p className="text-xs text-blue-700">
                    Generate an AI-assisted summary from the inspection results. You'll be able to review, edit, and approve before it appears on the customer report.
                  </p>
                  <Button className="gap-1.5" onClick={handleGenerate} disabled={generating}>
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Generate AI Summary
                  </Button>
                </div>
              ) : generating ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-accent" />
                  <p className="text-sm text-muted-foreground">Generating summary...</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Inspection Report Summary
                    </Label>
                    <Textarea
                      value={summaryText}
                      onChange={(e) => { setSummaryText(e.target.value); setDirty(true); }}
                      className="min-h-[250px] text-sm leading-relaxed"
                      placeholder="Summary will appear here after generation..."
                      disabled={isApproved && !dirty}
                    />
                    {isApproved && !dirty && (
                      <p className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> This summary has been approved and will be used on the customer PDF report.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Technician Notes (internal only)
                    </Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
                      className="min-h-[60px] text-sm"
                      placeholder="Add any internal notes about this summary..."
                    />
                  </div>

                  {genError && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                      {genError}
                    </div>
                  )}
                </>
              )}

              {/* Developer Diagnostic Panel */}
              {isDevToolsVisible && (
                <div className="rounded-lg border border-dashed border-purple-300 bg-purple-50/30 p-3 space-y-2">
                  <button
                    onClick={() => setShowDevPanel(!showDevPanel)}
                    className="flex items-center gap-2 text-xs font-medium text-purple-700 w-full"
                  >
                    <Bug className="w-4 h-4" />
                    Developer Diagnostic: AI Summary Data Flow
                    {showDevPanel ? <ChevronDown className="w-3 h-3 ml-auto" /> : <ChevronRight className="w-3 h-3 ml-auto" />}
                  </button>
                  {showDevPanel && (
                    <div className="space-y-2 text-xs text-purple-900">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded border p-2">
                          <p className="font-medium">Findings passed to AI</p>
                          <p className="text-lg font-bold">{diagnostic?.total_findings ?? allFindings.length}</p>
                          {diagnostic && (
                            <p className="text-[10px] text-muted-foreground">
                              {diagnostic.inspection_findings_count} InspectionFinding + {diagnostic.legacy_findings_count} Finding (legacy)
                            </p>
                          )}
                        </div>
                        <div className="rounded border p-2">
                          <p className="font-medium">Critical findings passed to AI</p>
                          <p className="text-lg font-bold">{diagnostic?.critical_findings_count ?? allFindings.filter(f => f.severity === 'critical' || f.severity === 'major').length}</p>
                        </div>
                        <div className="rounded border p-2">
                          <p className="font-medium">Safety issues passed to AI</p>
                          <p className="text-lg font-bold">{diagnostic?.safety_concerns_count ?? allFindings.filter(f => f.safety_concern).length}</p>
                        </div>
                        <div className="rounded border p-2">
                          <p className="font-medium">NFPA failures passed to AI</p>
                          <p className="text-lg font-bold">{diagnostic?.nfpa_failures_count ?? allFindings.filter(f => f.nfpa_code_failure).length}</p>
                        </div>
                        <div className="rounded border p-2">
                          <p className="font-medium">Derived critical conditions</p>
                          <p className="text-lg font-bold">{diagnostic?.derived_critical_conditions_count ?? derivedCriticalConditions.length}</p>
                        </div>
                        <div className="rounded border p-2">
                          <p className="font-medium">Deficiencies passed to AI</p>
                          <p className="text-lg font-bold">{diagnostic?.deficiencies_count ?? deficiencies.length}</p>
                        </div>
                      </div>

                      {diagnostic?.critical_findings?.length > 0 && (
                        <div className="rounded border border-red-300 bg-red-50 p-2">
                          <p className="font-medium text-red-800">Critical Findings in AI Prompt:</p>
                          <ul className="mt-1 space-y-0.5">
                            {diagnostic.critical_findings.slice(0, 5).map((f, i) => (
                              <li key={i}>• {f.type} [{f.severity}] — {f.location || 'N/A'}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {diagnostic?.safety_concerns?.length > 0 && (
                        <div className="rounded border border-amber-300 bg-amber-50 p-2">
                          <p className="font-medium text-amber-800">Safety Concerns in AI Prompt:</p>
                          <ul className="mt-1 space-y-0.5">
                            {diagnostic.safety_concerns.slice(0, 5).map((f, i) => (
                              <li key={i}>• {f.type} [{f.severity}] — {f.location || 'N/A'}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {diagnostic?.nfpa_failures?.length > 0 && (
                        <div className="rounded border border-red-400 bg-red-50 p-2">
                          <p className="font-medium text-red-800">NFPA Failures in AI Prompt:</p>
                          <ul className="mt-1 space-y-0.5">
                            {diagnostic.nfpa_failures.slice(0, 5).map((f, i) => (
                              <li key={i}>• {f.type} [{f.severity}] — {f.location || 'N/A'}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {diagnostic?.derived_critical_conditions?.length > 0 && (
                        <div className="rounded border border-orange-300 bg-orange-50 p-2">
                          <p className="font-medium text-orange-800">Derived Critical Conditions in AI Prompt:</p>
                          <ul className="mt-1 space-y-0.5">
                            {diagnostic.derived_critical_conditions.slice(0, 5).map((c, i) => (
                              <li key={i}>• {c.question_text}: {c.answer}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="rounded border border-purple-300 bg-purple-50 p-2">
                        <p className="font-medium text-purple-800">Final AI Prompt / Input Payload:</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Prompt length: {diagnostic?.prompt_length ?? 'N/A'} chars</p>
                        {diagnostic?.prompt_preview && (
                          <pre className="mt-1 text-[9px] whitespace-pre-wrap text-purple-700 max-h-32 overflow-auto rounded bg-white/50 p-1">
                            {diagnostic.prompt_preview}
                          </pre>
                        )}
                        {!diagnostic && (
                          <p className="text-[10px] text-muted-foreground mt-1 italic">
                            Generate the summary to see the full prompt payload sent to the AI.
                          </p>
                        )}
                      </div>

                      <div className="rounded border p-2">
                        <p className="font-medium">Data Source Alignment</p>
                        <p className="text-[10px] mt-0.5">
                          AI summary uses the same unified finding source as Inspection Review and PDF generation:
                          InspectionFinding + Finding (legacy) + derived critical conditions from raw answers.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="border-t pt-4 flex items-center justify-between flex-wrap gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <div className="flex gap-2 flex-wrap">
            {summaryText && !generating && (
              <>
                <Button variant="outline" className="gap-1.5" onClick={handleGenerate} disabled={generating}>
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Regenerate
                </Button>
                {dirty && !isApproved && (
                  <Button variant="outline" className="gap-1.5" onClick={handleSaveDraft}>
                    <Edit3 className="w-4 h-4" /> Save Draft
                  </Button>
                )}
                {!isApproved && (
                  <Button className="gap-1.5 bg-green-600 hover:bg-green-700" onClick={handleApprove} disabled={!summaryText.trim()}>
                    <CheckCircle2 className="w-4 h-4" /> Approve Summary
                  </Button>
                )}
                {isApproved && (
                  <Button className="gap-1.5" onClick={async () => {
                    await onComplete?.();
                    onContinue?.();
                  }}>
                    <FileText className="w-4 h-4" /> Continue to Repair System Review
                  </Button>
                )}
              </>
            )}
            {!summaryText && !generating && !genError && null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}