import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical, ImageUp, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function TrainingStepsEditor({ steps, onChange, guideId }) {
  const [expanded, setExpanded] = useState(null);
  const [uploading, setUploading] = useState(null);

  const update = (newSteps) => {
    onChange(newSteps.map((s, i) => ({ ...s, step_number: i + 1 })));
  };

  const addStep = () => {
    const newStep = {
      step_number: steps.length + 1,
      title: '',
      instructions: '',
      screenshot_url: '',
      example: '',
      common_mistake: '',
      required_evidence: '',
    };
    const newSteps = [...steps, newStep];
    update(newSteps);
    setExpanded(steps.length);
  };

  const removeStep = (index) => {
    update(steps.filter((_, i) => i !== index));
  };

  const moveStep = (index, dir) => {
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= steps.length) return;
    const newSteps = [...steps];
    [newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
    update(newSteps);
  };

  const updateField = (index, field, value) => {
    const newSteps = steps.map((s, i) => i === index ? { ...s, [field]: value } : s);
    update(newSteps);
  };

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  const handleScreenshotUpload = async (index, file) => {
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Only image files (JPEG, PNG, WebP, GIF) are allowed');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File size must be under 10MB');
      return;
    }
    setUploading(index);
    try {
      // Convert to base64 data URL and upload through backend for server-side validation
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await base44.functions.invoke('manageTraining', {
        action: 'upload_file',
        trainingId: guideId || undefined,
        purpose: 'screenshot',
        stepIndex: index,
        fileDataUrl: dataUrl,
      });
      if (res.data?.success && res.data.file_url) {
        updateField(index, 'screenshot_url', res.data.file_url);
        toast.success('Screenshot uploaded');
      } else {
        toast.error(res.data?.error || 'Upload failed');
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-2">
      {steps.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
          No steps yet. Click "Add Step" to begin.
        </p>
      )}
      {steps.map((step, i) => (
        <div key={i} className="border rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50">
            <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <button
              type="button"
              onClick={() => setExpanded(expanded === i ? null : i)}
              className="flex-1 text-left text-sm font-medium truncate"
            >
              Step {step.step_number}: {step.title || '(Untitled)'}
            </button>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} className="p-1 hover:bg-muted rounded disabled:opacity-30">
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="p-1 hover:bg-muted rounded disabled:opacity-30">
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => removeStep(i)} className="p-1 hover:bg-destructive/10 rounded text-destructive">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {expanded === i && (
            <div className="p-3 space-y-3">
              <div>
                <Label className="text-xs">Step Title</Label>
                <Input
                  value={step.title || ''}
                  onChange={e => updateField(i, 'title', e.target.value)}
                  placeholder="e.g. Navigate to the SOP Registry"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Instructions</Label>
                <Textarea
                  value={step.instructions || ''}
                  onChange={e => updateField(i, 'instructions', e.target.value)}
                  placeholder="Detailed step-by-step instructions..."
                  rows={3}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Screenshot</Label>
                <div className="flex items-center gap-2 mt-1">
                  {step.screenshot_url && (
                    <img src={step.screenshot_url} alt="Step screenshot" className="w-16 h-16 object-cover rounded border" />
                  )}
                  <label className="cursor-pointer">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-input bg-background hover:bg-accent/10">
                      {uploading === i ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageUp className="w-3.5 h-3.5" />}
                      {step.screenshot_url ? 'Replace' : 'Upload'}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={e => handleScreenshotUpload(i, e.target.files?.[0])}
                    />
                  </label>
                  {step.screenshot_url && (
                    <button type="button" onClick={() => updateField(i, 'screenshot_url', '')} className="text-xs text-destructive hover:underline">
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-xs">Example</Label>
                <Input
                  value={step.example || ''}
                  onChange={e => updateField(i, 'example', e.target.value)}
                  placeholder="Concrete example of what this step looks like..."
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Common Mistake</Label>
                <Input
                  value={step.common_mistake || ''}
                  onChange={e => updateField(i, 'common_mistake', e.target.value)}
                  placeholder="What people often get wrong..."
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Required Evidence</Label>
                <Input
                  value={step.required_evidence || ''}
                  onChange={e => updateField(i, 'required_evidence', e.target.value)}
                  placeholder="What the trainee must provide to prove completion..."
                  className="mt-1"
                />
              </div>
            </div>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addStep} className="w-full">
        <Plus className="w-4 h-4 mr-1" /> Add Step
      </Button>
    </div>
  );
}