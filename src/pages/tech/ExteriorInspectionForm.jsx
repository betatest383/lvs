import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { rotateImageByDegrees } from '@/utils/rotateImage';
import { useInspectionReturn } from '@/hooks/useInspectionReturn';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ChevronLeft, ChevronRight, Save, Send, Camera, Loader2, CheckCircle2, ShieldAlert, Info } from 'lucide-react';
import { toast } from 'sonner';
import { runRulesEngine, SEVERITY_STYLES } from '@/lib/inspectionRulesEngine';
import { getMissingRequiredPhotos } from '@/lib/photoValidation';
import PhotoValidationDialog from '@/components/inspection/PhotoValidationDialog';
import moment from 'moment';
import { stableSortQuestions, computeConditionalFormOrder } from '@/lib/inspectionQuestionOrdering';
import * as exifr from 'exifr';
import { getTransitiveDependents, clearAnswersForQuestions, photosForQuestions } from '@/lib/inspectionAnswerClear';
import ClearAnswerButton from '@/components/inspection/ClearAnswerButton';
import ResetResponsesButton from '@/components/inspection/ResetResponsesButton';
import { useDeveloperMode } from '@/hooks/useDeveloperMode';

// Normalize EXIF orientation for iPhone/iPad photos
async function normalizeImageOrientation(file) {
  try {
    console.log(`[EXIF] Original: ${file.name} | type: ${file.type} | size: ${file.size} bytes`);
    
    const exif = await exifr.parse(file);
    const orientation = exif?.Orientation || 1;
    console.log(`[EXIF] Orientation: ${orientation}`);
    
    // Always normalize through canvas to ensure all uploads are consistent
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    return new Promise((resolve) => {
      img.onload = () => {
        let width = img.width, height = img.height;
        console.log(`[EXIF] Image dimensions: ${width}x${height}`);
        
        // Swap dimensions for 90/270 degree rotations
        if ([5, 6, 7, 8].includes(orientation)) {
          [width, height] = [height, width];
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Apply rotation and flip
        switch (orientation) {
          case 2: ctx.scale(-1, 1); ctx.drawImage(img, -width, 0); break;
          case 3: ctx.scale(-1, -1); ctx.drawImage(img, -width, -height); break;
          case 4: ctx.scale(1, -1); ctx.drawImage(img, 0, -height); break;
          case 5: ctx.scale(-1, 1); ctx.rotate(-Math.PI / 2); ctx.drawImage(img, -width, 0); break;
          case 6: ctx.rotate(Math.PI / 2); ctx.drawImage(img, 0, -height); break;
          case 7: ctx.scale(-1, 1); ctx.rotate(Math.PI / 2); ctx.drawImage(img, -height, -height); break;
          case 8: ctx.rotate(-Math.PI / 2); ctx.drawImage(img, -width, 0); break;
          default: ctx.drawImage(img, 0, 0);
        }
        
        canvas.toBlob((blob) => {
          const correctedFile = new File(
            [blob],
            `normalized-${Date.now()}.jpg`,
            { type: 'image/jpeg' }
          );
          console.log(`[EXIF] Corrected: ${correctedFile.name} | type: ${correctedFile.type} | size: ${correctedFile.size} bytes | canvas: ${canvas.width}x${canvas.height}`);
          resolve(correctedFile);
        }, 'image/jpeg', 0.9);
      };
      
      img.src = URL.createObjectURL(file);
    });
  } catch (e) {
    console.warn(`[EXIF] Parse error, returning original:`, e.message);
    return file;
  }
}

const fmtDate = (d) => d ? moment.utc(d).format('MMM D, YYYY') : '';

const SECTIONS = ['questions', 'notes_photos'];
const SECTION_LABELS = {
  questions: 'Inspection Questions',
  notes_photos: 'Notes & Photos',
};

export default function ExteriorInspectionForm() {
  const [user, setUser] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const { goBack } = useInspectionReturn(selectedJobId);
  const [selectedJob, setSelectedJob] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [photos, setPhotos] = useState([]);
  const [notes, setNotes] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [chimneyType, setChimneyType] = useState('');
  const [applianceType, setApplianceType] = useState('');
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

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      Promise.all([
        base44.entities.Job.filter({ status: 'scheduled' }, '-service_date'),
        base44.entities.Job.filter({ status: 'inspection_complete' }, '-service_date'),
      ]).then(([scheduled, inProgress]) => setJobs([...scheduled, ...inProgress]));
    });
    // Load exterior + both questions (exclude inspection_setup module — those belong to Inspection Setup)
    base44.entities.InspectionQuestion.filter({ is_active: true }, 'sort_order').then(qs => {
      const exterior = qs.filter(q => (q.inspection_type === 'exterior' || q.inspection_type === 'both') && q.inspection_module !== 'inspection_setup');
      const validIds = new Set(exterior.map(q => q.id));
      // Drop questions whose visibility rule references a parent not on this form
      const filtered = exterior.filter(q => {
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
      setRules(rs.filter(r => !r.inspection_type || r.inspection_type === 'exterior' || r.inspection_type === 'both'));
    });
  }, []);

  // Load InspectionSetup data when job is selected
  useEffect(() => {
    if (!selectedJobId) return;
    base44.entities.InspectionSetup.filter({ job_id: selectedJobId }).then(setups => {
      if (setups.length > 0) setSetupData(setups[0]);
    }).catch(() => {});
  }, [selectedJobId]);

  useEffect(() => {
    if (presetJobId) setSelectedJobId(presetJobId);
  }, [presetJobId]);

  useEffect(() => {
    if (selectedJobId) {
      const job = jobs.find(j => j.id === selectedJobId);
      setSelectedJob(job || null);
    }
  }, [selectedJobId, jobs]);

  // Question render order is computed below, after isVisible is defined, because
  // dynamic placement of conditional follow-ups depends on current visibility.

  const findings = useMemo(() => {
    if (!rules.length) return [];
    return runRulesEngine(rules, answers, { chimney_type: chimneyType, property_type: propertyType, appliance_type: applianceType });
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
      if (rule.conditions) {
        const applicable = rule.conditions.filter(c => validIds.has(c.question_id));
        if (applicable.length === 0) return false;
        const fn = rule.logic === 'and' ? 'every' : 'some';
        return applicable[fn](c => evalCondition(c, answers));
      }
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

  const CONCERNING_VALUES = ['unsafe', 'failed', 'deficient', 'needs repair', 'water damage', 'cracked', 'improper', 'yes', 'poor', 'deteriorated', 'missing', 'damaged'];
  const isConcerning = (val) => {
    if (!val) return false;
    const v = String(val).toLowerCase().trim();
    return CONCERNING_VALUES.some(c => v === c || v.includes(c));
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
          inspection_type: 'exterior',
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
    setChimneyType('');
    setApplianceType('');
    setExplanations({});
    if (draftId) {
      try {
        await base44.entities.InspectionSubmission.update(draftId, {
          answers: '{}',
          photos: [],
          technician_notes: '',
          property_type: '',
          chimney_type: '',
          appliance_type: '',
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
          inspection_type: 'exterior',
          reset_by: user?.email,
          reset_at: new Date().toISOString(),
        }),
        performed_by: user?.full_name || user?.email || '',
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    } catch { /* non-blocking */ }
    toast.success('All responses cleared');
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      const correctedFile = await normalizeImageOrientation(file);
      const { file_url } = await base44.integrations.Core.UploadFile({ file: correctedFile });
      setPhotos(prev => [...prev, file_url]);
    }
    toast.success(`${files.length} photo(s) uploaded`);
  };

  const buildData = (status) => ({
    job_id: selectedJobId,
    customer_id: selectedJob?.customer_id || '',
    customer_name: selectedJob?.customer_name || '',
    technician_email: user.email,
    technician_name: user.full_name,
    address: selectedJob?.address || '',
    date_started: new Date().toISOString(),
    inspection_type: 'exterior',
    status,
    answers: JSON.stringify(answers),
    photos,
    technician_notes: notes,
    property_type: propertyType,
    chimney_type: chimneyType,
    appliance_type: applianceType,
  });

  const handleSaveDraft = async () => {
    if (!selectedJobId) { toast.error('Please select a job first'); return; }
    setSaving(true);
    const data = buildData('draft');
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
    if (!selectedJobId) { toast.error('Please select a job first'); return; }

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
    const answersWithMeta = { ...answers, __visible_question_ids: visibleIds, __photo_override_reason: overrideReason || '' };
    const baseData = buildData('submitted');
    const data = {
      ...baseData,
      answers: JSON.stringify(answersWithMeta),
      technician_notes: (baseData.technician_notes || '') + (overrideReason ? `\n\n[Photo Override] ${overrideReason}` : ''),
      date_submitted: new Date().toISOString(),
    };
    let submissionId = draftId;
    if (draftId) {
      await base44.entities.InspectionSubmission.update(draftId, data);
    } else {
      const created = await base44.entities.InspectionSubmission.create(data);
      submissionId = created.id;
    }
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
    setSubmitting(false);
    setSubmitted(true);
    toast.success('Exterior inspection submitted!');
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold">Exterior Inspection Submitted!</h2>
        <p className="text-muted-foreground text-center max-w-sm">Your exterior inspection has been submitted for review.</p>
        <Button onClick={goBack} className="mt-4">Back to Job Hub</Button>
      </div>
    );
  }

  const renderQuestion = (q) => {
    if (!isVisible(q)) return null;
    const options = q.answer_options ? q.answer_options.split(',').map(o => o.trim()) : [];
    let subFields = [];
    try { subFields = JSON.parse(q.sub_fields || '[]'); } catch(e) {}

    return (
      <div key={q.id} className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <Label className="text-sm font-medium">
            {q.question_text}
            {q.required_flag && <span className="text-destructive ml-1">*</span>}
          </Label>
          <ClearAnswerButton
            dependentsCount={dependentsCountMap[q.id] || 0}
            disabled={submitted || !hasAnswered(q)}
            onConfirm={() => handleClearAnswer(q)}
          />
        </div>
        {q.help_text && <p className="text-xs text-muted-foreground">{q.help_text}</p>}

        {q.question_type === 'yes_no' && (
          <div className="grid grid-cols-2 gap-2">
            {['Yes', 'No'].map(opt => (
              <Button key={opt} type="button" variant={answers[q.id] === opt ? 'default' : 'outline'} className="h-12 text-base" onClick={() => handleAnswer(q.id, opt, q)}>{opt}</Button>
            ))}
          </div>
        )}
        {q.question_type === 'select' && (
          <div className="grid grid-cols-2 gap-2">
            {options.map(opt => (
              <Button key={opt} type="button" variant={answers[q.id] === opt ? 'default' : 'outline'} className="h-12 text-sm" onClick={() => handleAnswer(q.id, opt, q)}>{opt}</Button>
            ))}
          </div>
        )}
        {q.question_type === 'multi_select' && (
          <div className="grid grid-cols-2 gap-2">
            {options.map(opt => {
              const selected = (answers[q.id] || []).includes(opt);
              return (
                <Button key={opt} type="button" variant={selected ? 'default' : 'outline'} className="h-12 text-sm"
                  onClick={() => {
                    const current = answers[q.id] || [];
                    handleAnswer(q.id, selected ? current.filter(v => v !== opt) : [...current, opt], q);
                  }}>{opt}</Button>
              );
            })}
          </div>
        )}
        {q.question_type === 'text' && (
          <Input value={answers[q.id] || ''} onChange={e => handleAnswer(q.id, e.target.value, q)} className="h-12 text-base" />
        )}
        {q.question_type === 'number' && (
          <Input type="number" value={answers[q.id] || ''} onChange={e => handleAnswer(q.id, e.target.value, q)} className="h-12 text-base" />
        )}
        {q.question_type === 'rating' && (
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(r => (
              <Button key={r} type="button" variant={answers[q.id] === r ? 'default' : 'outline'} className="w-12 h-12 text-lg font-bold" onClick={() => handleAnswer(q.id, r, q)}>{r}</Button>
            ))}
          </div>
        )}

        {/* AI Explanation */}
        {(() => {
          const val = answers[q.id];
          if (!val) return null;
          const key = `${q.id}_${JSON.stringify(val)}`;
          const exp = explanations[key];
          if (!exp) return null;
          if (exp === 'loading') return (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />Analyzing answer...
            </div>
          );
          return (
            <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <Info className="w-3 h-3 shrink-0 mt-0.5 text-amber-600" /><span>{exp}</span>
            </div>
          );
        })()}

        {/* Sub-fields if defined */}
        {subFields.length > 0 && (
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

        {/* Per-question photo capture */}
        {q.question_type !== 'photo' && (
          <div className="mt-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors text-xs text-muted-foreground">
                <Camera className="w-4 h-4" /> Take Photo
                <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={async (e) => {
                   const files = Array.from(e.target.files);
                   const urls = [];
                   for (const file of files) {
                     const correctedFile = await normalizeImageOrientation(file);
                     console.log(`[PHOTO-Q] Uploading corrected file:`, correctedFile.name);
                     const { file_url } = await base44.integrations.Core.UploadFile({ file: correctedFile });
                     console.log(`[PHOTO-Q] File URL:`, file_url);
                     urls.push(file_url);
                     setPhotos(prev => [...prev, file_url]);
                   }
                   handleAnswer(`${q.id}_photos`, [...(answers[`${q.id}_photos`] || []), ...urls]);
                   toast.success(`${files.length} photo(s) added`);
                 }} />
              </label>
              <label className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors text-xs text-muted-foreground">
                <Camera className="w-4 h-4" /> Upload Photo
                <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                   const files = Array.from(e.target.files);
                   const urls = [];
                   for (const file of files) {
                     const correctedFile = await normalizeImageOrientation(file);
                     console.log(`[PHOTO-Q] Uploading corrected file:`, correctedFile.name);
                     const { file_url } = await base44.integrations.Core.UploadFile({ file: correctedFile });
                     console.log(`[PHOTO-Q] File URL:`, file_url);
                     urls.push(file_url);
                     setPhotos(prev => [...prev, file_url]);
                   }
                   handleAnswer(`${q.id}_photos`, [...(answers[`${q.id}_photos`] || []), ...urls]);
                   toast.success(`${files.length} photo(s) added`);
                 }} />
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
                       <button type="button" className="bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                         onClick={() => handleAnswer(`${q.id}_photos`, (answers[`${q.id}_photos`] || []).filter((_, idx) => idx !== i))}>×</button>
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
                <span className="text-xs text-muted-foreground text-center">Take Photo</span>
                <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={async (e) => {
                   const files = Array.from(e.target.files);
                   for (const file of files) {
                     const correctedFile = await normalizeImageOrientation(file);
                     console.log(`[PHOTO-TYPE] Uploading corrected file:`, correctedFile.name);
                     const { file_url } = await base44.integrations.Core.UploadFile({ file: correctedFile });
                     console.log(`[PHOTO-TYPE] File URL:`, file_url);
                     handleAnswer(q.id, [...(answers[q.id] || []), file_url]);
                     setPhotos(prev => [...prev, file_url]);
                   }
                   toast.success(`${files.length} photo(s) added`);
                 }} />
                </label>
                <label className="flex flex-col items-center gap-2 p-4 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
                 <Camera className="w-6 h-6 text-muted-foreground" />
                 <span className="text-xs text-muted-foreground text-center">Upload from Library</span>
                 <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                   const files = Array.from(e.target.files);
                   for (const file of files) {
                     const correctedFile = await normalizeImageOrientation(file);
                     console.log(`[PHOTO-TYPE] Uploading corrected file:`, correctedFile.name);
                     const { file_url } = await base44.integrations.Core.UploadFile({ file: correctedFile });
                     console.log(`[PHOTO-TYPE] File URL:`, file_url);
                     handleAnswer(q.id, [...(answers[q.id] || []), file_url]);
                     setPhotos(prev => [...prev, file_url]);
                   }
                   toast.success(`${files.length} photo(s) added`);
                 }} />
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
                        <button type="button" className="bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                          onClick={() => handleAnswer(q.id, (answers[q.id] || []).filter((_, idx) => idx !== i))}>×</button>
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

  const currentSectionKey = SECTIONS[currentSection];
  const progress = ((currentSection + 1) / SECTIONS.length) * 100;
  const visibleQuestions = sortedQuestions.filter(q => isVisible(q));

  return (
    <div className="space-y-4 max-w-xl mx-auto pb-24">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">Exterior Inspection Form</h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-700">Exterior</span>
          </div>
          <p className="text-sm text-muted-foreground">Complete the exterior inspection step by step</p>
        </div>
        {isDevToolsVisible && selectedJobId && !submitted && (
          <ResetResponsesButton onReset={handleResetResponses} disabled={saving || submitting} />
        )}
      </div>

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

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Step {currentSection + 1} of {SECTIONS.length}</span>
          <span>{SECTION_LABELS[currentSectionKey]}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-sky-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {!selectedJobId && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 space-y-3">
            <Label className="font-medium">Select a Job</Label>
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scheduled jobs found</p>
            ) : (
              <div className="space-y-2">
                {jobs.map(job => (
                  <Button key={job.id} variant="outline" className="w-full h-auto py-3 px-4 justify-start text-left" onClick={() => setSelectedJobId(job.id)}>
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

      {selectedJobId && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 space-y-5">
            {currentSectionKey === 'notes_photos' && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Notes & Photos</h2>
                <div>
                  <Label>Technician Notes</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional observations..." rows={4} className="mt-1" />
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
                <h2 className="text-lg font-semibold">Exterior Inspection Questions</h2>
                {setupData && (
                  <div className="p-3 bg-violet-50 border border-violet-200 rounded-lg text-sm space-y-1">
                    <p className="font-medium text-violet-900">📋 From Inspection Setup</p>
                    <p><span className="font-medium text-violet-800">Inspection Level:</span> {setupData.inspection_level?.replace('_', ' ').toUpperCase() || 'N/A'}</p>
                    {setupData.customer_concerns && <p><span className="font-medium text-violet-800">Customer Concerns:</span> {setupData.customer_concerns}</p>}
                    {setupData.safety_hazards && <p><span className="font-medium text-violet-800">Safety Hazards:</span> {setupData.safety_hazards}</p>}
                  </div>
                )}
                {visibleQuestions.length === 0 && (
                  <p className="text-sm text-muted-foreground">No exterior questions configured yet. Add questions in the admin Questions Manager and set their type to "exterior" or "both".</p>
                )}
                {visibleQuestions.map(q => renderQuestion(q))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedJobId && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-background border-t p-4 flex items-center gap-3">
          <Button variant="outline" onClick={goBack} className="h-12 text-destructive border-destructive/30 hover:bg-destructive/10">
            Cancel
          </Button>
          <Button variant="outline" onClick={() => setCurrentSection(s => Math.max(0, s - 1))} disabled={currentSection === 0} className="h-12">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={handleSaveDraft} disabled={saving} className="h-12">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Save
          </Button>
          {currentSection < SECTIONS.length - 1 ? (
            <Button onClick={() => setCurrentSection(s => s + 1)} className="h-12 bg-sky-600 hover:bg-sky-700 text-white">
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
        moduleName="Exterior Inspection"
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