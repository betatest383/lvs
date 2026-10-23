import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Link } from 'react-router-dom';
import { Loader2, CheckCircle2, Eye, FileText } from 'lucide-react';
import { toast } from 'sonner';
import {
  WORK_CATEGORIES, EXECUTION_MODES, labelFor, TEMPLATE_STATUS_COLORS,
} from '@/lib/taskTemplateConstants';

export default function TemplateReviewQueue() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);
  const [reviewNotes, setReviewNotes] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('manageTaskTemplate', {
        action: 'list', filters: { status: 'In Review' },
      });
      if (res.data?.success) setTemplates(res.data.templates || []);
    } catch (e) {
      console.error('Failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (templateId) => {
    setActing(templateId);
    try {
      const res = await base44.functions.invoke('manageTaskTemplate', {
        action: 'approve', templateId,
        reviewNotes: reviewNotes[templateId] || '',
      });
      if (res.data?.success) {
        toast.success('Template approved');
        load();
      } else {
        toast.error(res.data?.error || 'Failed');
      }
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed');
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Eye className="w-6 h-6 text-accent" /> Review Queue
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Templates submitted for review awaiting approval.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : templates.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          No templates awaiting review.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <Card key={t.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-muted-foreground">{t.template_number}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${TEMPLATE_STATUS_COLORS[t.status] || ''}`}>{t.status}</span>
                      <span className="text-xs text-muted-foreground">v{t.version}</span>
                    </div>
                    <p className="font-medium text-sm">{t.template_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t.department_name_snapshot || '—'} · {labelFor(WORK_CATEGORIES, t.work_category)} · {labelFor(EXECUTION_MODES, t.execution_mode)}
                    </p>
                    {t.description && <p className="text-xs text-muted-foreground mt-1">{t.description}</p>}
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/templates/detail/${t.id}`}>View Details →</Link>
                  </Button>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Review Notes (optional)</label>
                  <Textarea
                    value={reviewNotes[t.id] || ''}
                    onChange={e => setReviewNotes(prev => ({ ...prev, [t.id]: e.target.value }))}
                    placeholder="Add review notes…"
                    rows={2}
                    className="text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" onClick={() => handleApprove(t.id)} disabled={acting === t.id}>
                    {acting === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                    Approve Template
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}