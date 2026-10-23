import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Lightbulb, Paperclip, Mic, X, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import {
  CATEGORIES, PRIORITIES, deriveModuleFromPath, generateImprovementId,
} from '@/lib/improvementConstants';

export default function FloatingImprovementButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center gap-2 bg-accent text-accent-foreground rounded-full shadow-lg px-4 py-3 hover:shadow-xl hover:scale-105 transition-all"
      >
        <Lightbulb className="w-5 h-5" />
        <span className="text-sm font-semibold hidden sm:inline">Continuous Improvement</span>
      </button>
      <QuickSubmitModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function QuickSubmitModal({ open, onClose }) {
  const [form, setForm] = useState({ title: '', description: '', category: '', priority: 'Medium', attachments: [] });
  const [user, setUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      base44.auth.me().then(setUser).catch(() => {});
      setForm({ title: '', description: '', category: '', priority: 'Medium', attachments: [] });
      setSuccess(false);
    }
  }, [open]);

  const update = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
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

  const removeAttachment = (idx) => update('attachments', (form.attachments || []).filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (!form.title?.trim()) return;
    setSaving(true);
    try {
      const id = await generateImprovementId();
      const now = new Date();
      const pathname = window.location.pathname;
      await base44.entities.ImprovementRequest.create({
        improvement_id: id,
        title: form.title,
        description: form.description,
        category: form.category || 'Other',
        priority: form.priority,
        attachments: form.attachments,
        submitted_by: user?.full_name || '',
        submitted_by_email: user?.email || '',
        role: user?.role || '',
        date_submitted: now.toISOString().split('T')[0],
        status: 'New',
        current_page: pathname,
        current_module: deriveModuleFromPath(pathname),
        current_url: window.location.href,
      });
      // TODO: Notify process owner, department manager, operations manager for Critical priority
      setSuccess(true);
      setTimeout(() => onClose(), 1500);
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-accent" /> Submit an Idea
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <Lightbulb className="w-6 h-6 text-green-600" />
            </div>
            <p className="font-semibold">Idea submitted!</p>
            <p className="text-sm text-muted-foreground mt-1">Your improvement request has been logged.</p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                placeholder="What can be improved?"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                placeholder="Describe the improvement..."
                rows={3}
              />
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

            <div className="space-y-1.5">
              <Label className="text-xs">Attachments</Label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-input bg-transparent text-sm cursor-pointer hover:bg-accent/10 transition-colors">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                  <span>{uploading ? 'Uploading...' : 'Add Files'}</span>
                  <input type="file" multiple className="hidden" onChange={handleFiles} disabled={uploading} />
                </label>
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-dashed border-input text-sm text-muted-foreground cursor-not-allowed"
                  title="Voice notes — coming soon"
                >
                  <Mic className="w-4 h-4" /> Voice Note
                </button>
              </div>
              {form.attachments?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {form.attachments.map((url, i) => (
                    <span key={i} className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs">
                      <Paperclip className="w-3 h-3" />
                      <span className="max-w-[120px] truncate">{url.split('/').pop()}</span>
                      <button onClick={() => removeAttachment(i)}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2.5">
              <p>Auto-captured: {deriveModuleFromPath(window.location.pathname)} · {new Date().toLocaleDateString()}{user?.full_name ? ` · ${user.full_name}` : ''}</p>
            </div>
          </div>
        )}

        {!success && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.title?.trim()}>
              {saving ? 'Submitting...' : 'Submit Idea'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}