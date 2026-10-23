import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { searchTemplates, resolveTemplates } from '@/lib/taskSearchFunctions';

export default function MatchToTemplateDialog({ open, onOpenChange, task, onMatched }) {
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [diff, setDiff] = useState(null);

  useEffect(() => {
    if (open && task) {
      setSelectedId('');
      setDiff(null);
      // Auto-search templates matching the task title/description
      setLoading(true);
      searchTemplates(task.title || '', 0, { includeDrafts: false })
        .then(result => setTemplates(result.items))
        .catch(() => setTemplates([]))
        .finally(() => setLoading(false));
    }
  }, [open, task]);

  const handleSelectTemplate = async (id) => {
    setSelectedId(id);
    setDiff(null);
    try {
      const tpl = templates.find(t => t.id === id);
      if (!tpl?.template) return;
      const t = tpl.template;
      const differences = [];
      const fields = [
        { key: 'title', label: 'Title', taskVal: task.title, tplVal: t.template_name },
        { key: 'description', label: 'Description', taskVal: task.description, tplVal: t.description },
        { key: 'department', label: 'Department', taskVal: task.department, tplVal: t.department_name_snapshot },
        { key: 'priority', label: 'Priority', taskVal: task.priority, tplVal: t.default_priority },
        { key: 'work_category', label: 'Work Category', taskVal: task.work_category, tplVal: t.work_category },
        { key: 'interruptibility', label: 'Interruptibility', taskVal: task.interruptibility, tplVal: t.interruptibility },
        { key: 'execution_mode', label: 'Execution Mode', taskVal: task.execution_mode, tplVal: t.execution_mode },
      ];
      for (const f of fields) {
        if (f.tplVal && String(f.taskVal || '') !== String(f.tplVal)) {
          differences.push({ field: f.key, label: f.label, taskValue: f.taskVal || '—', templateValue: f.tplVal });
        }
      }
      setDiff(differences);
    } catch (err) {
      toast.error('Failed to load template details');
    }
  };

  const handleMatch = async () => {
    if (!selectedId || !task) return;
    setMatching(true);
    try {
      const tpl = templates.find(t => t.id === selectedId);
      const response = await base44.functions.invoke('manageTask', {
        action: 'match_template',
        taskId: task.id,
        templateId: selectedId,
      });
      if (response.data?.success) {
        toast.success(`Task matched to ${tpl?.label || 'template'}`);
        onMatched?.();
        onOpenChange(false);
      } else {
        toast.error(response.data?.error || 'Failed to match template');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to match template');
    } finally {
      setMatching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Match Task to Template</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border p-3 bg-muted/30">
            <p className="text-sm font-medium">{task?.title}</p>
            <p className="text-xs text-muted-foreground">{task?.task_number} · {task?.department || '—'}</p>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium flex items-center gap-1"><Search className="w-3 h-3" /> Suggested Templates</p>
            {loading ? (
              <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            ) : templates.length === 0 ? (
              <p className="text-xs text-muted-foreground">No published templates found. Try creating a template first.</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {templates.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSelectTemplate(t.id)}
                    className={`w-full text-left p-2 rounded-md border transition-colors ${selectedId === t.id ? 'border-accent bg-accent/10' : 'border-input hover:bg-muted/50'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{t.label}</span>
                      {selectedId === t.id && <Check className="w-3.5 h-3.5 text-accent" />}
                    </div>
                    <span className="text-xs text-muted-foreground">{t.secondary}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {diff !== null && (
            <div className="space-y-2">
              <p className="text-xs font-medium">Differences</p>
              {diff.length === 0 ? (
                <p className="text-xs text-green-600 flex items-center gap-1"><Check className="w-3 h-3" /> No differences — task matches template defaults.</p>
              ) : (
                <div className="space-y-1">
                  {diff.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/30">
                      <span className="font-medium w-32 shrink-0">{d.label}</span>
                      <span className="text-muted-foreground line-through">{d.taskValue}</span>
                      <span className="text-accent">→</span>
                      <span className="font-medium">{d.templateValue}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 mt-2">
                    <AlertTriangle className="w-3 h-3" />
                    Existing status, assignment, priority, due date, and history will be preserved.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleMatch} disabled={!selectedId || matching}>
            {matching ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
            Match to Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}