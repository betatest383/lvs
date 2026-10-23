import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Loader2, ChevronLeft, ChevronRight, CheckCircle2, Circle, AlertTriangle,
  ShieldAlert, Wrench, Eye, Activity, FileX, ShieldCheck, Flag, Lock,
  ClipboardCheck, Sparkles, Stethoscope,
} from 'lucide-react';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

const DISPOSITIONS = [
  { value: 'repair_recommended', label: 'Repair Recommended', estimateRequired: true, icon: Wrench, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { value: 'safety_concern', label: 'Safety Concern', estimateRequired: true, icon: ShieldAlert, color: 'text-red-600 bg-red-50 border-red-200' },
  { value: 'code_violation', label: 'Code Violation', estimateRequired: true, icon: FileX, color: 'text-orange-600 bg-orange-50 border-orange-200' },
  { value: 'monitor', label: 'Monitor', estimateRequired: false, icon: Eye, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { value: 'maintenance_only', label: 'Maintenance Only', estimateRequired: false, icon: Activity, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  { value: 'no_action_required', label: 'No Action Required', estimateRequired: false, icon: ShieldCheck, color: 'text-green-600 bg-green-50 border-green-200' },
];

const SEVERITY_STYLES = {
  info: 'bg-blue-100 text-blue-700',
  minor: 'bg-yellow-100 text-yellow-700',
  moderate: 'bg-orange-100 text-orange-700',
  major: 'bg-red-100 text-red-700',
  critical: 'bg-red-200 text-red-800',
};

function getDisposition(value) {
  return DISPOSITIONS.find(d => d.value === value);
}

export default function RecommendationReviewDialog({
  open, onClose, onComplete, onRefresh,
  jobId, findings, legacyFindings, inspectionSetup, appointments,
  effectiveEmail, effectiveName, isManager,
}) {
  const [review, setReview] = useState(null);
  const [items, setItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [error, setError] = useState(null);
  const [templateMatches, setTemplateMatches] = useState({});
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [materialCatalog, setMaterialCatalog] = useState([]);

  const [isDirty, setIsDirty] = useState(false);
  const skipDirtyRef = useRef(true);

  useEffect(() => {
    if (open) {
      skipDirtyRef.current = true;
      setIsDirty(false);
      const timer = setTimeout(() => { skipDirtyRef.current = false; }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Form state for current item — declared BEFORE the dirty-tracking useEffect
  // below so that effect's dependency array never references a temporal-dead-zone
  // binding. (Previously formData was declared after the useEffect that depends
  // on it, causing "Cannot access 'B' before initialization" on Job Hub load.)
  const [formData, setFormData] = useState({
    disposition: '',
    customer_summary: '',
    recommended_solution: '',
    pricebook_item_name: '',
    pricebook_item_id: '',
    materials: '',
    labor_hours: '',
    technician_notes: '',
  });

  useEffect(() => {
    if (!open || skipDirtyRef.current) return;
    setIsDirty(true);
  }, [formData, review, items]);

  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onClose());

  const allFindings = useMemo(() => [
    ...(findings || []).filter(f => f.is_deficiency !== false).map(f => ({ ...f, _findingType: 'InspectionFinding' })),
    ...(legacyFindings || []).map(f => ({ ...f, _findingType: 'Finding' })),
  ], [findings, legacyFindings]);

  const appointmentId = useMemo(() => {
    if (!appointments || appointments.length === 0) return '';
    const todayStr = new Date().toLocaleDateString('en-CA');
    return appointments.find(a => (a.scheduled_start || '').slice(0, 10) === todayStr)?.id
      || appointments[0]?.id || '';
  }, [appointments]);

  const prefetchTemplateMatches = useCallback(async (pendingItems) => {
    const matches = {};
    for (const item of pendingItems) {
      try {
        const response = await base44.functions.invoke('lookupRepairRecommendation', {
          inspection_section: item.interior_exterior || '',
          deficiency_type: item.deficiency_type || '',
          finding_title: item.title || '',
          finding_description: item.description || '',
          severity: item.severity || '',
        });
        if (response.data?.matched) {
          matches[item.id] = response.data;
        }
      } catch { /* non-blocking */ }
    }
    setTemplateMatches(matches);

    // Auto-prefill pending items from matched RepairRecommendationTemplates
    if (Object.keys(matches).length > 0) {
      setItems(prevItems => {
        const updated = [...prevItems];
        for (const item of updated) {
          if (item.status !== 'pending') continue;
          const match = matches[item.id];
          if (!match) continue;

          // Recommended solution fallback priority per spec:
          // 1. RepairRecommendationTemplate.recommended_solution
          // 2. RepairRecommendationTemplate.customer_summary
          // 3. RepairRecommendationTemplate.customer_facing_recommendation
          // 4. matched service customer description
          // 5. blank only if no template/service match exists
          const rc = match.recommendation_content || {};
          const sm = match.service_mapping || {};
          const resolvedSolution = rc.recommended_solution
            || rc.customer_summary
            || rc.customer_facing_recommendation
            || sm.customer_description
            || '';

          const prefillData = {
            disposition: rc.disposition_default || item.disposition || '',
            customer_summary: rc.customer_summary || rc.customer_facing_recommendation || item.customer_summary || '',
            recommended_solution: resolvedSolution || item.recommended_solution || '',
            pricebook_item_name: sm.service_name || item.pricebook_item_name || '',
            pricebook_item_id: sm.service_catalog_id || item.pricebook_item_id || '',
          };
          Object.assign(item, prefillData);
        }
        return updated;
      });
    }
  }, []);

  const loadReview = useCallback(async () => {
    if (!jobId || allFindings.length === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let reviews = await base44.entities.RecommendationReview.filter({ job_id: jobId });
      let rev = reviews[0];

      if (!rev) {
        rev = await base44.entities.RecommendationReview.create({
          job_id: jobId,
          appointment_id: appointmentId || '',
          inspection_id: inspectionSetup?.id || '',
          technician_email: effectiveEmail,
          technician_name: effectiveName,
          customer_name: inspectionSetup?.customer_name || '',
          status: 'in_progress',
          started_at: new Date().toISOString(),
          total_deficiencies: allFindings.length,
          reviewed_deficiencies: 0,
          estimate_required_count: 0,
          manager_override_used: false,
        });
      } else if (rev.status === 'not_started') {
        rev = await base44.entities.RecommendationReview.update(rev.id, {
          status: 'in_progress',
          started_at: rev.started_at || new Date().toISOString(),
          total_deficiencies: allFindings.length,
        });
      }
      setReview(rev);

      let existingItems = await base44.entities.RecommendationReviewItem.filter({
        recommendation_review_id: rev.id,
      });

      // Create items for findings that don't have one yet
      const existingFindingIds = new Set(existingItems.map(i => i.finding_id));
      const missingFindings = allFindings.filter(f => !existingFindingIds.has(f.id));

      if (missingFindings.length > 0) {
        const newItems = missingFindings.map((f, i) => {
          // Title fallback priority per spec:
          // 1. finding.title (finding_location) 2. deficiency.title (deficiency_type)
          // 3. failed_question_text 4. inspection_item.label
          // 5. inspection_section + " Deficiency" 6. "Inspection Deficiency"
          const section = f.interior_exterior || '';
          const sectionLabel = section ? section.charAt(0).toUpperCase() + section.slice(1) + ' Deficiency' : '';
          const resolvedTitle = f.finding_location
            || f.deficiency_type
            || f.failed_question
            || f.question_text
            || f.inspection_item_label
            || sectionLabel
            || 'Inspection Deficiency';

          return {
            recommendation_review_id: rev.id,
            appointment_id: appointmentId || '',
            inspection_id: inspectionSetup?.id || '',
            job_id: jobId,
            finding_id: f.id,
            finding_type: f._findingType,
            deficiency_type: f.deficiency_type || '',
            interior_exterior: f.interior_exterior || '',
            severity: f.severity || 'moderate',
            title: resolvedTitle,
            description: f.customer_facing_explanation || f.recommended_repair || '',
            photo_urls: f.photo_urls || [],
            source_title: f.finding_location || '',
            source_section: f.interior_exterior || '',
            source_failed_question: f.failed_question || f.question_text || '',
            source_description: f.customer_facing_explanation || f.recommended_repair || '',
            source_notes: f.internal_notes || f.technician_notes || '',
            source_photos: f.photo_urls || [],
            source_deficiency_type: f.deficiency_type || '',
            source_finding_id: f.id || '',
            source_inspection_item_id: f.inspection_item_id || f.question_id || '',
            status: 'pending',
            estimate_required: false,
          };
        });
        const created = await base44.entities.RecommendationReviewItem.bulkCreate(newItems);
        existingItems = [...existingItems, ...created];
      }

      // Sort items by created_date for consistent ordering
      existingItems.sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0));
      setItems(existingItems);

      // Set current index to first pending item
      const firstPending = existingItems.findIndex(i => i.status === 'pending');
      setCurrentIndex(firstPending >= 0 ? firstPending : 0);

      // Prefill pending items from matched RepairRecommendationTemplates
      const pendingItems = existingItems.filter(i => i.status === 'pending');
      if (pendingItems.length > 0) {
        prefetchTemplateMatches(pendingItems);
      }
    } catch (e) {
      console.error('RecommendationReview load error:', e);
      setError(e.message || 'Failed to load recommendation review');
    } finally {
      setLoading(false);
    }
  }, [jobId, allFindings, appointmentId, inspectionSetup, effectiveEmail, effectiveName]);

  useEffect(() => {
    if (open) {
      base44.entities.InventoryMaster.filter({}, 'item_name', 6000).then(setMaterialCatalog).catch(() => setMaterialCatalog([]));
      loadReview();
    } else {
      setReview(null);
      setItems([]);
      setCurrentIndex(0);
      setError(null);
    }
  }, [open]);

  // Sync form data when current item changes
  useEffect(() => {
    const item = items[currentIndex];
    if (!item) return;
    setFormData({
      disposition: item.disposition || '',
      customer_summary: item.customer_summary || '',
      recommended_solution: item.recommended_solution || '',
      pricebook_item_name: item.pricebook_item_name || '',
      pricebook_item_id: item.pricebook_item_id || '',
      materials: item.materials || '',
      labor_hours: item.labor_hours || '',
      technician_notes: item.technician_notes || '',
    });
  }, [currentIndex, items, templateMatches]);

  const currentItem = items[currentIndex];
  const reviewedCount = items.filter(i => i.status === 'reviewed').length;
  const estimateRequiredCount = items.filter(i => i.estimate_required).length;
  const allReviewed = items.length > 0 && reviewedCount === items.length;
  const progressPct = items.length > 0 ? Math.round((reviewedCount / items.length) * 100) : 0;

  const currentDisposition = getDisposition(formData.disposition);
  const estimateRequired = currentDisposition?.estimateRequired || false;

  const handleMarkReviewed = async () => {
    if (!currentItem || !review) return;

    // Validate required fields
    if (!formData.disposition) {
      setError('Please select a disposition before marking as reviewed.');
      return;
    }
    if (!formData.customer_summary?.trim()) {
      setError('Customer summary is required for every deficiency.');
      return;
    }
    if (estimateRequired && !formData.recommended_solution?.trim()) {
      setError('Recommended solution is required when an estimate is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updateData = {
        disposition: formData.disposition,
        customer_summary: formData.customer_summary,
        recommended_solution: formData.recommended_solution,
        pricebook_item_name: formData.pricebook_item_name,
        pricebook_item_id: formData.pricebook_item_id,
        materials: formData.materials,
        labor_hours: formData.labor_hours ? Number(formData.labor_hours) : null,
        technician_notes: formData.technician_notes,
        estimate_required: estimateRequired,
        status: 'reviewed',
        reviewed_at: new Date().toISOString(),
        reviewed_by: effectiveEmail,
      };

      const updated = await base44.entities.RecommendationReviewItem.update(currentItem.id, updateData);

      const newItems = [...items];
      newItems[currentIndex] = { ...updated };
      setItems(newItems);

      // Update review record counts
      const newReviewedCount = newItems.filter(i => i.status === 'reviewed').length;
      const newEstimateRequiredCount = newItems.filter(i => i.estimate_required).length;
      const updatedReview = await base44.entities.RecommendationReview.update(review.id, {
        reviewed_deficiencies: newReviewedCount,
        estimate_required_count: newEstimateRequiredCount,
      });
      setReview(updatedReview);

      // Move to next pending item
      const nextPending = newItems.findIndex((i, idx) => idx > currentIndex && i.status === 'pending');
      if (nextPending >= 0) {
        setCurrentIndex(nextPending);
      } else {
        const anyPending = newItems.findIndex(i => i.status === 'pending');
        if (anyPending >= 0) setCurrentIndex(anyPending);
      }
    } catch (e) {
      setError(e.message || 'Failed to save review item');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!review || !allReviewed) return;
    setCompleting(true);
    setError(null);
    try {
      const estimateRequiredItems = items.filter(i => i.estimate_required);

      // Create RepairSystemRecommendation records for estimate-required items (skip duplicates)
      if (estimateRequiredItems.length > 0) {
        const existingRecs = await base44.entities.RepairSystemRecommendation.filter({ job_id: jobId });
        const existingFindingIds = new Set();
        existingRecs.forEach(r => {
          try {
            const ids = JSON.parse(r.related_findings || '[]');
            ids.forEach(id => existingFindingIds.add(id));
          } catch { /* ignore parse errors */ }
        });
        const newItems = estimateRequiredItems.filter(item => !existingFindingIds.has(item.finding_id));
        const recs = newItems.map(item => ({
          job_id: jobId,
          inspection_id: inspectionSetup?.id || '',
          customer_id: inspectionSetup?.customer_id || '',
          customer_name: inspectionSetup?.customer_name || '',
          repair_system_type: 'other',
          recommendation_title: item.recommended_solution || item.title,
          recommendation_summary: item.customer_summary || '',
          related_findings: JSON.stringify([item.finding_id]),
          related_findings_detail: JSON.stringify([{
            id: item.finding_id,
            deficiency_type: item.deficiency_type,
            severity: item.severity,
            location: item.title,
            explanation: item.description,
          }]),
          related_photos: item.photo_urls || [],
          severity: item.severity,
          safety_concern: item.disposition === 'safety_concern',
          confidence_score: 100,
          confidence_reason: 'Manually reviewed by technician during Recommendation Review',
          customer_facing_explanation: item.customer_summary || '',
          internal_technician_notes: item.technician_notes || '',
          suggested_pricebook_items: item.pricebook_item_name
            ? JSON.stringify([{ name: item.pricebook_item_name, id: item.pricebook_item_id }])
            : '[]',
          good_better_best_options: JSON.stringify([{
            tier: 'standalone',
            label: item.recommended_solution || item.title,
            pricebook_item_name: item.pricebook_item_name || '',
            pricebook_item_id: item.pricebook_item_id || '',
            unit_price: 0,
            quantity: 1,
            unit: 'ea',
            line_total: 0,
            customer_description: item.customer_summary || '',
            selected: true,
          }]),
          selected_option_tier: 'standalone',
          estimate_status: 'accepted',
          created_by: effectiveEmail,
        }));
        if (recs.length > 0) {
          await base44.entities.RepairSystemRecommendation.bulkCreate(recs);
        }
      }

      // Mark review as complete
      const completed = await base44.entities.RecommendationReview.update(review.id, {
        status: 'complete',
        completed_at: new Date().toISOString(),
        reviewed_deficiencies: items.length,
        estimate_required_count: estimateRequiredItems.length,
      });
      setReview(completed);

      // Auto-build draft estimate from the completed recommendation review
      if (estimateRequiredItems.length > 0) {
        try {
          await base44.functions.invoke('autoBuildDraftEstimate', { job_id: jobId });
        } catch (e) {
          console.error('Auto-build draft estimate failed:', e);
        }
      }

      await onRefresh();
      onComplete(estimateRequiredItems.length > 0);
    } catch (e) {
      setError(e.message || 'Failed to complete recommendation review');
    } finally {
      setCompleting(false);
    }
  };

  const handleManagerOverride = async (overrideData) => {
    setSaving(true);
    try {
      const updated = await base44.entities.RecommendationReview.update(review.id, {
        status: 'complete',
        manager_override_used: true,
        override_reason: overrideData.reason,
        override_signature: overrideData.signature,
        override_by: overrideData.name,
        override_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
      setReview(updated);
      setOverrideOpen(false);

      // Store override on appointment if available
      if (appointmentId) {
        try {
          await base44.entities.Appointment.update(appointmentId, {
            notes: `Manager override: ${overrideData.reason} (by ${overrideData.name})`,
          });
        } catch (e) { /* non-blocking */ }
      }

      await onRefresh();
      onComplete(false);
    } catch (e) {
      setError(e.message || 'Failed to apply manager override');
    } finally {
      setSaving(false);
    }
  };

  const canComplete = allReviewed;
  const hasNoMaterials = items.some(i => i.estimate_required && !i.pricebook_item_id);

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o && !completing) handleCloseAttempt(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" onCloseAttempt={handleCloseAttempt}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-accent" />
              Recommendation Review
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
            </div>
          ) : error && !review ? (
            <div className="py-8 text-center">
              <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-2" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center">
              <ShieldCheck className="w-10 h-10 text-green-500 mx-auto mb-2" />
              <p className="font-medium">No deficiencies found during inspection.</p>
              <p className="text-sm text-muted-foreground">Recommendation Review is not required.</p>
            </div>
          ) : (
            <>
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {reviewedCount} of {items.length} deficiencies reviewed
                  </span>
                  <span className="text-muted-foreground">{progressPct}%</span>
                </div>
                <Progress value={progressPct} className="h-2" />
                {estimateRequiredCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {estimateRequiredCount} estimate-required {estimateRequiredCount === 1 ? 'item' : 'items'}
                  </p>
                )}
              </div>

              {/* Item Navigation */}
              <div className="flex items-center gap-2 flex-wrap">
                {items.map((item, idx) => (
                  <button
                    key={item.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      idx === currentIndex
                        ? 'border-accent bg-accent/10 text-accent'
                        : item.status === 'reviewed'
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'border-muted bg-muted/30 text-muted-foreground'
                    }`}
                  >
                    {item.status === 'reviewed' ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <Circle className="w-3 h-3" />
                    )}
                    {idx + 1}
                  </button>
                ))}
              </div>

              {/* Current Deficiency Card */}
              {currentItem && (
                <DeficiencyReviewCard
                  item={currentItem}
                  formData={formData}
                  setFormData={setFormData}
                  error={error}
                  templateMatch={templateMatches[currentItem.id]}
                  showDiagnostics={showDiagnostics}
                  onToggleDiagnostics={() => setShowDiagnostics(!showDiagnostics)}
                />
              )}

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}

              {hasNoMaterials && allReviewed && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    Recommendation created without materials. Manual pricing may be required.
                  </p>
                </div>
              )}

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <div className="flex gap-2 mr-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentIndex === 0}
                    onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                  >
                    <ChevronLeft className="w-4 h-4" /> Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentIndex >= items.length - 1}
                    onClick={() => setCurrentIndex(Math.min(items.length - 1, currentIndex + 1))}
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                {isManager && !allReviewed && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-amber-700 border-amber-300"
                    disabled={saving || completing}
                    onClick={() => setOverrideOpen(true)}
                  >
                    <Lock className="w-4 h-4" /> Manager Override
                  </Button>
                )}

                <Button
                  className="gap-1"
                  disabled={saving || completing}
                  onClick={handleMarkReviewed}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {currentItem?.status === 'reviewed' ? 'Save Changes' : 'Mark as Reviewed & Next'}
                </Button>

                {canComplete && (
                  <Button
                    className="gap-1"
                    disabled={saving || completing}
                    onClick={handleComplete}
                  >
                    {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
                    Complete Review
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <DirtyCloseWarning
        open={showWarning}
        onContinueEditing={cancelDiscard}
        onDiscardChanges={confirmDiscard}
      />

      <ManagerOverrideDialog
        open={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        onConfirm={handleManagerOverride}
        saving={saving}
      />
    </>
  );
}

function humanizeDeficiencyType(dt) {
  if (!dt) return '';
  return dt.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getDeficiencyTitle(item) {
  // Title fallback priority per spec:
  // 1. finding.title (source_title / title)
  // 2. deficiency.title (deficiency_type)
  // 3. failed_question_text
  // 4. inspection_item.label
  // 5. inspection_section + " Deficiency"
  // 6. "Inspection Deficiency"
  const isGeneric = /^Deficiency \d+$/.test(item.title || '');

  if (item.title && !isGeneric) return item.title;
  if (item.source_title) return item.source_title;
  if (item.source_failed_question) return item.source_failed_question;
  if (item.source_inspection_item_id) return item.source_inspection_item_id;
  if (item.source_deficiency_type) return humanizeDeficiencyType(item.source_deficiency_type);
  const section = item.source_section || item.interior_exterior;
  if (section) return `${section.charAt(0).toUpperCase() + section.slice(1)} Deficiency`;
  return 'Inspection Deficiency';
}

function DeficiencyReviewCard({ item, formData, setFormData, error, templateMatch, showDiagnostics, onToggleDiagnostics }) {
  const [materialCatalog, setMaterialCatalog] = useState([]);
  const [materialSearch, setMaterialSearch] = useState('');
  const [serviceCatalog, setServiceCatalog] = useState([]);
  useEffect(() => {
    base44.entities.InventoryMaster.filter({}, 'item_name', 6000).then(setMaterialCatalog).catch(() => setMaterialCatalog([]));
    base44.entities.ServiceCatalog.filter({}, 'service_name', 6000).then(setServiceCatalog).catch(() => setServiceCatalog([]));
  }, []);
  const selectedMaterials = useMemo(() => { try { return JSON.parse(formData.materials || '[]'); } catch { return []; } }, [formData.materials]);
  const setSelectedMaterials = (next) => setFormData(prev => ({ ...prev, materials: JSON.stringify(next) }));
  const photos = item.photo_urls?.length > 0 ? item.photo_urls : (item.source_photos || []);
  const disposition = getDisposition(formData.disposition);
  const estimateRequired = disposition?.estimateRequired || false;

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-base">{getDeficiencyTitle(item)}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge className={SEVERITY_STYLES[item.severity] || 'bg-gray-100 text-gray-700'} variant="secondary">
                {item.severity}
              </Badge>
              {item.interior_exterior && (
                <Badge variant="outline" className="capitalize">{item.interior_exterior}</Badge>
              )}
              {item.deficiency_type && (
                <Badge variant="outline">{item.deficiency_type}</Badge>
              )}
              {item.status === 'reviewed' && (
                <Badge className="bg-green-100 text-green-700" variant="secondary">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Reviewed
                </Badge>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" className="gap-1 text-xs h-7" onClick={onToggleDiagnostics}>
            <Stethoscope className="w-3.5 h-3.5" />
            {showDiagnostics ? 'Hide' : 'Show'} Diagnostics
          </Button>
        </div>

        {/* Template match banner */}
        {templateMatch && (
          <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-200 text-xs space-y-1">
            <div className="flex items-center gap-1 font-medium text-indigo-800">
              <Sparkles className="w-3.5 h-3.5" />
              Matched Template: {templateMatch.template_name}
              <span className="text-indigo-600 ml-1">({templateMatch.confidence_score}% confidence)</span>
            </div>
            {templateMatch.matched_keywords?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {templateMatch.matched_keywords.map((kw, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] text-indigo-700 border-indigo-300">{kw}</Badge>
                ))}
              </div>
            )}
            {templateMatch.service_mapping?.service_name && (
              <p className="text-indigo-700">
                Recommended Service: <strong>{templateMatch.service_mapping.service_name}</strong>
                {templateMatch.service_mapping.default_selling_price > 0 && (
                  <span className="ml-1">(${templateMatch.service_mapping.default_selling_price.toFixed(2)})</span>
                )}
              </p>
            )}
            {templateMatch.expected_estimate_status && (
              <p className="text-indigo-600">
                Expected estimate status: <strong>{templateMatch.expected_estimate_status.replace(/_/g, ' ')}</strong>
              </p>
            )}
            {/* Admin warning: template matched but recommended_solution is blank */}
            {!templateMatch.recommendation_content?.recommended_solution && (
              <div className="flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>Matched template is missing recommended solution.</span>
              </div>
            )}
          </div>
        )}

        {/* Admin diagnostics */}
        {showDiagnostics && (
          <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs space-y-1 font-mono">
            <p className="font-semibold text-slate-700 mb-1">Diagnostics</p>
            <DiagRow label="Deficiency ID" value={item.id || '—'} />
            <DiagRow label="Inspection section" value={item.interior_exterior || '—'} />
            <DiagRow label="Finding title" value={item.title || '—'} />
            <DiagRow label="Matched template ID" value={templateMatch?.template_id || '—'} />
            <DiagRow label="Matched template name" value={templateMatch?.template_name || '—'} />
            <DiagRow label="Confidence score" value={templateMatch ? `${templateMatch.confidence_score}%` : '—'} />
            <DiagRow label="Recommended service ID" value={templateMatch?.service_mapping?.service_catalog_id || '—'} />
            <DiagRow label="Service price found" value={templateMatch?.service_mapping?.default_selling_price > 0 ? 'yes' : (templateMatch ? 'no' : '—')} />
            <DiagRow label="Materials loaded" value={templateMatch?.material_mapping ? (
              (templateMatch.material_mapping.default?.length || 0) + (templateMatch.material_mapping.internal?.length || 0) > 0 ? 'yes' : 'no'
            ) : '—'} />
            <DiagRow label="Final estimate status" value={templateMatch?.expected_estimate_status || '—'} />
          </div>
        )}

        {/* Inspection Context */}
        {(item.source_section || item.interior_exterior || item.source_failed_question || item.source_description || item.description || item.source_notes || item.source_deficiency_type || item.deficiency_type) && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Inspection Context</p>
            {(item.source_section || item.interior_exterior) && (
              <div className="text-sm">
                <span className="text-muted-foreground">Inspection Section: </span>
                <span className="font-medium capitalize">{item.source_section || item.interior_exterior}</span>
              </div>
            )}
            {(item.source_deficiency_type || item.deficiency_type) && (
              <div className="text-sm">
                <span className="text-muted-foreground">Deficiency Type: </span>
                <span className="font-medium">{humanizeDeficiencyType(item.source_deficiency_type || item.deficiency_type)}</span>
              </div>
            )}
            {item.source_failed_question && (
              <div className="text-sm">
                <span className="text-muted-foreground">Failed Item: </span>
                <span>{item.source_failed_question}</span>
              </div>
            )}
            {(item.source_description || item.description) && (
              <div className="text-sm">
                <span className="text-muted-foreground">Finding Description: </span>
                <span>{item.source_description || item.description}</span>
              </div>
            )}
            {item.source_notes && (
              <div className="text-sm">
                <span className="text-muted-foreground">Technician Notes: </span>
                <span>{item.source_notes}</span>
              </div>
            )}
          </div>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Photos</p>
            <div className="flex gap-2 flex-wrap">
              {photos.map((url, i) => (
                <img key={i} src={url} alt={`Finding ${i + 1}`} className="w-24 h-24 object-cover rounded-lg border" />
              ))}
            </div>
          </div>
        )}

        <hr className="border-border" />

        {/* Disposition Selection */}
        <div>
          <Label className="text-sm font-semibold">Disposition *</Label>
          <p className="text-xs text-muted-foreground mb-2">Select the appropriate disposition for this deficiency.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {DISPOSITIONS.map(d => {
              const Icon = d.icon;
              const selected = formData.disposition === d.value;
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, disposition: d.value }))}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors text-left ${
                    selected ? d.color + ' ring-2 ring-offset-1 ring-accent' : 'border-input bg-background hover:bg-accent/5'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{d.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Customer Summary */}
        <div>
          <Label className="text-sm font-semibold">Customer Summary *</Label>
          <p className="text-xs text-muted-foreground mb-1">Customer-facing explanation of this deficiency and its impact.</p>
          <Textarea
            value={formData.customer_summary}
            onChange={e => setFormData(prev => ({ ...prev, customer_summary: e.target.value }))}
            placeholder="Explain this deficiency to the customer in plain language..."
            rows={3}
          />
        </div>

        {/* Recommended Solution (required when estimate required) */}
        {estimateRequired && (
          <div>
            <Label className="text-sm font-semibold">Recommended Solution *</Label>
            <p className="text-xs text-muted-foreground mb-1">Required when an estimate is required.</p>
            <Textarea
              value={formData.recommended_solution}
              onChange={e => setFormData(prev => ({ ...prev, recommended_solution: e.target.value }))}
              placeholder="Describe the recommended repair or solution..."
              rows={2}
            />
          </div>
        )}

        {/* Optional Fields */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-semibold">Pricebook Item (Optional)</Label>
            <Input
              list="service-catalog-options"
              value={formData.pricebook_item_name}
              onChange={e => {
                const value = e.target.value;
                const service = serviceCatalog.find(x => x.service_name === value || x.name === value);
                setFormData(prev => ({ ...prev, pricebook_item_name: service?.service_name || service?.name || value, pricebook_item_id: service?.id || prev.pricebook_item_id }));
              }}
              placeholder="Type to search pricebook services…"
              className="text-sm"
            />
            <datalist id="service-catalog-options">
              {serviceCatalog.map(service => <option key={service.id} value={service.service_name || service.name || ''}>{service.sku || service.service_code || ''}</option>)}
            </datalist>
          </div>
          <div>
            <Label className="text-xs font-semibold">Labor Hours (Optional)</Label>
            <Input
              type="number"
              value={formData.labor_hours}
              onChange={e => setFormData(prev => ({ ...prev, labor_hours: e.target.value }))}
              placeholder="0"
              className="text-sm"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold">Materials for Pricing</Label>
          <p className="text-xs text-muted-foreground">Select catalog materials and adjust quantities before this recommendation is priced.</p>
          <Input
            list="material-catalog-options"
            value={materialSearch}
            onChange={e => {
              const value = e.target.value;
              setMaterialSearch(value);
              const m = materialCatalog.find(x => x.item_name === value);
              if (!m || selectedMaterials.some(x => x.material_id === m.id)) return;
              setSelectedMaterials([...selectedMaterials, { material_id: m.id, item_name: m.item_name, quantity: m.preferred_order_quantity || 1, unit: m.unit || 'each', unit_cost: m.unit_cost || m.standard_cost || m.purchase_cost || 0, sku: m.sku || '' }]);
              setMaterialSearch('');
            }}
            placeholder="Type to search materials (e.g. hearth, mortar, stainless)…"
            className="text-sm"
          />
          <datalist id="material-catalog-options">
            {materialCatalog.filter(m => !selectedMaterials.some(x => x.material_id === m.id)).map(m => <option key={m.id} value={m.item_name}>{m.sku || ''}</option>)}
          </datalist>
          {selectedMaterials.map((m, i) => <div key={m.material_id || i} className="flex gap-2 items-center text-sm"><span className="flex-1">{m.item_name} <span className="text-muted-foreground">(${Number(m.unit_cost || 0).toFixed(2)}/{m.unit})</span></span><Input type="number" min="0" step="0.1" className="w-20" value={m.quantity} onChange={e => { const next=[...selectedMaterials]; next[i]={...m, quantity:Number(e.target.value)}; setSelectedMaterials(next); }} /><Button type="button" size="sm" variant="ghost" onClick={() => setSelectedMaterials(selectedMaterials.filter((_, index) => index !== i))}>Remove</Button></div>)}
        </div>

        <div>
          <Label className="text-xs font-semibold">Technician Notes (Optional)</Label>
          <Textarea
            value={formData.technician_notes}
            onChange={e => setFormData(prev => ({ ...prev, technician_notes: e.target.value }))}
            placeholder="Internal notes about this deficiency..."
            rows={2}
          />
        </div>

        {disposition && (
          <div className={`p-2 rounded-lg text-xs ${disposition.color} border`}>
            <strong>{disposition.label}</strong> — {disposition.estimateRequired
              ? 'Estimate generation required. A repair recommendation will be created.'
              : 'No estimate required. This item will not appear on the estimate.'}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DiagRow({ label, value }) {
  return (
    <div className="flex gap-2">
      <span className="text-slate-500 w-44 shrink-0">{label}:</span>
      <span className="text-slate-700">{value}</span>
    </div>
  );
}

function ManagerOverrideDialog({ open, onClose, onConfirm, saving }) {
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('');
      setReason('');
      setHasSignature(false);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [open]);

  const startDraw = (e) => {
    setDrawing(true);
    draw(e);
  };

  const stopDraw = () => {
    setDrawing(false);
    setHasSignature(true);
  };

  const draw = (e) => {
    if (!drawing && e.type !== 'mousedown' && e.type !== 'touchstart') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#222';
    if (e.type === 'mousedown' || e.type === 'touchstart') {
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleConfirm = () => {
    if (!name.trim() || !reason.trim()) return;
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;
    const signature = canvas.toDataURL('image/png');
    onConfirm({ name: name.trim(), reason: reason.trim(), signature });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-amber-600" /> Manager Override
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              By using manager override, you are bypassing the requirement to review all deficiencies.
              This action will be logged with your name, reason, and signature.
            </p>
          </div>
          <div>
            <Label className="text-sm font-semibold">Manager Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="mt-1" />
          </div>
          <div>
            <Label className="text-sm font-semibold">Reason *</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain why the override is needed..." rows={2} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm font-semibold">Signature *</Label>
            <canvas
              ref={canvasRef}
              width={350}
              height={120}
              className="w-full border border-input rounded-lg bg-white cursor-crosshair touch-none"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={stopDraw}
              onMouseLeave={stopDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={stopDraw}
            />
            <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={clearSignature}>
              Clear Signature
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={saving || !name.trim() || !reason.trim() || !hasSignature}
            className="gap-1"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Apply Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}