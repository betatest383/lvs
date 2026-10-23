import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { rotateImageByDegrees } from '@/utils/rotateImage';
import { useInspectionReturn } from '@/hooks/useInspectionReturn';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ChevronLeft, ChevronRight, Save, Send, Camera, Loader2, CheckCircle2, AlertTriangle, ShieldAlert, Info } from 'lucide-react';
import { toast } from 'sonner';
import { runRulesEngine, SEVERITY_STYLES } from '@/lib/inspectionRulesEngine';
import { resolveInspectionTypes } from '@/lib/inspectionTypeResolver';
import { stableSortQuestions, computeConditionalFormOrder } from '@/lib/inspectionQuestionOrdering';
import { getMissingRequiredPhotos, isPhotoRequiredForAnswer, resolvePhotoRequirementMode } from '@/lib/photoValidation';
import PhotoValidationDialog from '@/components/inspection/PhotoValidationDialog';
import ResolvedTypeField from '@/components/inspection/ResolvedTypeField';
import moment from 'moment';
import * as exifr from 'exifr';
import { resolveAuthoritativeInspectionSubmission } from '@/lib/inspectionSubmissionResolver';
import { getTransitiveDependents, clearAnswersForQuestions, photosForQuestions } from '@/lib/inspectionAnswerClear';
import ClearAnswerButton from '@/components/inspection/ClearAnswerButton';
import ResetResponsesButton from '@/components/inspection/ResetResponsesButton';
import ChimneyMeasurementDiagram from '@/components/inspection/ChimneyMeasurementDiagram';
import { useDeveloperMode } from '@/hooks/useDeveloperMode';
import { completeStageServer } from '@/lib/workflowRevisions';

