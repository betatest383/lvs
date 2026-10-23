import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Lightbulb, Paperclip, X, Loader2, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { CATEGORIES, PRIORITIES, BUSINESS_IMPACTS, ESTIMATED_BENEFITS, deriveModuleFromPath, generateImprovementId } from '@/lib/improvementConstants';

function ChipSelect({ options, values = [], onToggle }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onToggle(opt)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${values.includes(opt) ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export default function SubmitImprovement() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', description: '', category: '', priority: 'Medium', business_impact: [], estimated_benefit: [], attachments: [], sop_id: '', business_process: '', workflow: '' });
  const [user, setUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  const update = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const toggleArray = (key, val) => {
    const arr = form[key] || [];
    update(key, arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  };

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = [];
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        urls.push(file_url);
      }
      update('attachments', [...(form.attachments || []), ...urls]);
    } catch (err) { console.error(err); }
    setUploading(false);
  };

  const handleSubmit = async () => {
    if (!form.title?.trim()) return;
    setSaving(true);
    try {
      const id = await generateImprovementId();
      const now = new Date();
      const pathname = window.location.pathname;
      await base44.entities.ImprovementRequest.create({
        ...form,
        improvement_id: id,
        submitted_by: user?.full_name || '',
        submitted_by_email: user?.email || '',
        role: user?.role || '',
        date_submitted: now.toISOString().split('T')[0],
        status: 'New',
        current_page: pathname,
        current_module: deriveModuleFromPath(pathname),
        current_url: window.location.href,
      });
      setSuccess(true);
      setTimeout(() => navigate('/ci/my-ideas'), 2000);
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold">Idea Submitted!</h2>
        <p className="text-sm text-muted-foreground mt-1">Redirecting to your ideas...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Lightbulb className="w-6 h-6 text-accent" /> Submit Improvement
        </h1>
        <p className="text-muted-foreground text-sm">Submit an idea in under 60 seconds.</p>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">General</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Title *</Label>
            <Input value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="What can be improved?" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea value={form.description} onChange={(e) => update('description', e.target.value)} rows={4} placeholder="Describe the improvement, the current problem, and your proposed solution..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={(v) => update('category', v)}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => update('priority', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Impact & Benefit</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Business Impact</Label>
            <ChipSelect options={BUSINESS_IMPACTS} values={form.business_impact} onToggle={(v) => toggleArray('business_impact', v)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Estimated Benefit</Label>
            <ChipSelect options={ESTIMATED_BENEFITS} values={form.estimated_benefit} onToggle={(v) => toggleArray('estimated_benefit', v)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Context (Optional)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">SOP ID</Label>
              <Input value={form.sop_id} onChange={(e) => update('sop_id', e.target.value)} placeholder="e.g. WH-101" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Business Process</Label>
              <Input value={form.business_process} onChange={(e) => update('business_process', e.target.value)} placeholder="e.g. BP-001" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Workflow</Label>
              <Input value={form.workflow} onChange={(e) => update('workflow', e.target.value)} placeholder="e.g. WF-WH-001" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Attachments</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-input text-sm cursor-pointer hover:bg-accent/10 transition-colors">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              <span>{uploading ? 'Uploading...' : 'Add Files'}</span>
              <input type="file" multiple className="hidden" onChange={handleFiles} disabled={uploading} />
            </label>
          </div>
          {form.attachments?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {form.attachments.map((url, i) => (
                <span key={i} className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs">
                  <Paperclip className="w-3 h-3" />
                  <span className="max-w-[150px] truncate">{url.split('/').pop()}</span>
                  <button onClick={() => update('attachments', form.attachments.filter((_, j) => j !== i))}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate('/ci')}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={saving || !form.title?.trim()}>
          {saving ? 'Submitting...' : 'Submit Improvement'}
        </Button>
      </div>
    </div>
  );
}