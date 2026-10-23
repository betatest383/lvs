import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
// ScrollArea replaced with native overflow-y-auto for reliable touch + mouse wheel scrolling
import {
  CheckCircle2, AlertTriangle, ShieldAlert, Camera, Ruler, FileText,
  Wrench, DollarSign, ArrowRight, Loader2, XCircle, ChevronDown, ChevronRight, Bug
} from 'lucide-react';
import { safeParse } from '@/lib/workflowEngine';
import { getMissingPhotosForSubmissions } from '@/lib/photoValidation';
import { useDeveloperMode } from '@/hooks/useDeveloperMode';

const CRITICAL_RESPONSES = [
  'unsafe', 'failed', 'deficient', 'needs repair', 'water damage',
  'cracked', 'improper installation', 'immediate attention required',
];

function isCritical(val) {
  if (!val) return false;
  const v = String(val).toLowerCase().trim();
  return CRITICAL_RESPONSES.some(c => v === c || v.includes(c));
}

function severityColor(sev) {
  const map = {
    critical: 'bg-red-100 text-red-700',
    major: 'bg-orange-100 text-orange-700',
    moderate: 'bg-amber-100 text-amber-700',
    minor: 'bg-yellow-100 text-yellow-700',
    info: 'bg-blue-100 text-blue-700',
  };
  return map[sev] || 'bg-muted text-muted-foreground';
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="rounded-lg border p-3 flex items-center gap-2.5">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color || 'bg-muted'}`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div>
        <p className="text-lg font-bold leading-none">{value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function statusBadge(status) {
  const map = {
    completed: { label: 'Complete', class: 'bg-green-100 text-green-700' },
    needs_lead_review: { label: 'Needs Review', class: 'bg-purple-100 text-purple-700' },
    in_progress: { label: 'In Progress', class: 'bg-amber-100 text-amber-700' },
    available: { label: 'Available', class: 'bg-blue-100 text-blue-700' },
    skipped: { label: 'Skipped', class: 'bg-gray-100 text-gray-500' },
    locked: { label: 'Locked', class: 'bg-gray-100 text-gray-400' },
  };
  const s = map[status] || { label: status || '—', class: 'bg-muted text-muted-foreground' };
  return <Badge className={`${s.class} text-[10px]`}>{s.label}</Badge>;
}

function FindingCard({ finding, source }) {
  const [expanded, setExpanded] = useState(false);
  const photos = finding.photo_urls || finding.photos_internal_only || [];
  const measurements = safeParse(finding.measurements, null);
  const hasMeasurements = measurements && Object.keys(measurements).length > 0;

  const isLegacy = source === 'legacy';
  const findingType = finding.deficiency_type || finding.finding_type || 'Unknown';
  const severity = finding.severity || 'moderate';
  const location = finding.finding_location || finding.category || '—';
  const narrative = finding.customer_facing_explanation || finding.narrative_output || finding.recommended_repair || '';
  const ruleId = finding.triggered_by_rule || '';

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${finding.nfpa_code_failure || finding.nfpa_code_failure ? 'border-red-300 bg-red-50/50' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium">{findingType}</p>
            <Badge className={`text-[10px] ${severityColor(severity)}`}>{severity}</Badge>
            {source === 'legacy' && <Badge variant="outline" className="text-[10px]">Rule-Generated</Badge>}
            {finding.is_deficiency === false && <Badge variant="outline" className="text-[10px]">Observation</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Location: {location}</p>
        </div>
        {(photos.length > 0 || narrative || hasMeasurements || ruleId) && (
          <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground shrink-0">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        )}
      </div>

      {(finding.nfpa_code_failure || finding.safety_concern) && (
        <div className="flex items-center gap-2 flex-wrap">
          {finding.nfpa_code_failure && <Badge className="bg-red-600 text-white text-[10px]">NFPA / Code Failure</Badge>}
          {finding.safety_concern && <Badge className="bg-amber-500 text-white text-[10px]">Safety Concern</Badge>}
        </div>
      )}

      {expanded && (
        <div className="space-y-2 pt-1 border-t">
          {narrative && <p className="text-xs text-muted-foreground">{narrative}</p>}
          {hasMeasurements && (
            <div className="text-xs">
              <p className="font-medium text-muted-foreground">Measurements:</p>
              <ul className="ml-3 list-disc">
                {Object.entries(measurements).map(([k, v]) => <li key={k}>{k}: {String(v)}</li>)}
              </ul>
            </div>
          )}
          {photos.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {photos.slice(0, 6).map((url, i) => (
                <img key={i} src={url} alt={`Finding ${i + 1}`} className="w-16 h-16 object-cover rounded-md border" />
              ))}
            </div>
          )}
          {ruleId && <p className="text-[10px] text-muted-foreground">Created by rule: {ruleId}</p>}
        </div>
      )}
    </div>
  );
}

function CriticalAnswerCard({ questionText, answer, photos }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 space-y-1">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
        <p className="text-sm font-medium text-red-900">{questionText}</p>
      </div>
      <p className="text-xs text-red-700 ml-6">Response: {String(answer)}</p>
      {photos && photos.length > 0 && (
        <div className="flex gap-1 ml-6">
          {photos.slice(0, 4).map((url, i) => (
            <img key={i} src={url} alt={`Evidence ${i + 1}`} className="w-12 h-12 object-cover rounded border" />
          ))}
        </div>
      )}
    </div>
  );
}

export default function InspectionSummaryDialog({
  open, onClose, onContinue, loading,
  inspectionSetup, submissions, findings, legacyFindings, repairRecs, estimate,
  selectedModules, stages, allQuestions,
}) {
  const { isDevToolsVisible } = useDeveloperMode();
  const [showDevPanel, setShowDevPanel] = useState(false);

  // Derive critical conditions from raw answers — same logic as PDF report
  const mergedAnswers = useMemo(() => {
    const answers = {};
    for (const sub of (submissions || [])) {
      const subAnswers = safeParse(sub.answers, {});
      for (const [key, val] of Object.entries(subAnswers)) {
        const existingEmpty = answers[key] === undefined || answers[key] === null || answers[key] === '';
        const incomingEmpty = val === undefined || val === null || val === '';
        if (existingEmpty && !incomingEmpty) {
          answers[key] = val;
        } else if (!existingEmpty && !incomingEmpty) {
          if (key.endsWith('_photos') && Array.isArray(answers[key]) && Array.isArray(val)) {
            const merged = [...answers[key]];
            for (const url of val) { if (!merged.includes(url)) merged.push(url); }
            answers[key] = merged;
          }
        }
      }
    }
    return answers;
  }, [submissions]);

  const questionMap = useMemo(() => {
    const map = {};
    for (const q of (allQuestions || [])) map[q.id] = q;
    return map;
  }, [allQuestions]);

  const derivedCriticalConditions = useMemo(() => {
    const conditions = [];
    for (const [key, val] of Object.entries(mergedAnswers)) {
      if (key.endsWith('_photos')) continue;
      const vals = Array.isArray(val) ? val : [val];
      if (vals.some(v => isCritical(v))) {
        const q = questionMap[key];
        const photos = mergedAnswers[`${key}_photos`] || [];
        conditions.push({
          questionId: key,
          questionText: q?.question_text || `Question ${key}`,
          answer: vals.join(', '),
          photos,
        });
      }
    }
    return conditions;
  }, [mergedAnswers, questionMap]);

  if (!open) return null;

  const interiorSubmission = submissions?.find(s => s.inspection_type === 'interior');
  const exteriorSubmission = submissions?.find(s => s.inspection_type === 'exterior');
  const interiorStatus = stages?.interior_inspection?.status;
  const exteriorStatus = stages?.exterior_inspection?.status;

  const missingPhotoGroups = allQuestions
    ? getMissingPhotosForSubmissions(submissions || [], allQuestions)
    : [];
  const totalMissingPhotos = missingPhotoGroups.reduce((sum, g) => sum + g.missingItems.length, 0);

  const totalPhotos = (submissions || []).reduce((sum, s) => sum + (s.photos?.length || 0), 0)
    + (findings || []).reduce((sum, f) => sum + (f.photo_urls?.length || 0), 0);

  const totalMeasurements = (findings || []).filter(f => {
    const m = safeParse(f.measurements, null);
    return m && Object.keys(m).length > 0;
  }).length;

  const allFindings = [...(findings || []), ...(legacyFindings || [])];
  const deficiencies = allFindings.filter(f => f.is_deficiency !== false);
  const nfpaFailures = allFindings.filter(f => f.nfpa_code_failure).length;
  const safetyConcerns = allFindings.filter(f => f.safety_concern).length;
  const criticalFindings = allFindings.filter(f => f.severity === 'critical' || f.severity === 'major');

  const hasCriticalData = criticalFindings.length > 0 || derivedCriticalConditions.length > 0;
  const hasZeroDeficiencies = deficiencies.length === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-accent" /> Inspection Summary
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 pr-4 max-h-[60vh] overflow-y-auto -webkit-overflow-scrolling-touch">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Validation Warning: Critical data exists but no deficiencies shown */}
              {hasCriticalData && hasZeroDeficiencies && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-red-800">
                    <ShieldAlert className="w-5 h-5" />
                    <p className="font-medium">Critical findings exist but are not displayed in Inspection Review.</p>
                  </div>
                  <p className="text-xs text-red-700">
                    {criticalFindings.length} critical/major finding(s) and {derivedCriticalConditions.length} critical answer(s) detected, but zero deficiencies are registered.
                    Review the findings below before proceeding.
                  </p>
                </div>
              )}

              {/* Setup Data */}
              {inspectionSetup && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
                  <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Inspection Setup</p>
                  <p>Level: <span className="font-medium">{inspectionSetup.inspection_level?.replace(/_/g, ' ').toUpperCase() || 'N/A'}</span></p>
                  <p>Modules: <span className="font-medium">{(selectedModules || []).join(', ') || 'None'}</span></p>
                  {inspectionSetup.customer_concerns && <p>Concerns: {inspectionSetup.customer_concerns}</p>}
                </div>
              )}

              {/* Module Status */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">Interior</span>
                    {statusBadge(interiorStatus)}
                  </div>
                  {interiorSubmission && (
                    <p className="text-xs text-muted-foreground">
                      {interiorSubmission.photos?.length || 0} photos · {interiorSubmission.technician_name || '—'}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">Exterior</span>
                    {statusBadge(exteriorStatus)}
                  </div>
                  {exteriorSubmission && (
                    <p className="text-xs text-muted-foreground">
                      {exteriorSubmission.photos?.length || 0} photos · {exteriorSubmission.technician_name || '—'}
                    </p>
                  )}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2">
                <StatCard icon={ShieldAlert} label="Total Findings" value={allFindings.length} color="bg-orange-500" />
                <StatCard icon={AlertTriangle} label="Deficiencies" value={deficiencies.length} color="bg-red-500" />
                <StatCard icon={Camera} label="Photos" value={totalPhotos} color="bg-blue-500" />
                <StatCard icon={Ruler} label="Measurements" value={totalMeasurements} color="bg-indigo-500" />
                <StatCard icon={AlertTriangle} label="NFPA Failures" value={nfpaFailures} color="bg-red-600" />
                <StatCard icon={ShieldAlert} label="Safety Concerns" value={safetyConcerns} color="bg-amber-500" />
              </div>

              {/* Downstream */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border p-3 text-sm flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Repair Systems</p>
                    <p className="font-medium">{(repairRecs || []).length} generated</p>
                  </div>
                </div>
                <div className="rounded-lg border p-3 text-sm flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Estimate</p>
                    <p className="font-medium">{estimate ? 'Available' : 'Not yet'}</p>
                  </div>
                </div>
              </div>

              {/* Missing Required Photos Warning */}
              {totalMissingPhotos > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-red-800">
                    <XCircle className="w-5 h-5" />
                    <p className="font-medium">{totalMissingPhotos} Required Photo(s) Missing</p>
                  </div>
                  <p className="text-xs text-red-700">
                    The following required photos were not uploaded during inspection. These must be resolved before completing the appointment.
                  </p>
                  <div className="space-y-1.5">
                    {missingPhotoGroups.map((group, gi) => (
                      <div key={gi} className="rounded-lg bg-white/60 border border-red-100 p-2 space-y-1">
                        <p className="text-xs font-medium text-red-900 capitalize">
                          {group.submission.inspection_type} Module
                        </p>
                        {group.missingItems.map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-xs text-red-700">
                            <span className="flex-1">{item.questionText}</span>
                            <Badge variant="destructive" className="text-[10px] ml-2">{item.current}/{item.required}</Badge>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Individual Findings List */}
              {allFindings.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-500" />
                    Findings & Deficiencies ({allFindings.length})
                  </p>
                  {allFindings.map((f, i) => (
                    <FindingCard key={f.id || i} finding={f} source={f.triggered_by_rule ? 'legacy' : 'inspection'} />
                  ))}
                </div>
              )}

              {/* Derived Critical Conditions from Answers (same logic as PDF) */}
              {derivedCriticalConditions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium flex items-center gap-2 text-red-700">
                    <ShieldAlert className="w-4 h-4" />
                    Critical Conditions from Answers ({derivedCriticalConditions.length})
                  </p>
                  <p className="text-xs text-muted-foreground">
                    These critical responses were detected from inspection answers and appear on the PDF report.
                  </p>
                  {derivedCriticalConditions.map((c, i) => (
                    <CriticalAnswerCard key={i} {...c} />
                  ))}
                </div>
              )}

              {/* No Findings Message */}
              {allFindings.length === 0 && derivedCriticalConditions.length === 0 && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
                  <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-green-800">No deficiencies found. Generate clean inspection summary.</p>
                </div>
              )}

              {/* Developer Diagnostic Panel */}
              {isDevToolsVisible && (
                <div className="rounded-lg border border-dashed border-purple-300 bg-purple-50/30 p-3 space-y-2">
                  <button
                    onClick={() => setShowDevPanel(!showDevPanel)}
                    className="flex items-center gap-2 text-xs font-medium text-purple-700 w-full"
                  >
                    <Bug className="w-4 h-4" />
                    Developer Diagnostic: Findings Data Flow
                    {showDevPanel ? <ChevronDown className="w-3 h-3 ml-auto" /> : <ChevronRight className="w-3 h-3 ml-auto" />}
                  </button>
                  {showDevPanel && (
                    <div className="space-y-2 text-xs text-purple-900">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded border p-2">
                          <p className="font-medium">InspectionFinding records</p>
                          <p className="text-lg font-bold">{(findings || []).length}</p>
                        </div>
                        <div className="rounded border p-2">
                          <p className="font-medium">Finding (legacy/rule) records</p>
                          <p className="text-lg font-bold">{(legacyFindings || []).length}</p>
                        </div>
                        <div className="rounded border p-2">
                          <p className="font-medium">Derived critical (from answers)</p>
                          <p className="text-lg font-bold">{derivedCriticalConditions.length}</p>
                        </div>
                        <div className="rounded border p-2">
                          <p className="font-medium">Displayed in Review</p>
                          <p className="text-lg font-bold">{allFindings.length + derivedCriticalConditions.length}</p>
                        </div>
                      </div>
                      <div className="rounded border p-2">
                        <p className="font-medium">PDF Report Source</p>
                        <p>Finding entity (by inspection_id) + isCritical() keyword match on answers</p>
                      </div>
                      <div className="rounded border p-2">
                        <p className="font-medium">Review Source</p>
                        <p>InspectionFinding + Finding entities (by job_id) + isCritical() keyword match on answers</p>
                      </div>
                      {(legacyFindings || []).length > 0 && (
                        <div className="rounded border border-amber-300 bg-amber-50 p-2">
                          <p className="font-medium text-amber-800">Rule-Generated Findings Detected</p>
                          <p>These findings were created by logic rules and stored in the Finding entity. They also appear on the PDF report.</p>
                          <ul className="mt-1 space-y-0.5">
                            {(legacyFindings || []).slice(0, 5).map((f, i) => (
                              <li key={i}>• {f.finding_type} [{f.severity}] — rule: {f.triggered_by_rule || 'N/A'}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button className="gap-1.5" onClick={onContinue} disabled={loading}>
            Continue to Repair System Review <ArrowRight className="w-4 h-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}