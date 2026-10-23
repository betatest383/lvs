import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { FileText, Plus, Clock, CheckCircle2, Eye, Brain, Shield } from 'lucide-react';
import {
  TEMPLATE_STATUSES, WORK_CATEGORIES, EXECUTION_MODES, labelFor,
} from '@/lib/taskTemplateConstants';

export default function TemplateDashboard() {
  const [stats, setStats] = useState({ byStatus: {}, byCategory: {}, total: 0 });
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await base44.functions.invoke('manageTaskTemplate', { action: 'list', filters: {} });
        if (res.data?.success) {
          const templates = res.data.templates || [];
          const byStatus = {};
          const byCategory = {};
          for (const t of templates) {
            byStatus[t.status] = (byStatus[t.status] || 0) + 1;
            if (t.work_category) byCategory[t.work_category] = (byCategory[t.work_category] || 0) + 1;
          }
          setStats({ byStatus, byCategory, total: templates.length });
          setRecent(templates.slice(0, 5));
        }
      } catch (e) {
        console.error('Failed to load templates', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="w-6 h-6 text-accent" />
            Task Template Registry
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Reusable, orchestration-aware templates for structured task creation.
          </p>
        </div>
        <Button asChild>
          <Link to="/templates/new"><Plus className="w-4 h-4 mr-1" /> New Template</Link>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {TEMPLATE_STATUSES.map(status => {
          const count = stats.byStatus[status] || 0;
          const icons = { 'Draft': FileText, 'In Review': Clock, 'Approved': CheckCircle2, 'Published': Eye, 'Archived': Shield };
          const Icon = icons[status] || FileText;
          return (
            <Card key={status}>
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className="w-8 h-8 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-xs text-muted-foreground">{status}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Work Category Breakdown */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Templates by Work Category</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {WORK_CATEGORIES.map(cat => {
              const count = stats.byCategory[cat.value] || 0;
              return (
                <div key={cat.value} className="flex justify-between items-center p-2 rounded border">
                  <span className="text-sm">{cat.label}</span>
                  <span className="text-sm font-bold text-accent">{count}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Templates */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Recent Templates</h3>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/templates/registry">View All →</Link>
            </Button>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No templates yet. Create your first template.</p>
          ) : (
            <div className="space-y-2">
              {recent.map(t => (
                <Link key={t.id} to={`/templates/detail/${t.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{t.template_name}</p>
                    <p className="text-xs text-muted-foreground">{t.template_number} · {t.department_name_snapshot || '—'}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">{labelFor(WORK_CATEGORIES, t.work_category)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                      t.status === 'Published' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' :
                      t.status === 'Approved' ? 'bg-blue-100 text-blue-700 border-blue-300' :
                      t.status === 'In Review' ? 'bg-amber-100 text-amber-700 border-amber-300' :
                      'bg-slate-100 text-slate-700 border-slate-300'
                    }`}>{t.status}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Release Gate Notice */}
      <Card className="border-amber-300 bg-amber-50">
        <CardContent className="p-4 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Assisted Mode Release Gate</p>
            <p className="text-xs text-amber-700 mt-1">
              Orchestration remains in <strong>Preview</strong> mode. An atomic active-session concurrency backstop
              (database-level unique constraint) is required before Assisted Mode can be enabled.
              No automatic interruption, Focus Required locking, or notification takeover is active.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}