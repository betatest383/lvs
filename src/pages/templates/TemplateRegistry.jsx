import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link } from 'react-router-dom';
import { Plus, Search, Loader2, Upload } from 'lucide-react';
import TemplateImportDialog from '@/components/templates/TemplateImportDialog';
import {
  TEMPLATE_STATUSES, WORK_CATEGORIES, EXECUTION_MODES, ASSIGNMENT_MODES,
  INTERRUPTIBILITY_OPTIONS, TRIGGER_TYPES, TEMPLATE_DEPARTMENTS, labelFor,
  TEMPLATE_STATUS_COLORS, WORK_CATEGORY_COLORS,
} from '@/lib/taskTemplateConstants';

export default function TemplateRegistry() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('manageTaskTemplate', { action: 'list', filters });
      if (res.data?.success) setTemplates(res.data.templates || []);
    } catch (e) {
      console.error('Failed', e);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Template Registry</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-1" /> Import Templates
          </Button>
          <Button asChild>
            <Link to="/templates/new"><Plus className="w-4 h-4 mr-1" /> New Template</Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={filters.search || ''}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                placeholder="Name, key, description…"
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Department</label>
            <Select value={filters.department || 'all'} onValueChange={v => setFilters(f => ({ ...f, department: v === 'all' ? undefined : v }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {TEMPLATE_DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Work Category</label>
            <Select value={filters.work_category || 'all'} onValueChange={v => setFilters(f => ({ ...f, work_category: v === 'all' ? undefined : v }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {WORK_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={filters.status || 'all'} onValueChange={v => setFilters(f => ({ ...f, status: v === 'all' ? undefined : v }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {TEMPLATE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : templates.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No templates found. Adjust filters or create a new template.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <Link key={t.id} to={`/templates/detail/${t.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-muted-foreground">{t.template_number}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${TEMPLATE_STATUS_COLORS[t.status] || ''}`}>{t.status}</span>
                      {t.work_category && <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${WORK_CATEGORY_COLORS[t.work_category] || ''}`}>{labelFor(WORK_CATEGORIES, t.work_category)}</span>}
                      {t.requires_approval && <span className="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700">Approval Required</span>}
                    </div>
                    <p className="font-medium text-sm truncate">{t.template_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {t.department_name_snapshot || '—'} · {labelFor(EXECUTION_MODES, t.execution_mode)} · v{t.version}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <TemplateImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={load} />
    </div>
  );
}