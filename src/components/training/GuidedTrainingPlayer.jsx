import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  ChevronLeft, ChevronRight, CheckCircle2, Save, GraduationCap,
  Lightbulb, AlertTriangle, Camera, FileCheck, Paperclip, Loader2
} from 'lucide-react';
import { toast } from 'sonner';

const ALLOWED_EVIDENCE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_EVIDENCE_SIZE = 10 * 1024 * 1024;

export default function GuidedTrainingPlayer({ guide, progress, taskId, onComplete }) {
  const navigate = useNavigate();
  const steps = (() => {
    try { return JSON.parse(guide.training_steps || '[]'); } catch { return []; }
  })();

  const [currentStep, setCurrentStep] = useState(progress?.current_step || 0);
  const [stepProgress, setStepProgress] = useState(
    (() => {
      try { return JSON.parse(progress?.step_progress_json || '[]'); } catch { return []; }
    })()
  );
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [evidenceUrls, setEvidenceUrls] = useState(progress?.evidence_urls || []);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  const totalSteps = steps.length;
  const step = steps[currentStep];
  const isLastStep = currentStep === totalSteps - 1;
  const completedCount = stepProgress.filter(s => s.completed).length;
  const progressPct = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  const markStepComplete = (idx, completed) => {
    const newProgress = stepProgress.map((s, i) =>
      i === idx ? { ...s, completed, completed_at: completed ? new Date().toISOString() : null } : s
    );
    setStepProgress(newProgress);
  };

  const handleSaveProgress = async () => {
    setSaving(true);
    try {
      await base44.functions.invoke('manageTraining', {
        action: 'save_progress',
        trainingId: guide.id,
        currentStep,
        stepProgressJson: JSON.stringify(stepProgress),
      });
      toast.success('Progress saved');
    } catch {
      toast.error('Failed to save progress');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const res = await base44.functions.invoke('manageTraining', {
        action: 'complete_training',
        trainingId: guide.id,
        stepProgressJson: JSON.stringify(stepProgress),
      });
      if (res.data?.success) {
        toast.success('Training completed!');
        if (onComplete) onComplete();
        else navigate(`/lvcos/training/detail/${guide.id}`);
      } else {
        toast.error(res.data?.error || 'Failed to complete training');
      }
    } catch {
      toast.error('Failed to complete training');
    } finally {
      setCompleting(false);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      handleSaveProgressSilent(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (!isLastStep) {
      markStepComplete(currentStep, true);
      setCurrentStep(currentStep + 1);
      handleSaveProgressSilent(currentStep + 1);
    }
  };

  const handleEvidenceUpload = async (file) => {
    if (!file) return;
    if (!ALLOWED_EVIDENCE_TYPES.includes(file.type)) {
      toast.error('Only image files (JPEG, PNG, WebP, GIF) are allowed');
      return;
    }
    if (file.size > MAX_EVIDENCE_SIZE) {
      toast.error('File size must be under 10MB');
      return;
    }
    setUploadingEvidence(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await base44.functions.invoke('manageTraining', {
        action: 'upload_file',
        trainingId: guide.id,
        purpose: 'evidence',
        fileDataUrl: dataUrl,
      });
      if (res.data?.success && res.data.file_url) {
        const newUrls = [...evidenceUrls, res.data.file_url];
        setEvidenceUrls(newUrls);
        await base44.functions.invoke('manageTraining', {
          action: 'save_progress',
          trainingId: guide.id,
          evidenceUrls: newUrls,
        });
        toast.success('Evidence uploaded');
      } else {
        toast.error(res.data?.error || 'Upload failed');
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Upload failed');
    } finally {
      setUploadingEvidence(false);
    }
  };

  const handleSaveProgressSilent = async (stepIdx) => {
    const newProgress = stepProgress.map((s, i) =>
      i === currentStep ? { ...s, completed: true, completed_at: new Date().toISOString() } : s
    );
    try {
      await base44.functions.invoke('manageTraining', {
        action: 'save_progress',
        trainingId: guide.id,
        currentStep: stepIdx,
        stepProgressJson: JSON.stringify(newProgress),
      });
    } catch { /* silent */ }
  };

  if (!step) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          This training guide has no steps configured.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-accent" />
              <div>
                <h2 className="text-lg font-bold">{guide.title || guide.training_name}</h2>
                <p className="text-xs text-muted-foreground">
                  {guide.training_number || guide.training_id} · Step {currentStep + 1} of {totalSteps}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Progress</p>
              <p className="text-sm font-bold">{progressPct}%</p>
            </div>
          </div>
          <Progress value={progressPct} className="mt-3 h-2" />
        </CardContent>
      </Card>

      {/* Step Content */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div>
            <span className="text-xs font-medium text-accent">Step {step.step_number}</span>
            <h3 className="text-xl font-bold mt-0.5">{step.title}</h3>
          </div>

          {step.instructions && (
            <div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{step.instructions}</p>
            </div>
          )}

          {step.screenshot_url && (
            <div className="rounded-lg overflow-hidden border">
              <img src={step.screenshot_url} alt={`Step ${step.step_number} screenshot`} className="w-full" />
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            {step.example && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Lightbulb className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-semibold text-blue-800">Example</span>
                </div>
                <p className="text-sm text-blue-900">{step.example}</p>
              </div>
            )}
            {step.common_mistake && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-semibold text-amber-800">Common Mistake</span>
                </div>
                <p className="text-sm text-amber-900">{step.common_mistake}</p>
              </div>
            )}
            {step.required_evidence && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 sm:col-span-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <FileCheck className="w-4 h-4 text-green-600" />
                  <span className="text-xs font-semibold text-green-800">Required Evidence</span>
                </div>
                <p className="text-sm text-green-900">{step.required_evidence}</p>
              </div>
            )}
          </div>

          {/* Step completion checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={stepProgress[currentStep]?.completed || false}
              onChange={e => markStepComplete(currentStep, e.target.checked)}
              className="w-4 h-4 rounded border-input"
            />
            <span className="text-sm">I have completed this step</span>
          </label>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          onClick={handlePrev}
          disabled={currentStep === 0}
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Previous
        </Button>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={handleSaveProgress}
            disabled={saving}
          >
            {saving ? <Save className="w-4 h-4 mr-1 animate-pulse" /> : <Save className="w-4 h-4 mr-1" />}
            Save Progress
          </Button>

          <label className="cursor-pointer">
            <span className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-input bg-background hover:bg-accent/10">
              {uploadingEvidence ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              {evidenceUrls.length > 0 ? `Evidence (${evidenceUrls.length})` : 'Add Evidence'}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={e => { handleEvidenceUpload(e.target.files?.[0]); e.target.value = ''; }}
            />
          </label>

          {isLastStep ? (
            <Button
              onClick={handleComplete}
              disabled={completing}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {completing ? null : <CheckCircle2 className="w-4 h-4 mr-1" />}
              {completing ? 'Completing...' : 'Complete Training'}
            </Button>
          ) : (
            <Button onClick={handleNext}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}