// Resize on-device before upload. A 1920 px long edge is detailed enough for
// inspection photos while avoiding large iPad canvas work and multi-megabyte uploads.
async function normalizeImageOrientation(file) {
  const MAX_DIMENSION = 1920;
  let objectUrl = '';

  try {
    let orientation = 1;
    try {
      const exif = await exifr.parse(file);
      orientation = exif?.Orientation || 1;
    } catch (error) {
      console.warn('[PHOTO] EXIF unavailable; using normal orientation.', error.message);
    }

    objectUrl = URL.createObjectURL(file);
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('This image could not be read by the iPad browser.'));
      image.src = objectUrl;
    });

    const rotated = [5, 6, 7, 8].includes(orientation);
    const outputWidth = rotated ? img.height : img.width;
    const outputHeight = rotated ? img.width : img.height;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(outputWidth, outputHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(outputWidth * scale));
    canvas.height = Math.max(1, Math.round(outputHeight * scale));
    const ctx = canvas.getContext('2d');

    ctx.scale(scale, scale);
    switch (orientation) {
      case 2: ctx.translate(img.width, 0); ctx.scale(-1, 1); break;
      case 3: ctx.translate(img.width, img.height); ctx.rotate(Math.PI); break;
      case 4: ctx.translate(0, img.height); ctx.scale(1, -1); break;
      case 5: ctx.rotate(Math.PI / 2); ctx.scale(1, -1); break;
      case 6: ctx.translate(img.height, 0); ctx.rotate(Math.PI / 2); break;
      case 7: ctx.translate(img.height, 0); ctx.rotate(Math.PI / 2); ctx.scale(-1, 1); break;
      case 8: ctx.translate(0, img.width); ctx.rotate(-Math.PI / 2); break;
      default: break;
    }
    ctx.drawImage(img, 0, 0);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Photo compression failed.')), 'image/jpeg', 0.82);
    });
    return new File([blob], `inspection-${Date.now()}.jpg`, { type: 'image/jpeg' });
  } catch (error) {
    // Never leave the technician waiting on a failed canvas conversion. Uploading
    // the original gives Base44 a second opportunity to handle the image.
    console.warn('[PHOTO] Local preparation failed; trying original image.', error.message);
    return file;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

const fmtDate = (d) => d ? moment.utc(d).format('MMM D, YYYY') : '';

const SECTIONS = ['property_info', 'questions', 'notes_photos'];

const SECTION_LABELS = {
  property_info: 'Property Info',
  questions: 'Inspection Questions',
  notes_photos: 'Notes & Photos',
};

export default function InspectionForm() {
  const [user, setUser] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const { goBack } = useInspectionReturn(selectedJobId);
  const [selectedJob, setSelectedJob] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [photos, setPhotos] = useState([]);
  const [photoUploadCount, setPhotoUploadCount] = useState(0);
  const [notes, setNotes] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [currentSection, setCurrentSection] = useState(0);
  const [rules, setRules] = useState([]);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [explanations, setExplanations] = useState({});
  const [setupData, setSetupData] = useState(null);
  const [photoValidationOpen, setPhotoValidationOpen] = useState(false);
  const [missingPhotos, setMissingPhotos] = useState([]);
  const [photoOverrideCallback, setPhotoOverrideCallback] = useState(null);
  const { isDevToolsVisible } = useDeveloperMode();

  const urlParams = new URLSearchParams(window.location.search);
  const presetJobId = urlParams.get('job_id');
  const isReopen = urlParams.get('reopen') === '1';

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      Promise.all([
        base44.entities.Job.filter({ status: 'scheduled' }, '-service_date'),
        base44.entities.Job.filter({ status: 'inspection_complete' }, '-service_date'),
      ]).then(([scheduled, inProgress]) => setJobs([...scheduled, ...inProgress]));
    });
    // Load interior + both questions (exclude inspection_setup module — those belong to Inspection Setup)
    base44.entities.InspectionQuestion.filter({ is_active: true }, 'sort_order').then(qs => {
      const interior = qs.filter(q => (!q.inspection_type || q.inspection_type === 'interior' || q.inspection_type === 'both') && q.inspection_module !== 'inspection_setup');
      const validIds = new Set(interior.map(q => q.id));
      // Drop questions whose visibility rule references a parent not on this form
      const filtered = interior.filter(q => {
        if (!q.visibility_rule) return true;
        try {
          const rule = JSON.parse(q.visibility_rule);
          if (rule.conditions) return rule.conditions.some(c => validIds.has(c.question_id));
          return validIds.has(rule.question_id);
        } catch { return true; }
      });
      setQuestions(stableSortQuestions(filtered));
    });
    base44.entities.LogicRule.filter({ is_active: true }).then(rs => {
      setRules(rs.filter(r => !r.inspection_type || r.inspection_type === 'interior' || r.inspection_type === 'both'));
    });
  }, []);

  // Load InspectionSetup data and existing draft/submission when job is selected
  useEffect(() => {
    if (!selectedJobId) return;
    base44.entities.InspectionSetup.filter({ job_id: selectedJobId }, '-created_date').then(setups => {
      if (setups.length > 0) setSetupData(setups[0]);
    }).catch(() => {});
    // Load authoritative submission to prevent duplicate records
    resolveAuthoritativeInspectionSubmission({ job_id: selectedJobId, inspection_type: 'interior' }).then(({ authoritative }) => {
      if (authoritative) {
        console.log('[InspectionForm] Loaded authoritative submission:', { id: authoritative.id, status: authoritative.status });
        setDraftId(authoritative.id);
        setAnswers(authoritative.answers ? JSON.parse(authoritative.answers) : {});
        setPhotos(authoritative.photos || []);
        setNotes(authoritative.technician_notes || '');
        setPropertyType(authoritative.property_type || '');
        // If already submitted, show the submitted screen (view-only)
        if (['submitted', 'reviewed', 'approved'].includes(authoritative.status) && !isReopen) {
          setSubmitted(true);
        }
      }
    }).catch(() => {});
  }, [selectedJobId, isReopen]);

  useEffect(() => {
    if (presetJobId) {
      setSelectedJobId(presetJobId);
    }
  }, [presetJobId]);

  useEffect(() => {
    if (selectedJobId) {
      const job = jobs.find(j => j.id === selectedJobId);
      setSelectedJob(job || null);
    }
  }, [selectedJobId, jobs]);

  const allSections = SECTIONS;

  // Question render order is computed below, after isVisible is defined, because
  // dynamic placement of conditional follow-ups depends on current visibility.

  // Resolve Chimney Type and Appliance Type from inspection answers (single source of truth)
  const { chimneyType: resolvedChimneyType, applianceType: resolvedApplianceType } = useMemo(
    () => resolveInspectionTypes(answers),
    [answers]
  );
  const chimneyType = resolvedChimneyType || '';
  const applianceType = resolvedApplianceType || '';

  // Live findings from rules engine
  const findings = useMemo(() => {
    if (!rules.length) return [];
    const meta = { chimney_type: chimneyType, property_type: propertyType, appliance_type: applianceType };
    return runRulesEngine(rules, answers, meta);
  }, [rules, answers, chimneyType, propertyType, applianceType]);

  const evalCondition = (cond, answers) => {
    const answer = answers[cond.question_id];
    const hasAnswer = answer !== undefined && answer !== null && answer !== '' && !(Array.isArray(answer) && answer.length === 0);
    if (cond.operator === 'is_not_empty') return hasAnswer;
    if (!hasAnswer) return false;
    if (cond.operator === 'equals') return String(answer).toLowerCase() === String(cond.value ?? '').toLowerCase();
    if (cond.operator === 'not_equals') return String(answer).toLowerCase() !== String(cond.value ?? '').toLowerCase();
    if (cond.operator === 'contains') return Array.isArray(answer) ? answer.includes(cond.value) : String(answer).toLowerCase().includes(String(cond.value ?? '').toLowerCase());
    return true;
  };

  const isVisible = (question) => {
    if (!question.visibility_rule) return true;
    const validIds = new Set(questions.map(q => q.id));
    try {
      const rule = JSON.parse(question.visibility_rule);
      // Multi-condition format
      if (rule.conditions) {
        const applicable = rule.conditions.filter(c => validIds.has(c.question_id));
        if (applicable.length === 0) return false;
        const fn = rule.logic === 'and' ? 'every' : 'some';
        return applicable[fn](c => evalCondition(c, answers));
      }
      // Single-condition format (backward compat)
      if (!validIds.has(rule.question_id)) return false;
      return evalCondition(rule, answers);
    } catch { return true; }
  };

  // Identify which referenced dependencies are currently "triggering" (their
  // specific condition is satisfied by the current answers). Used to place a
  // conditional follow-up after the last triggering dependency rather than a
  // fixed Sort Order position.
  const getSatisfiedDepIds = (q) => {
    if (!q.visibility_rule) return [];
    try {
      const rule = JSON.parse(q.visibility_rule);
      const conds = rule.conditions && Array.isArray(rule.conditions)
        ? rule.conditions
        : (rule.question_id ? [rule] : []);
      const out = [];
      for (const c of conds) if (c.question_id && evalCondition(c, answers)) out.push(c.question_id);
      return out;
    } catch { return []; }
  };

  // Compute render order with two placement modes for conditional follow-ups:
  //   • Fixed anchor — display_after_question_id pins a follow-up below one
  //     fixed parent (optional override).
  //   • Dynamic "after last visible triggering dependency" — a follow-up with
  //     multiple possible triggers renders immediately after the last visible
  //     referenced dependency whose condition is currently met. No Sort Order
  //     or fixed anchor needed.
  // Base/root questions render in Sort Order. Saved sort_order is never changed.
  const sortedQuestions = useMemo(
    () => computeConditionalFormOrder(questions, isVisible, getSatisfiedDepIds),
    [questions, answers]
  );

  // NFPA 211 fireplace hearth extension calculator. The opening is front width ×
  // height; the back width and depth are intentionally not part of this code rule.
  const hearthResults = useMemo(() => questions.flatMap((question) => {
    if (question.question_role !== 'derived_result') return [];

    let config;
    try { config = JSON.parse(question.derived_result_produced || '{}'); } catch { return []; }
    if (config.calculator !== 'nfpa_211_fireplace_hearth_extension_v1') return [];

    const numberAnswer = (id) => Number(answers[id]);
    const openingWidth = numberAnswer(config.opening_width_question_id);
    const openingHeight = numberAnswer(config.opening_height_question_id);
    const frontProjection = numberAnswer(config.front_projection_question_id);
    const leftProjection = numberAnswer(config.left_projection_question_id);
    const rightProjection = numberAnswer(config.right_projection_question_id);
    const values = [openingWidth, openingHeight, frontProjection, leftProjection, rightProjection];

    if (!values.every((value) => Number.isFinite(value) && value > 0)) {
      return [{ questionId: question.id, ready: false }];
    }

    const openingAreaSqFt = (openingWidth * openingHeight) / 144;
    const largeOpening = openingAreaSqFt >= 6;
    const requirement = largeOpening
      ? { front: 20, side: 12, reference: 'NFPA 211 (2027) §11.3.4' }
      : { front: 16, side: 8, reference: 'NFPA 211 (2027) §11.3.3' };

    const shortages = [
      frontProjection < requirement.front && `Front projection is ${frontProjection}" (requires ${requirement.front}")`,
      leftProjection < requirement.side && `Left-side extension is ${leftProjection}" (requires ${requirement.side}")`,
      rightProjection < requirement.side && `Right-side extension is ${rightProjection}" (requires ${requirement.side}")`,
    ].filter(Boolean);

    const result = shortages.length ? 'No' : 'Yes';
    return [{
      questionId: question.id,
      ready: true,
      result,
      shortages,
      requirement,
      values: {
        opening_width_in: openingWidth,
        opening_height_in: openingHeight,
        opening_area_sq_ft: Number(openingAreaSqFt.toFixed(2)),
        front_projection_in: frontProjection,
        left_projection_in: leftProjection,
        right_projection_in: rightProjection,
      },
      snapshot: {
        calculator: 'nfpa_211_fireplace_hearth_extension_v1',
        calculation_version: '1.0',
        standard: config.standard || requirement.reference,
        opening_area_sq_ft: Number(openingAreaSqFt.toFixed(2)),
        required_front_in: requirement.front,
        required_side_in: requirement.side,
        measured_front_in: frontProjection,
        measured_left_in: leftProjection,
        measured_right_in: rightProjection,
        result,
        shortages,
      },
    }];
  }), [questions, answers]);

  const hearthResultsJson = JSON.stringify(hearthResults);
  const hearthResultByQuestionId = Object.fromEntries(
    hearthResults.map((result) => [result.questionId, result])
  );

  // Persist both the calculated Yes/No answer and an immutable calculation
  // snapshot with the inspection submission. Technicians cannot override it.
  useEffect(() => {
    if (!hearthResults.length) return;
    setAnswers((previous) => {
      let changed = false;
      const next = { ...previous };
      hearthResults.forEach((calculation) => {
        const snapshotKey = `${calculation.questionId}__calculation`;
        if (calculation.ready) {
          const snapshot = JSON.stringify(calculation.snapshot);
          if (next[calculation.questionId] !== calculation.result) {
            next[calculation.questionId] = calculation.result;
            changed = true;
          }
          if (next[snapshotKey] !== snapshot) {
            next[snapshotKey] = snapshot;
            changed = true;
          }
        } else if (next[calculation.questionId] !== undefined || next[snapshotKey] !== undefined) {
          delete next[calculation.questionId];
          delete next[snapshotKey];
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [hearthResultsJson]);

  const CONCERNING_VALUES = ['unsafe', 'failed', 'deficient', 'needs repair', 'water damage', 'cracked', 'improper', 'yes', 'poor', 'deteriorated', 'missing', 'damaged'];

  const isConcerning = (val) => {
    if (!val) return false;
    const v = String(val).toLowerCase().trim();
    return CONCERNING_VALUES.some(c => v === c || v.includes(c));
  };

  const fetchExplanation = async (question, value) => {
    if (!value || (Array.isArray(value) && value.length === 0)) return;
    const key = `${question.id}_${JSON.stringify(value)}`;
    if (explanations[key]) return;
    setExplanations(prev => ({ ...prev, [key]: 'loading' }));
    try {
      const res = await base44.functions.invoke('generateAnswerExplanation', {
        question_text: question.question_text,
        answer: value,
        chimney_type: chimneyType,
        appliance_type: applianceType,
      });
      setExplanations(prev => ({ ...prev, [key]: res.data?.explanation || '' }));
    } catch(e) {
      setExplanations(prev => ({ ...prev, [key]: '' }));
    }
  };

  const handleAnswer = (questionId, value, question) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
    if (question && isConcerning(Array.isArray(value) ? value.join(', ') : value)) {
      fetchExplanation(question, value);
    }
  };

  // Structural map: how many follow-ups transitively depend on each question.
  // Recomputed only when the question set changes — not on every answer edit.
  const dependentsCountMap = useMemo(() => {
    const m = {};
    for (const q of questions) m[q.id] = getTransitiveDependents(questions, q.id).size;
    return m;
  }, [questions]);

  const hasAnswered = (q) => {
    const v = answers[q.id];
    if (v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)) return true;
    const ph = answers[`${q.id}_photos`];
    return Array.isArray(ph) && ph.length > 0;
  };

  // Clear one answered question and cascade-clear every currently answered
  // follow-up whose visibility depends (directly or indirectly) on it. Operates
  // only on the active InspectionSubmission state — never mutates the master
  // InspectionQuestion/template/configuration.
  const handleClearAnswer = (question) => {
    const cascade = getTransitiveDependents(questions, question.id);
    const allIds = new Set([question.id, ...cascade]);
    const nextAnswers = clearAnswersForQuestions(answers, questions, [...allIds]);
    const urlsToRemove = new Set(photosForQuestions(answers, questions, [...allIds]));
    const nextPhotos = urlsToRemove.size ? photos.filter(u => !urlsToRemove.has(u)) : photos;
    setAnswers(nextAnswers);
    setPhotos(nextPhotos);
    setExplanations(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        for (const id of allIds) {
          if (key.startsWith(`${id}_`)) { delete next[key]; break; }
        }
      }
      return next;
    });
    const clearedDeps = [...allIds]
      .filter(id => id !== question.id)
      .map(id => questions.find(q => q.id === id))
      .filter(Boolean)
      .map(q => ({ id: q.id, text: q.question_text }));
    try {
      base44.entities.JobActivityLog.create({
        job_id: selectedJobId,
        technician_email: user?.email || '',
        event_type: 'inspection_answer_cleared',
        event_label: `Inspection answer cleared: ${question.question_text || question.id}`,
        event_details: JSON.stringify({
          inspection_submission_id: draftId,
          inspection_type: 'interior',
          question_id: question.id,
          question_text: question.question_text,
          cleared_by: user?.email,
          cleared_at: new Date().toISOString(),
          dependent_cleared: clearedDeps,
        }),
        performed_by: user?.full_name || user?.email || '',
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    } catch { /* audit log is non-blocking */ }
    toast.success(clearedDeps.length > 0
      ? `Cleared answer and ${clearedDeps.length} dependent response(s)`
      : 'Answer cleared');
  };

  // Developer/test-only: clear ALL responses from the active draft inspection.
  // Never deletes the InspectionSubmission record or the question template.
  const handleResetResponses = async () => {
    setAnswers({});
    setPhotos([]);
    setNotes('');
    setPropertyType('');
    setExplanations({});
    if (draftId) {
      try {
        await base44.entities.InspectionSubmission.update(draftId, {
          answers: '{}',
          photos: [],
          technician_notes: '',
          property_type: '',
          status: 'draft',
        });
      } catch (e) {
        toast.error('Failed to reset saved draft: ' + (e.message || ''));
      }
    }
    try {
      base44.entities.JobActivityLog.create({
        job_id: selectedJobId,
        technician_email: user?.email || '',
        event_type: 'inspection_responses_reset',
        event_label: 'Inspection responses reset (test)',
        event_details: JSON.stringify({
          inspection_submission_id: draftId,
          inspection_type: 'interior',
          reset_by: user?.email,
          reset_at: new Date().toISOString(),
        }),
        performed_by: user?.full_name || user?.email || '',
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    } catch { /* non-blocking */ }
    toast.success('All responses cleared');
  };

  const uploadPhotoFile = async (file) => {
    setPhotoUploadCount((count) => count + 1);
    try {
      const preparedFile = await normalizeImageOrientation(file);
      const { file_url } = await base44.integrations.Core.UploadFile({ file: preparedFile });
      if (!file_url) throw new Error('The upload service did not return a file URL.');
      return file_url;
    } catch (error) {
      console.error('[PHOTO] Upload failed:', error);
      toast.error(`Could not upload ${file.name || 'this photo'}. Please try again.`);
      throw error;
    } finally {
      setPhotoUploadCount((count) => Math.max(0, count - 1));
    }
  };

  const uploadPhotoFiles = async (files) => {
    const urls = [];
    for (const file of files) {
      try {
        urls.push(await uploadPhotoFile(file));
      } catch {
        // A failed photo already has an error toast; allow the rest of the batch.
      }
    }
    return urls;
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    let uploaded = 0;
    for (const file of files) {
      try {
        const file_url = await uploadPhotoFile(file);
        setPhotos(prev => [...prev, file_url]);
        uploaded += 1;
      } catch {
        // The helper already shows the actionable failure message. Continue
        // processing other selected photos rather than abandoning the batch.
      }
    }
    if (uploaded) toast.success(`${uploaded} photo(s) uploaded`);
    e.target.value = '';
  };

  const handleSaveDraft = async () => {
    if (!selectedJobId) {
      toast.error('Please select a job first');
      return;
    }
    setSaving(true);
    const data = {
      job_id: selectedJobId,
      customer_id: selectedJob?.customer_id || '',
      customer_name: selectedJob?.customer_name || '',
      technician_email: user.email,
      technician_name: user.full_name,
      address: selectedJob?.address || '',
      date_started: new Date().toISOString(),
      status: 'draft',
      inspection_type: 'interior',
      answers: JSON.stringify(answers),
      photos,
      technician_notes: notes,
      property_type: propertyType,
      chimney_type: chimneyType,
      appliance_type: applianceType,
    };
    if (draftId) {
      await base44.entities.InspectionSubmission.update(draftId, data);
    } else {
      const created = await base44.entities.InspectionSubmission.create(data);
      setDraftId(created.id);
    }
    setSaving(false);
    toast.success('Draft saved');
  };

  const handleSubmit = async (overrideReason = null) => {
    if (!selectedJobId) {
      toast.error('Please select a job first');
      return;
    }

    // Validate required photos (unless overriding with a reason)
    if (!overrideReason) {
      const visibleQs = sortedQuestions.filter(q => isVisible(q));
      const missing = getMissingRequiredPhotos(visibleQs, answers, visibleQs.map(q => q.id));
      if (missing.length > 0) {
        setMissingPhotos(missing);
        setPhotoOverrideCallback(() => (reason) => handleSubmit(reason));
        setPhotoValidationOpen(true);
        return;
      }
    }

    setSubmitting(true);
    // Store visible question IDs for downstream photo validation
    const visibleIds = sortedQuestions.filter(q => isVisible(q)).map(q => q.id);
    const answersWithMeta = { ...answers, __visible_question_ids: visibleIds };
    const data = {
      job_id: selectedJobId,
      customer_id: selectedJob?.customer_id || '',
      customer_name: selectedJob?.customer_name || '',
      technician_email: user.email,
      technician_name: user.full_name,
      address: selectedJob?.address || '',
      date_started: new Date().toISOString(),
      date_submitted: new Date().toISOString(),
      status: 'submitted',
      inspection_type: 'interior',
      answers: JSON.stringify(answersWithMeta),
      photos,
      technician_notes: notes + (overrideReason ? `\n\n[Photo Override] ${overrideReason}` : ''),
      property_type: propertyType,
      chimney_type: chimneyType,
      appliance_type: applianceType,
    };
    // ── Idempotent submission: find existing active record before creating ──
    let submissionId = draftId;
    if (!submissionId) {
      const { authoritative } = await resolveAuthoritativeInspectionSubmission({
        job_id: selectedJobId,
        inspection_type: 'interior',
      });
      if (authoritative) {
        submissionId = authoritative.id;
        setDraftId(authoritative.id);
        console.log('[InspectionForm] Found existing active submission to update:', authoritative.id);
      }
    }
    if (submissionId) {
      await base44.entities.InspectionSubmission.update(submissionId, { ...data, is_authoritative: true });
      console.log('[InspectionForm] Updated existing submission:', submissionId, '→ status: submitted');
    } else {
      const created = await base44.entities.InspectionSubmission.create({ ...data, is_authoritative: true });
      submissionId = created.id;
      setDraftId(created.id);
      console.log('[InspectionForm] Created new submission:', created.id, '→ status: submitted');
    }
    // ── Sync AppointmentWorkflow stage to completed (server-authoritative) ──
    try {
      const wfs = await base44.entities.AppointmentWorkflow.filter({ job_id: selectedJobId }).catch(() => []);
      if (wfs.length > 0) {
        const wf = wfs[0];
        const result = await completeStageServer({
          job_id: selectedJobId,
          workflow_id: wf.id,
          stage_key: 'interior_inspection',
          expected_workflow_revision_version: wf.workflow_revision_version || 0,
          extra_data: { inspection_submission_id: submissionId },
        });
        if (result?.success) {
          console.log('[InspectionForm] Server-authoritative interior_inspection → completed');
        } else {
          console.error('[InspectionForm] Failed to complete stage via server:', result?.error);
          toast.error(result?.error || 'Failed to mark inspection complete. Your submission was saved — please retry from Job Hub.');
        }
      }
    } catch (e) {
      console.error('[InspectionForm] Server stage completion error:', e.message);
      toast.error('Could not reach the server to mark the stage complete. Your submission was saved — please retry from Job Hub.');
    }
    // ── Verify persisted completion ──
    try {
      const fresh = await base44.entities.InspectionSubmission.get(submissionId);
      console.log('[InspectionForm] PersistVerify — re-read submission:', { id: fresh.id, status: fresh.status, inspection_type: fresh.inspection_type });
      if (fresh.status !== 'submitted') {
        console.error('[InspectionForm] ❌ PersistVerify FAILED — expected status="submitted" got="' + fresh.status + '"');
      } else {
        console.log('[InspectionForm] ✅ PersistVerify passed — status="submitted" confirmed in database');
      }
    } catch (e) {
      console.error('[InspectionForm] PersistVerify error:', e.message);
    }
    // Save triggered findings as Finding records
    if (findings.length > 0) {
      await base44.entities.Finding.bulkCreate(findings.map(f => ({
        inspection_id: submissionId,
        job_id: selectedJobId,
        customer_id: selectedJob?.customer_id || '',
        finding_type: f.finding_type,
        category: f.category,
        severity: f.severity,
        narrative_output: f.narrative,
        triggered_by_rule: f.rule_id,
      })));
    }
    // Keep status at inspection_complete (don't override if already set for multi-chimney jobs)
    setSubmitting(false);
    setSubmitted(true);
    toast.success('Inspection submitted successfully!');
  };

  const handleContinueToNextStep = async () => {
    // Synchronize workflow stage to completed (server-authoritative) and navigate
    try {
      const wfs = await base44.entities.AppointmentWorkflow.filter({ job_id: selectedJobId }).catch(() => []);
      if (wfs.length > 0) {
        const wf = wfs[0];
        const result = await completeStageServer({
          job_id: selectedJobId,
          workflow_id: wf.id,
          stage_key: 'interior_inspection',
          expected_workflow_revision_version: wf.workflow_revision_version || 0,
          extra_data: { inspection_submission_id: draftId },
        });
        if (!result?.success) {
          console.error('[InspectionForm] ContinueToNextStep server completion failed:', result?.error);
          toast.error(result?.error || 'Could not mark the stage complete. Please retry from Job Hub.');
        }
      }
    } catch (e) {
      console.error('[InspectionForm] ContinueToNextStep sync failed:', e.message);
      toast.error('Could not reach the server. Please retry from Job Hub.');
    }
    goBack();
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold">Inspection Submitted!</h2>
        <p className="text-muted-foreground text-center max-w-sm">Your inspection has been submitted for review. The system will generate the report, estimate, and invoice.</p>
        <div className="flex flex-col gap-2 mt-4 w-full max-w-xs">
          <Button onClick={handleContinueToNextStep} className="bg-green-600 hover:bg-green-700 text-white">
            Continue to Next Step
          </Button>
          <Button onClick={goBack} variant="outline">Return to Job Hub</Button>
        </div>
      </div>
    );
  }

  const renderQuestion = (q) => {
    if (!isVisible(q)) return null;
    const options = q.answer_options ? q.answer_options.split(',').map(o => o.trim()) : [];
    let subFields = [];
    try { subFields = JSON.parse(q.sub_fields || '[]'); } catch(e) {}
    const hearthResult = hearthResultByQuestionId[q.id];

    return (
      <div key={q.id} className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <Label className="text-sm font-medium">
            {q.question_text}
            {q.required_flag && <span className="text-destructive ml-1">*</span>}
          </Label>
          <ClearAnswerButton
            dependentsCount={dependentsCountMap[q.id] || 0}
            disabled={submitted || !hasAnswered(q) || q.question_role === 'derived_result'}
            onConfirm={() => handleClearAnswer(q)}
          />
        </div>
        {q.help_text && <p className="text-xs text-muted-foreground">{q.help_text}</p>}

        {q.question_role === 'chimney_measurement_diagram' && (
          <ChimneyMeasurementDiagram
            value={answers[q.id]}
            onChange={(value) => handleAnswer(q.id, value, q)}
            disabled={submitted}
          />
        )}

        {q.question_role === 'derived_result' && (
          <div className={`rounded-lg border p-3 text-sm ${
            !hearthResult?.ready
              ? 'border-slate-200 bg-slate-50 text-slate-600'
              : hearthResult.result === 'Yes'
                ? 'border-green-200 bg-green-50 text-green-900'
                : 'border-red-200 bg-red-50 text-red-900'
          }`}>
            {!hearthResult?.ready ? (
              <p>Enter the firebox front width, firebox height, and all three hearth-extension measurements to calculate compliance.</p>
            ) : (
              <div className="space-y-1">
                <p className="font-semibold">Calculated result: {hearthResult.result}</p>
                <p>Opening: {hearthResult.values.opening_width_in}" × {hearthResult.values.opening_height_in}" = {hearthResult.values.opening_area_sq_ft} ft².</p>
                <p>Required: at least {hearthResult.requirement.front}" in front and {hearthResult.requirement.side}" beyond each side.</p>
                <p>Measured: {hearthResult.values.front_projection_in}" front; {hearthResult.values.left_projection_in}" left; {hearthResult.values.right_projection_in}" right.</p>
                {hearthResult.shortages.length > 0 && (
                  <ul className="list-disc pl-5">
                    {hearthResult.shortages.map((shortage) => <li key={shortage}>{shortage}</li>)}
                  </ul>
                )}
                <p className="text-xs opacity-80">{hearthResult.requirement.reference}</p>
              </div>
            )}
          </div>
        )}

        {q.question_role !== 'derived_result' && q.question_type === 'yes_no' && (
          <div className="grid grid-cols-2 gap-2">
            {['Yes', 'No'].map(opt => (
              <Button
                key={opt}
                type="button"
                variant={answers[q.id] === opt ? 'default' : 'outline'}
                className="h-12 text-base"
                onClick={() => handleAnswer(q.id, opt, q)}
              >
                {opt}
              </Button>
            ))}
          </div>
        )}

        {q.question_role !== 'chimney_measurement_diagram' && q.question_type === 'select' && (
          <div className="grid grid-cols-2 gap-2">
            {options.map(opt => (
              <Button
                key={opt}
                type="button"
                variant={answers[q.id] === opt ? 'default' : 'outline'}
                className="h-12 text-sm"
                onClick={() => handleAnswer(q.id, opt, q)}
              >
                {opt}
              </Button>
            ))}
          </div>
        )}

        {q.question_type === 'multi_select' && (
          <div className="grid grid-cols-2 gap-2">
            {options.map(opt => {
              const selected = (answers[q.id] || []).includes(opt);
              return (
                <Button
                  key={opt}
                  type="button"
                  variant={selected ? 'default' : 'outline'}
                  className="h-12 text-sm"
                  onClick={() => {
                    const current = answers[q.id] || [];
                    const newVal = selected ? current.filter(v => v !== opt) : [...current, opt];
                    handleAnswer(q.id, newVal, q);
                  }}
                >
                  {opt}
                </Button>
              );
            })}
          </div>
        )}

        {q.question_type === 'text' && (
          <Input
            value={answers[q.id] || ''}
            onChange={e => handleAnswer(q.id, e.target.value, q)}
            className="h-12 text-base"
          />
        )}

        {q.question_type === 'number' && (
          <Input
            type="number"
            value={answers[q.id] || ''}
            onChange={e => handleAnswer(q.id, e.target.value, q)}
            className="h-12 text-base"
          />
        )}

        {q.question_type === 'rating' && (
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(r => (
              <Button
                key={r}
                type="button"
                variant={answers[q.id] === r ? 'default' : 'outline'}
                className="w-12 h-12 text-lg font-bold"
                onClick={() => handleAnswer(q.id, r, q)}
              >
                {r}
              </Button>
            ))}
          </div>
        )}

        {/* Sub-fields if defined and answer is set */}
        {answers[q.id] && subFields.length > 0 && (
          <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            {subFields.map((sf, idx) => (
              <div key={idx}>
                <Label className="text-xs font-medium text-blue-900">{sf.name}</Label>
                {sf.type === 'number' && (
                  <Input type="number" value={answers[`${q.id}_${sf.name}`] || ''} onChange={e => handleAnswer(`${q.id}_${sf.name}`, e.target.value, q)} className="mt-1 h-9 text-sm" />
                )}
                {sf.type === 'text' && (
                  <Input type="text" value={answers[`${q.id}_${sf.name}`] || ''} onChange={e => handleAnswer(`${q.id}_${sf.name}`, e.target.value, q)} className="mt-1 h-9 text-sm" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* AI Explanation for concerning answers */}
        {(() => {
          const val = answers[q.id];
          if (!val) return null;
          const key = `${q.id}_${JSON.stringify(val)}`;
          const exp = explanations[key];
          if (!exp) return null;
          if (exp === 'loading') return (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              Analyzing answer...
            </div>
          );
          return (
            <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <Info className="w-3 h-3 shrink-0 mt-0.5 text-amber-600" />
              <span>{exp}</span>
            </div>
          );
        })()}

        {/* Per-question photo capture for all question types */}
        {q.question_type !== 'photo' && (
          <div className="mt-2">
            {(() => {
              const required = isPhotoRequiredForAnswer(q, answers[q.id]);
              const photoCount = (answers[`${q.id}_photos`] || []).length;
              const minNeeded = q.minimum_photos || 1;
              const mode = resolvePhotoRequirementMode(q);
              if (!required) return null;
              const satisfied = photoCount >= minNeeded;
              if (satisfied) return (
                <div className="flex items-center gap-2 px-3 py-1.5 mb-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {photoCount} photo(s) attached — requirement met.
                </div>
              );
              return (
                <div className="px-3 py-2 mb-2 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-800">
                  <p className="font-semibold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Photos Required</p>
                  <p className="mt-0.5">This question requires at least {minNeeded} photo(s) before continuing ({mode.replace(/_/g, ' ')}).</p>
                  <p className="mt-0.5 text-amber-600">{photoCount}/{minNeeded} attached.</p>
                </div>
              );
            })()}
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors text-xs text-muted-foreground">
                <Camera className={`w-4 h-4 ${photoUploadCount > 0 ? 'animate-pulse' : ''}`} /> {photoUploadCount > 0 ? 'Uploading…' : 'Take Photo'}
                <input type="file" accept="image/*" capture="environment" multiple className="hidden"
                   onChange={async (e) => {
                     const files = Array.from(e.target.files);
                     const urls = await uploadPhotoFiles(files);
                     if (urls.length) {
                       const existing = answers[`${q.id}_photos`] || [];
                       handleAnswer(`${q.id}_photos`, [...existing, ...urls]);
                       setPhotos(prev => [...prev, ...urls]);
                       toast.success(`${urls.length} photo(s) added`);
                     }
                     e.target.value = '';
                   }}
                />
              </label>
              <label className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors text-xs text-muted-foreground">
                <Camera className="w-4 h-4" /> Upload Photo
                <input type="file" accept="image/*" multiple className="hidden"
                   onChange={async (e) => {
                     const files = Array.from(e.target.files);
                     const urls = await uploadPhotoFiles(files);
                     if (urls.length) {
                       const existing = answers[`${q.id}_photos`] || [];
                       handleAnswer(`${q.id}_photos`, [...existing, ...urls]);
                       setPhotos(prev => [...prev, ...urls]);
                       toast.success(`${urls.length} photo(s) added`);
                     }
                     e.target.value = '';
                   }}
                />
              </label>
            </div>
            {(answers[`${q.id}_photos`] || []).length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                {(answers[`${q.id}_photos`] || []).map((url, i) => (
                  <div key={i} className="relative">
                    <img src={url} alt={`Photo ${i + 1}`} className="w-full h-24 object-cover rounded-lg" />
                    <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 hover:opacity-100 bg-black/40 rounded-lg transition-opacity">
                      <button type="button"
                        className="bg-white text-black rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-gray-200"
                        onClick={async () => {
                          try {
                            const newUrl = await rotateImageByDegrees(url, 90);
                            const updated = [...(answers[`${q.id}_photos`] || [])];
                            updated[i] = newUrl;
                            handleAnswer(`${q.id}_photos`, updated);
                          } catch(e) { toast.error('Rotation failed'); }
                        }}
                      >↻</button>
                      <button type="button"
                        className="bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                        onClick={() => handleAnswer(`${q.id}_photos`, (answers[`${q.id}_photos`] || []).filter((_, idx) => idx !== i))}
                      >×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {q.question_type === 'photo' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col items-center gap-2 p-4 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
                <Camera className="w-6 h-6 text-muted-foreground" />
                <span className="text-xs text-muted-foreground text-center">{photoUploadCount > 0 ? 'Uploading…' : 'Take Photo'}</span>
                <input
                   type="file"
                   accept="image/*"
                   capture="environment"
                   multiple
                   className="hidden"
                   onChange={async (e) => {
                      const files = Array.from(e.target.files);
                      const urls = await uploadPhotoFiles(files);
                      if (urls.length) {
                        handleAnswer(q.id, [...(answers[q.id] || []), ...urls]);
                        setPhotos(prev => [...prev, ...urls]);
                        toast.success(`${urls.length} photo(s) added`);
                      }
                      e.target.value = '';
                    }}
                   />
                </label>
                <label className="flex flex-col items-center gap-2 p-4 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
                 <Camera className="w-6 h-6 text-muted-foreground" />
                 <span className="text-xs text-muted-foreground text-center">{photoUploadCount > 0 ? 'Uploading…' : 'Upload from Library'}</span>
                 <input
                   type="file"
                   accept="image/*"
                   multiple
                   className="hidden"
                   onChange={async (e) => {
                      const files = Array.from(e.target.files);
                      const urls = await uploadPhotoFiles(files);
                      if (urls.length) {
                        handleAnswer(q.id, [...(answers[q.id] || []), ...urls]);
                        setPhotos(prev => [...prev, ...urls]);
                        toast.success(`${urls.length} photo(s) added`);
                      }
                      e.target.value = '';
                    }}
                  />
              </label>
            </div>
            {(answers[q.id] || []).length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                {(answers[q.id] || []).map((url, i) => (
                  <div key={i} className="relative">
                    <img src={url} alt={`Photo ${i + 1}`} className="w-full h-24 object-cover rounded-lg" />
                    <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 hover:opacity-100 bg-black/40 rounded-lg transition-opacity">
                      <button type="button"
                        className="bg-white text-black rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-gray-200"
                        onClick={async () => {
                          try {
                            const newUrl = await rotateImageByDegrees(url, 90);
                            const updated = [...(answers[q.id] || [])];
                            updated[i] = newUrl;
                            handleAnswer(q.id, updated);
                          } catch(e) { toast.error('Rotation failed'); }
                        }}
                      >↻</button>
                      <button
                        type="button"
                        className="bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                        onClick={() => handleAnswer(q.id, (answers[q.id] || []).filter((_, idx) => idx !== i))}
                      >×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const currentSectionKey = allSections[currentSection];
  const progress = ((currentSection + 1) / allSections.length) * 100;
  const visibleQuestions = sortedQuestions.filter(q => isVisible(q));

  return (
    <div className="space-y-4 max-w-xl mx-auto pb-24">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">Interior Inspection Form</h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Interior</span>
          </div>
          <p className="text-sm text-muted-foreground">Complete the interior inspection step by step</p>
        </div>
        {isDevToolsVisible && selectedJobId && !submitted && (
          <ResetResponsesButton onReset={handleResetResponses} disabled={saving || submitting} />
        )}
      </div>

      {/* Live Findings Banner */}
      {findings.length > 0 && (
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="bg-orange-50 border border-orange-200 rounded-xl">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-orange-200">
              <ShieldAlert className="w-4 h-4 text-orange-600" />
              <span className="text-sm font-semibold text-orange-800">{findings.length} Finding{findings.length > 1 ? 's' : ''} Detected</span>
            </div>
            <div className="divide-y divide-orange-100">
              {findings.map((f, i) => {
                const s = SEVERITY_STYLES[f.severity] || SEVERITY_STYLES.info;
                return (
                  <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                    <span className={`mt-0.5 px-1.5 py-0.5 rounded text-xs font-bold ${s.bg} ${s.text} shrink-0`}>{s.label}</span>
                    <div>
                      <p className="text-sm font-medium text-orange-900">{f.finding_type}</p>
                      {f.suggested_repair && <p className="text-xs text-orange-700 mt-0.5">→ {f.suggested_repair}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Step {currentSection + 1} of {allSections.length}</span>
          <span>{SECTION_LABELS[currentSectionKey] || currentSectionKey?.replace(/_/g, ' ')}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Job Selection */}
      {!selectedJobId && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 space-y-3">
            <Label className="font-medium">Select a Job</Label>
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scheduled jobs found</p>
            ) : (
              <div className="space-y-2">
                {jobs.map(job => (
                  <Button
                    key={job.id}
                    variant="outline"
                    className="w-full h-auto py-3 px-4 justify-start text-left"
                    onClick={() => setSelectedJobId(job.id)}
                  >
                    <div>
                      <p className="font-medium">{job.customer_name}</p>
                      <p className="text-xs text-muted-foreground">{job.address} • {fmtDate(job.service_date)}</p>
                    </div>
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Form Sections */}
      {selectedJobId && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 space-y-5">
            {currentSectionKey === 'property_info' && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Property Information</h2>
                {selectedJob && (
                  <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                    <p><span className="font-medium">Customer:</span> {selectedJob.customer_name}</p>
                    <p><span className="font-medium">Address:</span> {selectedJob.address}</p>
                    <p><span className="font-medium">Date:</span> {fmtDate(selectedJob.service_date)}</p>
                  </div>
                )}
                {setupData && (
                  <div className="p-3 bg-violet-50 border border-violet-200 rounded-lg text-sm space-y-1">
                    <p className="font-medium text-violet-900 flex items-center gap-1">📋 From Inspection Setup</p>
                    <p><span className="font-medium text-violet-800">Inspection Level:</span> {setupData.inspection_level?.replace('_', ' ').toUpperCase() || 'N/A'}</p>
                    {setupData.customer_concerns && <p><span className="font-medium text-violet-800">Customer Concerns:</span> {setupData.customer_concerns}</p>}
                    {setupData.access_issues && <p><span className="font-medium text-violet-800">Access Issues:</span> {setupData.access_issues}</p>}
                    {setupData.safety_hazards && <p><span className="font-medium text-violet-800">Safety Hazards:</span> {setupData.safety_hazards}</p>}
                    {setupData.front_photo && (
                      <div className="mt-2">
                        <img src={setupData.front_photo} alt="Property Front" className="w-full h-32 object-cover rounded-lg" />
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-3">
                  <div>
                    <Label>Property Type</Label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      {['residential', 'commercial'].map(t => (
                        <Button key={t} variant={propertyType === t ? 'default' : 'outline'} className="h-12 capitalize" onClick={() => setPropertyType(t)}>{t}</Button>
                      ))}
                    </div>
                  </div>
                  <ResolvedTypeField label="Chimney Type" value={chimneyType} />
                  <ResolvedTypeField label="Appliance Type" value={applianceType} />
                </div>
              </div>
            )}

            {currentSectionKey === 'notes_photos' && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Notes & Photos</h2>
                <div>
                  <Label>Technician Notes</Label>
                  <Textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Additional observations..."
                    rows={4}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Photos</Label>
                  <div className="mt-2">
                    <label className="flex flex-col items-center gap-2 p-6 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
                      <Camera className="w-8 h-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Tap to take or upload photos</span>
                      <input type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={handlePhotoUpload} />
                    </label>
                  </div>
                  {photos.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      {photos.map((url, i) => (
                        <div key={i} className="relative">
                          <img src={url} alt={`Photo ${i + 1}`} className="w-full h-24 object-cover rounded-lg" />
                          <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 hover:opacity-100 bg-black/40 rounded-lg transition-opacity">
                            <button type="button"
                              className="bg-white text-black rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-gray-200"
                              onClick={async () => {
                                try {
                                  const newUrl = await rotateImageByDegrees(url, 90);
                                  setPhotos(prev => prev.map((p, idx) => idx === i ? newUrl : p));
                                } catch(e) { toast.error('Rotation failed'); }
                              }}
                            >↻</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentSectionKey === 'questions' && (
              <div className="space-y-5">
                <h2 className="text-lg font-semibold">Inspection Questions</h2>
                {visibleQuestions.length === 0 && (
                  <p className="text-sm text-muted-foreground">No questions found. Add questions in the admin Rules Engine.</p>
                )}
                {visibleQuestions.map(q => renderQuestion(q))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      {selectedJobId && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-background border-t p-4 flex items-center gap-3">
          <Button
            variant="outline"
            onClick={goBack}
            className="h-12 text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => setCurrentSection(s => Math.max(0, s - 1))}
            disabled={currentSection === 0}
            className="h-12"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>

          <div className="flex-1" />

          <Button variant="outline" onClick={handleSaveDraft} disabled={saving} className="h-12">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Save
          </Button>

          {currentSection < allSections.length - 1 ? (
            <Button onClick={() => setCurrentSection(s => s + 1)} className="h-12 bg-accent text-accent-foreground hover:bg-accent/90">
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={() => handleSubmit()} disabled={submitting} className="h-12 bg-green-600 hover:bg-green-700 text-white">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
              Submit
            </Button>
          )}
          </div>
          )}

          <PhotoValidationDialog
          open={photoValidationOpen}
          onClose={() => { setPhotoValidationOpen(false); setPhotoOverrideCallback(null); }}
          missingItems={missingPhotos}
          moduleName="Interior Inspection"
          onOverrideSubmit={async (reason) => {
          setPhotoValidationOpen(false);
          if (photoOverrideCallback) {
            await photoOverrideCallback(reason);
          }
          setPhotoOverrideCallback(null);
          }}
          />
          </div>
          );
          }