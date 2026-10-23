import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Wrench, CheckCircle2, XCircle, AlertTriangle, Loader2, ShieldAlert,
  Camera, Ruler, FileText, ChevronDown, ChevronUp, ArrowLeft, Bug,
} from 'lucide-react';
import { safeParse } from '@/lib/workflowEngine';
import { useDeveloperMode } from '@/hooks/useDeveloperMode';

const SEVERITY_STYLES = {
  info: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Info' },
  minor: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Minor' },
  moderate: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Moderate' },
  major: { bg: 'bg-red-100', text: 'text-red-700', label: 'Major' },
  critical: { bg: 'bg-red-200', text: 'text-red-800', label: 'Critical' },
};

const TIER_STYLES = {
  good: 'bg-green-100 text-green-700',
  better: 'bg-blue-100 text-blue-700',
  best: 'bg-purple-100 text-purple-700',
  standalone: 'bg-gray-100 text-gray-700',
};

function ConfidenceBadge({ score }) {
  const level = score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low';
  const color = level === 'high' ? 'bg-green-100 text-green-700' : level === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return <Badge className={`${color} text-[10px]`}>{score}% {level}</Badge>;
}

function RepairSystemCard({ rec, onAccept, onRemove, onModify, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedTier, setSelectedTier] = useState(rec.selected_option_tier || 'none');
  const options = safeParse(rec.good_better_best_options, []);
  const findingsDetail = safeParse(rec.related_findings_detail, []);
  const measurements = safeParse(rec.related_measurements, {});
  const measurementKeys = Object.keys(measurements);
  const photos = rec.related_photos || [];
  const sev = SEVERITY_STYLES[rec.severity] || SEVERITY_STYLES.info;

  const handleSelectTier = async (tier) => {
    const newTier = selectedTier === tier ? 'none' : tier;
    setSelectedTier(newTier);
    onUpdate?.(rec.id, { selected_option_tier: newTier });
  };

  const handleAccept = () => onAccept(rec);
  const handleRemove = () => onRemove(rec);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`${sev.bg} ${sev.text} text-[10px]`}>{sev.label}</Badge>
              <Badge variant="outline" className="text-[10px] capitalize">{rec.repair_system_type}</Badge>
              {rec.safety_concern && <Badge variant="destructive" className="text-[10px]">Safety</Badge>}
              <ConfidenceBadge score={rec.confidence_score || 0} />
            </div>
            <h3 className="text-sm font-semibold mt-1.5">{rec.recommendation_title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{rec.recommendation_summary}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {rec.estimate_status === 'accepted' && <Badge className="bg-green-100 text-green-700 text-[10px]"><CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />Accepted</Badge>}
            {rec.estimate_status === 'removed' && <Badge variant="outline" className="text-[10px] text-muted-foreground"><XCircle className="w-2.5 h-2.5 mr-0.5" />Removed</Badge>}
          </div>
        </div>

        {rec.confidence_reason && (
          <p className="text-[10px] text-muted-foreground italic">Confidence: {rec.confidence_reason}</p>
        )}

        <div className="flex gap-1.5 pt-1">
          <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700 flex-1"
            onClick={handleAccept}
            disabled={rec.estimate_status === 'accepted'}>
            <CheckCircle2 className="w-3.5 h-3.5" /> Accept
          </Button>
          <Button size="sm" variant="outline" className="gap-1 flex-1"
            onClick={handleAccept}
            disabled={rec.estimate_status === 'accepted'}>
            <FileText className="w-3.5 h-3.5" /> Modify
          </Button>
          <Button size="sm" variant="outline" className="gap-1 border-red-300 text-red-600 hover:bg-red-50"
            onClick={handleRemove}
            disabled={rec.estimate_status === 'removed'}>
            <XCircle className="w-3.5 h-3.5" /> Remove
          </Button>
        </div>

        <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setExpanded(e => !e)}>
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Hide' : 'Show'} details
        </button>
      </div>

      {expanded && (
        <div className="border-t bg-muted/20 p-4 space-y-4">
          {options.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Good / Better / Best Options</p>
              <div className="grid gap-2">
                {options.map((opt, i) => {
                  const isSelected = selectedTier === opt.tier;
                  return (
                    <div key={i}
                      className={`rounded-lg border p-3 cursor-pointer transition-all ${isSelected ? 'border-accent bg-accent/5' : 'hover:border-muted-foreground/30'}`}
                      onClick={() => handleSelectTier(opt.tier)}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge className={`${TIER_STYLES[opt.tier] || TIER_STYLES.standalone} text-[10px] capitalize`}>{opt.tier}</Badge>
                          <span className="text-sm font-medium">{opt.label}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold">${(opt.line_total || 0).toFixed(2)}</p>
                          <p className="text-[10px] text-muted-foreground">{opt.quantity || 1} {opt.unit || 'ea'} × ${(opt.unit_price || 0).toFixed(2)}</p>
                        </div>
                      </div>
                      {opt.customer_description && (
                        <p className="text-xs text-muted-foreground mt-1.5">{opt.customer_description}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {findingsDetail.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supporting Findings ({findingsDetail.length})</p>
              <div className="space-y-1.5">
                {findingsDetail.map((f, i) => {
                  const fSev = SEVERITY_STYLES[f.severity] || SEVERITY_STYLES.info;
                  return (
                    <div key={i} className="rounded-lg border p-2.5 text-sm space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`${fSev.bg} ${fSev.text} text-[10px]`}>{fSev.label}</Badge>
                        <span className="font-medium">{f.deficiency_type || 'Finding'}</span>
                        {f.source === 'legacy' && <Badge variant="outline" className="text-[9px]">Legacy</Badge>}
                        {f.safety_concern && <Badge variant="destructive" className="text-[10px]">Safety</Badge>}
                        {f.nfpa_code_failure && <Badge className="bg-red-200 text-red-800 text-[10px]">NFPA</Badge>}
                      </div>
                      {f.finding_location && <p className="text-xs text-muted-foreground">📍 {f.finding_location}</p>}
                      {f.customer_facing_explanation && <p className="text-xs text-muted-foreground">{f.customer_facing_explanation}</p>}
                      {f.recommended_repair && <p className="text-xs text-amber-700">→ {f.recommended_repair}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {photos.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Camera className="w-3 h-3" /> Photos ({photos.length})
              </p>
              <div className="grid grid-cols-5 gap-1.5">
                {photos.map((url, i) => (
                  <img key={i} src={url} alt={`Photo ${i + 1}`} className="w-full h-16 object-cover rounded" />
                ))}
              </div>
            </div>
          )}

          {measurementKeys.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Ruler className="w-3 h-3" /> Measurements
              </p>
              <div className="flex gap-3 text-xs flex-wrap">
                {measurementKeys.map(k => <span key={k} className="text-muted-foreground">{k}: <strong>{measurements[k]}</strong></span>)}
              </div>
            </div>
          )}

          {rec.code_nfpa_references && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Code / NFPA References</p>
              <p className="text-xs text-muted-foreground">{rec.code_nfpa_references}</p>
            </div>
          )}

          {rec.customer_facing_explanation && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer Explanation</p>
              <p className="text-xs text-muted-foreground">{rec.customer_facing_explanation}</p>
            </div>
          )}

          {rec.internal_technician_notes && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Internal Notes</p>
              <p className="text-xs text-amber-700">{rec.internal_technician_notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NoRecommendationsView({ diagnostic, findings, legacyFindings, onCompleteNoRecs, onReturnToInspection, onClose, onGenerate, generating }) {
  const totalFindings = (findings?.length || 0) + (legacyFindings?.length || 0);
  const excludedCount = diagnostic?.excluded_findings_count || 0;
  const hasFindings = totalFindings > 0;

  return (
    <div className="space-y-4">
      {/* Critical finding warnings */}
      {diagnostic?.critical_mapping_warnings?.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-800">
            <ShieldAlert className="w-5 h-5" />
            <p className="font-medium text-sm">Critical finding has no repair recommendation mapping.</p>
          </div>
          <div className="space-y-1 ml-7">
            {diagnostic.critical_mapping_warnings.map((w, i) => (
              <p key={i} className="text-xs text-red-700">
                • {w.deficiency_type} [{w.severity}] — {w.finding_location || 'No location'} {w.source === 'legacy' && '(Legacy)'}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Diagnostic reasons when findings exist but no recs */}
      {hasFindings && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle className="w-5 h-5" />
            <p className="font-medium text-sm">
              {excludedCount > 0
                ? `${totalFindings} finding${totalFindings !== 1 ? 's' : ''} found, but ${excludedCount} excluded — no eligible deficiencies remain.`
                : `${totalFindings} finding${totalFindings !== 1 ? 's' : ''} found, but no repair recommendations were generated.`}
            </p>
          </div>
          <p className="text-xs text-amber-700 ml-7">Diagnostic reasons below explain why each finding was excluded or did not produce a recommendation:</p>

          {/* Exclusion reasons */}
          {diagnostic?.excluded_findings?.length > 0 ? (
            <div className="space-y-1.5 ml-7">
              {diagnostic.excluded_findings.map((f, i) => (
                <div key={i} className="rounded border border-amber-200 bg-white/60 p-2 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`${(SEVERITY_STYLES[f.severity] || SEVERITY_STYLES.info).bg} ${(SEVERITY_STYLES[f.severity] || SEVERITY_STYLES.info).text} text-[9px]`}>
                      {f.severity}
                    </Badge>
                    <span className="font-medium">{f.deficiency_type}</span>
                    {f.source === 'legacy' && <Badge variant="outline" className="text-[9px]">Legacy</Badge>}
                  </div>
                  {f.finding_location && <p className="text-muted-foreground mt-0.5">📍 {f.finding_location}</p>}
                  <ul className="mt-1 space-y-0.5 text-amber-700">
                    {f.exclusion_reasons.map((r, j) => <li key={j}>→ {r}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          ) : diagnostic?.ungrouped_reasons?.length > 0 ? (
            <div className="space-y-1.5 ml-7">
              <p className="text-xs font-medium text-amber-700">Findings with no matching repair system:</p>
              {diagnostic.ungrouped_reasons.map((u, i) => (
                <div key={i} className="rounded border border-amber-200 bg-white/60 p-2 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`${(SEVERITY_STYLES[u.severity] || SEVERITY_STYLES.info).bg} ${(SEVERITY_STYLES[u.severity] || SEVERITY_STYLES.info).text} text-[9px]`}>
                      {u.severity}
                    </Badge>
                    <span className="font-medium">{u.deficiency_type}</span>
                  </div>
                  <p className="text-amber-700 mt-0.5">→ {u.reason}</p>
                  <p className="text-muted-foreground mt-0.5">Pricebook mapping: {u.has_mapping ? 'Yes' : 'No'}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-amber-700 ml-7 italic">
              Click "Generate Repair Recommendations" to run the engine and see detailed diagnostics.
            </p>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 text-center">
        <CheckCircle2 className="w-10 h-10 text-blue-500 mx-auto mb-3" />
        <p className="text-base font-medium text-blue-900">No repair recommendations were generated from this inspection.</p>
        <p className="text-sm text-blue-700 mt-1.5">
          {hasFindings
            ? 'Review the diagnostic above. You can regenerate after addressing the exclusion reasons, or mark this review complete with no recommendations.'
            : 'The inspection findings did not produce any repair system recommendations. You can mark this review as complete with no recommendations.'}
        </p>
        <div className="flex flex-col gap-2 mt-5 max-w-xs mx-auto">
          {hasFindings && (
            <Button className="gap-1.5" onClick={onGenerate} disabled={generating}>
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
              Generate Repair Recommendations
            </Button>
          )}
          <Button className="gap-1.5 bg-green-600 hover:bg-green-700" onClick={onCompleteNoRecs}>
            <CheckCircle2 className="w-4 h-4" /> Mark Review Complete — No Recommendations
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={onReturnToInspection}>
            <ArrowLeft className="w-4 h-4" /> Return to Inspection Review
          </Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

function DeveloperDiagnosticPanel({ diagnostic, findings, legacyFindings }) {
  const [expanded, setExpanded] = useState(false);
  const allFindings = [...(findings || []), ...(legacyFindings || [])];

  return (
    <div className="rounded-lg border border-dashed border-purple-300 bg-purple-50/30 p-3 space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-medium text-purple-700 w-full"
      >
        <Bug className="w-4 h-4" />
        Developer Diagnostic: Repair System Engine Data Flow
        {expanded ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
      </button>
      {expanded && (
        <div className="space-y-2 text-xs text-purple-900">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded border p-2">
              <p className="font-medium">Findings loaded</p>
              <p className="text-lg font-bold">{diagnostic?.total_findings_loaded ?? allFindings.length}</p>
              {diagnostic && (
                <p className="text-[10px] text-muted-foreground">
                  {diagnostic.inspection_findings_count} IF + {diagnostic.legacy_findings_count} Legacy
                </p>
              )}
            </div>
            <div className="rounded border p-2">
              <p className="font-medium">Findings eligible</p>
              <p className="text-lg font-bold text-green-600">{diagnostic?.eligible_findings_count ?? '—'}</p>
            </div>
            <div className="rounded border p-2">
              <p className="font-medium">Findings excluded</p>
              <p className="text-lg font-bold text-red-600">{diagnostic?.excluded_findings_count ?? '—'}</p>
            </div>
            <div className="rounded border p-2">
              <p className="font-medium">Mappings searched</p>
              <p className="text-lg font-bold">{diagnostic?.mappings_searched ?? '—'}</p>
            </div>
            <div className="rounded border p-2">
              <p className="font-medium">Mappings matched</p>
              <p className="text-lg font-bold text-green-600">{diagnostic?.mappings_matched ?? '—'}</p>
            </div>
            <div className="rounded border p-2">
              <p className="font-medium">Recommendations created</p>
              <p className="text-lg font-bold text-blue-600">{diagnostic?.recommendations_created ?? '—'}</p>
            </div>
          </div>

          {diagnostic?.excluded_findings?.length > 0 && (
            <div className="rounded border border-red-300 bg-red-50 p-2">
              <p className="font-medium text-red-800">Excluded Findings ({diagnostic.excluded_findings.length}):</p>
              <ul className="mt-1 space-y-0.5">
                {diagnostic.excluded_findings.map((f, i) => (
                  <li key={i}>• {f.deficiency_type} [{f.severity}] {f.source === 'legacy' ? '(Legacy)' : ''} — {f.exclusion_reasons.join('; ')}</li>
                ))}
              </ul>
            </div>
          )}

          {diagnostic?.ungrouped_reasons?.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 p-2">
              <p className="font-medium text-amber-800">Ungrouped Findings (no repair system match):</p>
              <ul className="mt-1 space-y-0.5">
                {diagnostic.ungrouped_reasons.map((u, i) => (
                  <li key={i}>• {u.deficiency_type} [{u.severity}] — {u.reason} (mapping: {u.has_mapping ? 'yes' : 'no'})</li>
                ))}
              </ul>
            </div>
          )}

          {diagnostic?.mapping_search_detail && Object.keys(diagnostic.mapping_search_detail).length > 0 && (
            <div className="rounded border border-blue-300 bg-blue-50 p-2">
              <p className="font-medium text-blue-800">Mapping Search Detail:</p>
              <ul className="mt-1 space-y-0.5">
                {Object.entries(diagnostic.mapping_search_detail).map(([dt, info]) => (
                  <li key={dt}>• {dt}: {info.active_count} active, {info.inactive_count} inactive{info.inactive_mapping_inactive ? ' ⚠ all mappings inactive' : ''}</li>
                ))}
              </ul>
            </div>
          )}

          {diagnostic?.critical_mapping_warnings?.length > 0 && (
            <div className="rounded border border-red-400 bg-red-50 p-2">
              <p className="font-medium text-red-800">Critical Findings Without Mapping:</p>
              <ul className="mt-1 space-y-0.5">
                {diagnostic.critical_mapping_warnings.map((w, i) => (
                  <li key={i}>• {w.deficiency_type} [{w.severity}] — {w.finding_location || 'N/A'} {w.source === 'legacy' ? '(Legacy)' : ''}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded border p-2">
            <p className="font-medium">Data Source Alignment</p>
            <p className="text-[10px] mt-0.5">
              Repair System engine uses the same unified finding source as Inspection Review, AI Summary, and PDF Report:
              InspectionFinding + Finding (legacy) with field normalization (finding_type → deficiency_type, narrative_output → customer_facing_explanation, category → finding_location).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RepairSystemReviewDialog({
  open, onClose, onContinue, onCompleteNoRecs, onReturnToInspection, loading,
  repairRecs, jobId, onRefresh, findings, legacyFindings,
}) {
  const { isDevToolsVisible } = useDeveloperMode();
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [recs, setRecs] = useState(repairRecs || []);
  const [updatingId, setUpdatingId] = useState(null);
  const [diagnostic, setDiagnostic] = useState(null);
  const [estimateCreating, setEstimateCreating] = useState(false);
  const [estimateError, setEstimateError] = useState(null);
  const [estimateDiagnostic, setEstimateDiagnostic] = useState(null);
  const [createdEstimateId, setCreatedEstimateId] = useState(null);

  useEffect(() => {
    setRecs(repairRecs || []);
  }, [repairRecs]);

  const handleContinueToEstimate = useCallback(async () => {
    setEstimateCreating(true);
    setEstimateError(null);
    setEstimateDiagnostic(null);
    try {
      const response = await base44.functions.invoke('createDraftEstimateFromRecommendations', { job_id: jobId });
      if (response.data?.status === 'error') {
        setEstimateError(response.data.error || 'Failed to create draft estimate');
        setEstimateDiagnostic(response.data.diagnostic || null);
        setEstimateCreating(false);
        return;
      }
      setEstimateDiagnostic(response.data?.diagnostic || null);
      setCreatedEstimateId(response.data?.estimate_id || null);
      await onRefresh?.();
      await onContinue?.();
    } catch (e) {
      setEstimateError(e.message || 'Failed to create draft estimate');
      setEstimateDiagnostic(e.response?.data?.diagnostic || null);
    }
    setEstimateCreating(false);
  }, [jobId, onContinue, onRefresh]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const response = await base44.functions.invoke('generateRepairSystemRecommendations', { job_id: jobId });
      if (response.data?.error) {
        setGenError(response.data.error);
      } else {
        if (response.data?.diagnostic) setDiagnostic(response.data.diagnostic);
        if (response.data?.warnings?.critical_findings_without_mapping?.length > 0) {
          // Captured in diagnostic already
        }
        const fresh = await base44.entities.RepairSystemRecommendation.filter({ job_id: jobId }).catch(() => []);
        setRecs(fresh);
        onRefresh?.();
      }
    } catch (e) {
      setGenError(e.message || 'Failed to generate repair system recommendations');
    }
    setGenerating(false);
  }, [jobId, onRefresh]);

  const handleUpdateRec = useCallback(async (recId, updates) => {
    setUpdatingId(recId);
    try {
      await base44.entities.RepairSystemRecommendation.update(recId, updates);
      setRecs(prev => prev.map(r => r.id === recId ? { ...r, ...updates } : r));
      onRefresh?.();
    } catch (e) {
      console.error('Failed to update recommendation:', e);
    }
    setUpdatingId(null);
  }, [onRefresh]);

  const handleAccept = useCallback(async (rec) => {
    await handleUpdateRec(rec.id, { estimate_status: 'accepted' });
  }, [handleUpdateRec]);

  const handleRemove = useCallback(async (rec) => {
    await handleUpdateRec(rec.id, { estimate_status: 'removed' });
  }, [handleUpdateRec]);

  const pendingRecs = recs.filter(r => r.estimate_status === 'pending');
  const acceptedRecs = recs.filter(r => r.estimate_status === 'accepted');
  const removedRecs = recs.filter(r => r.estimate_status === 'removed');

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-accent" /> Repair System Review
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4 max-h-[65vh]">
          {loading || generating ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
              <p className="text-sm text-muted-foreground">
                {generating ? 'Generating repair system recommendations...' : 'Loading...'}
              </p>
            </div>
          ) : genError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-red-800">
                <AlertTriangle className="w-5 h-5" />
                <p className="font-medium">Generation Failed</p>
              </div>
              <p className="text-sm text-red-700">{genError}</p>
              <Button size="sm" variant="outline" onClick={handleGenerate} className="mt-2">Retry Generation</Button>
            </div>
          ) : recs.length === 0 ? (
            <div className="space-y-4">
              <NoRecommendationsView
                diagnostic={diagnostic}
                findings={findings}
                legacyFindings={legacyFindings}
                onCompleteNoRecs={onCompleteNoRecs}
                onReturnToInspection={onReturnToInspection}
                onClose={onClose}
                onGenerate={handleGenerate}
                generating={generating}
              />
              {isDevToolsVisible && (
                <DeveloperDiagnosticPanel
                  diagnostic={diagnostic}
                  findings={findings}
                  legacyFindings={legacyFindings}
                />
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Critical finding warnings (even when recs exist) */}
              {diagnostic?.critical_mapping_warnings?.length > 0 && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3">
                  <div className="flex items-center gap-2 text-red-800">
                    <ShieldAlert className="w-4 h-4" />
                    <p className="font-medium text-sm">Critical finding has no repair recommendation mapping.</p>
                  </div>
                  <div className="space-y-0.5 ml-6 mt-1">
                    {diagnostic.critical_mapping_warnings.map((w, i) => (
                      <p key={i} className="text-xs text-red-700">• {w.deficiency_type} [{w.severity}] — {w.finding_location || 'No location'}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary bar */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{pendingRecs.length} pending</span>
                <span className="text-green-600">{acceptedRecs.length} accepted</span>
                <span className="text-muted-foreground">{removedRecs.length} removed</span>
              </div>

              {/* Repair system cards */}
              <div className="space-y-3">
                {pendingRecs.map(rec => (
                  <RepairSystemCard
                    key={rec.id}
                    rec={rec}
                    onAccept={handleAccept}
                    onRemove={handleRemove}
                    onUpdate={handleUpdateRec}
                  />
                ))}
              </div>

              {/* Accepted (collapsed) */}
              {acceptedRecs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-green-700">Accepted ({acceptedRecs.length})</p>
                  {acceptedRecs.map(rec => (
                    <div key={rec.id} className="rounded-lg border border-green-200 bg-green-50/50 p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{rec.recommendation_title}</p>
                        <p className="text-xs text-muted-foreground capitalize">{rec.repair_system_type}</p>
                      </div>
                      <Badge className="bg-green-100 text-green-700 text-[10px]">Accepted</Badge>
                    </div>
                  ))}
                </div>
              )}

              {/* Removed (collapsed) */}
              {removedRecs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Removed ({removedRecs.length})</p>
                  {removedRecs.map(rec => (
                    <div key={rec.id} className="rounded-lg border p-3 flex items-center justify-between opacity-60">
                      <div>
                        <p className="text-sm font-medium">{rec.recommendation_title}</p>
                        <p className="text-xs text-muted-foreground capitalize">{rec.repair_system_type}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">Removed</Badge>
                    </div>
                  ))}
                </div>
              )}

              {/* Developer diagnostic panel */}
              {isDevToolsVisible && (
                <DeveloperDiagnosticPanel
                  diagnostic={diagnostic}
                  findings={findings}
                  legacyFindings={legacyFindings}
                />
              )}
            </div>
          )}
        </ScrollArea>

        {estimateError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="w-5 h-5" />
              <p className="font-medium text-sm">Draft Estimate Creation Failed</p>
            </div>
            <p className="text-xs text-red-700">{estimateError}</p>
            {estimateDiagnostic?.errors?.length > 0 && (
              <div className="space-y-0.5 mt-1">
                {estimateDiagnostic.errors.map((err, i) => (
                  <p key={i} className="text-xs text-red-600">• {err}</p>
                ))}
              </div>
            )}
            <Button size="sm" variant="outline" onClick={handleContinueToEstimate} className="mt-2">Retry Estimate Creation</Button>
          </div>
        )}

        {isDevToolsVisible && estimateDiagnostic && (
          <div className="rounded-lg border border-dashed border-purple-300 bg-purple-50/30 p-3 space-y-2">
            <p className="text-xs font-medium text-purple-700 flex items-center gap-1"><Bug className="w-4 h-4" /> Developer Diagnostic: Estimate Creation Flow</p>
            <div className="grid grid-cols-3 gap-2 text-xs text-purple-900">
              <div className="rounded border p-2">
                <p className="font-medium">Accepted recs</p>
                <p className="text-lg font-bold">{estimateDiagnostic.accepted_recommendations_count ?? '—'}</p>
              </div>
              <div className="rounded border p-2">
                <p className="font-medium">Missing pricebook</p>
                <p className="text-lg font-bold text-amber-600">{estimateDiagnostic.recommendations_missing_pricebook_mapping?.length ?? 0}</p>
              </div>
              <div className="rounded border p-2">
                <p className="font-medium">Links updated</p>
                <p className="text-lg font-bold text-green-600">{estimateDiagnostic.links_updated ?? '—'}</p>
              </div>
            </div>
            {estimateDiagnostic.created_estimate_id && (
              <p className="text-xs text-green-700">✓ Created Estimate ID: <code className="bg-white px-1 rounded">{estimateDiagnostic.created_estimate_id}</code></p>
            )}
            {estimateDiagnostic.existing_estimate_found && (
              <p className="text-xs text-blue-700">ℹ Existing draft estimate found — recommendations linked to it.</p>
            )}
            {estimateDiagnostic.estimate_payload && (
              <div className="text-xs">
                <p className="font-medium">Estimate Payload:</p>
                <pre className="bg-white rounded p-2 overflow-x-auto text-[10px]">{JSON.stringify(estimateDiagnostic.estimate_payload, null, 2)}</pre>
              </div>
            )}
            {estimateDiagnostic.estimate_create_response && (
              <div className="text-xs">
                <p className="font-medium">Create Response:</p>
                <pre className="bg-white rounded p-2 overflow-x-auto text-[10px]">{JSON.stringify(estimateDiagnostic.estimate_create_response, null, 2)}</pre>
              </div>
            )}
            {estimateDiagnostic.workflow_link_update_result && (
              <div className="text-xs">
                <p className="font-medium">Workflow Link Update:</p>
                <pre className="bg-white rounded p-2 overflow-x-auto text-[10px]">{typeof estimateDiagnostic.workflow_link_update_result === 'string'
                  ? `"${estimateDiagnostic.workflow_link_update_result}"`
                  : JSON.stringify(estimateDiagnostic.workflow_link_update_result, null, 2)}</pre>
              </div>
            )}
            {estimateDiagnostic.recommendations_missing_pricebook_mapping?.length > 0 && (
              <div className="text-xs rounded border border-amber-300 bg-amber-50 p-2">
                <p className="font-medium text-amber-800">Recommendations Missing Pricebook Mapping ({estimateDiagnostic.recommendations_missing_pricebook_mapping.length}):</p>
                <ul className="mt-1 space-y-0.5">
                  {estimateDiagnostic.recommendations_missing_pricebook_mapping.map((m, i) => (
                    <li key={i}>• {m.recommendation_title} — {m.reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="border-t pt-4 flex items-center justify-between">
          <Button variant="outline" onClick={onClose} disabled={estimateCreating}>Close</Button>
          {recs.length > 0 && (
            <div className="flex gap-2">
              <Button variant="outline" className="gap-1.5" onClick={handleGenerate} disabled={generating || estimateCreating}>
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                Regenerate
              </Button>
              <Button className="gap-1.5" onClick={handleContinueToEstimate} disabled={loading || generating || estimateCreating || acceptedRecs.length === 0}>
                {estimateCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {estimateCreating ? 'Creating Draft Estimate...' : 'Continue to Estimate Review'}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}