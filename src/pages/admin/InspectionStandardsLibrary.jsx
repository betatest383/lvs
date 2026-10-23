import { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, Plus, Search, FileText, FileSpreadsheet, FileDown, BookOpen, Shield, Trash2, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import StandardFormDialog from '@/components/standards/StandardFormDialog';
import StandardDetailDrawer from '@/components/standards/StandardDetailDrawer';
import {
  STANDARD_STATUSES, STATUS_ORDER, STANDARD_CATEGORIES, APPLIES_TO_OPTIONS,
  AUTHORITY_OPTIONS, SEVERITY_OPTIONS, SEVERITY_ORDER, getCategoryColor, getAuthorityColor,
} from '@/lib/inspectionStandardConstants';
import { exportStandardsCSV, exportStandardsExcel, exportStandardsPDF } from '@/lib/inspectionStandardsExport';

const FILTER_AUTHORITY = [{ value: 'all', label: 'All Authorities' }, ...AUTHORITY_OPTIONS.map(a => ({ value: a, label: a }))];
const FILTER_APPLIES = [{ value: 'all', label: 'All Appliances' }, ...APPLIES_TO_OPTIONS.map(a => ({ value: a, label: a }))];
const FILTER_CATEGORIES = [{ value: 'all', label: 'All Categories' }, ...STANDARD_CATEGORIES.map(c => ({ value: c, label: c }))];
const FILTER_SEVERITY = [{ value: 'all', label: 'All Severities' }, ...SEVERITY_OPTIONS.map(s => ({ value: s.value, label: s.label }))];
const FILTER_STATUS = [{ value: 'all', label: 'All Statuses' }, ...STATUS_ORDER.map(s => ({ value: s, label: STANDARD_STATUSES[s].label }))];

export default function InspectionStandardsLibrary() {
  const [standards, setStandards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [authorityFilter, setAuthorityFilter] = useState('all');
  const [appliesFilter, setAppliesFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await base44.entities.InspectionStandard.list('-updated_date', 500);
      setStandards(data);
    } catch {
      toast.error('Failed to load inspection standards');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return standards.filter(s => {
      if (search) {
        const q = search.toLowerCase();
        if (!s.standard_name?.toLowerCase().includes(q) &&
            !s.standard_number?.toLowerCase().includes(q) &&
            !s.customer_explanation?.toLowerCase().includes(q) &&
            !s.pass_criteria?.toLowerCase().includes(q) &&
            !s.fail_criteria?.toLowerCase().includes(q)) return false;
      }
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
      if (severityFilter !== 'all' && s.severity !== severityFilter) return false;
      if (authorityFilter !== 'all' && !(s.authority_level || []).includes(authorityFilter)) return false;
      if (appliesFilter !== 'all' && !(s.applies_to || []).includes(appliesFilter)) return false;
      return true;
    });
  }, [standards, search, statusFilter, categoryFilter, authorityFilter, appliesFilter, severityFilter]);

  const stats = useMemo(() => ({
    total: standards.length,
    approved: standards.filter(s => s.status === 'approved').length,
    draft: standards.filter(s => s.status === 'draft').length,
    review: standards.filter(s => s.status === 'in_review').length,
    retired: standards.filter(s => s.status === 'retired').length,
  }), [standards]);

  const handleSave = async (data) => {
    if (editing?.id) {
      await base44.entities.InspectionStandard.update(editing.id, data);
      toast.success('Standard updated');
    } else {
      await base44.entities.InspectionStandard.create(data);
      toast.success('Standard created');
    }
    load();
  };

  const handleDelete = async (std) => {
    if (!confirm(`Delete "${std.standard_name}"? This cannot be undone.`)) return;
    await base44.entities.InspectionStandard.delete(std.id);
    toast.success('Standard deleted');
    load();
  };

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (std) => { setEditing(std); setDialogOpen(true); };
  const openDetail = (std) => { setSelected(std); setDrawerOpen(true); };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-accent" />
            Inspection Standards Library
          </h1>
          <p className="text-xs text-muted-foreground">
            Single source of truth for inspection criteria, authority references, and repair guidance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportStandardsCSV(filtered)} disabled={filtered.length === 0}>
            <FileText className="w-3.5 h-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportStandardsExcel(filtered)} disabled={filtered.length === 0}>
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportStandardsPDF(filtered)} disabled={filtered.length === 0}>
            <FileDown className="w-3.5 h-3.5" /> PDF
          </Button>
          <Button size="sm" className="gap-1.5" onClick={openNew}>
            <Plus className="w-3.5 h-3.5" /> New Standard
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {[
          { label: 'Total', value: stats.total, color: '' },
          { label: 'Approved', value: stats.approved, color: 'text-green-600' },
          { label: 'In Review', value: stats.review, color: 'text-blue-600' },
          { label: 'Draft', value: stats.draft, color: 'text-gray-600' },
          { label: 'Retired', value: stats.retired, color: 'text-red-600' },
        ].map(s => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</p>
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search standards..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{FILTER_STATUS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{FILTER_CATEGORIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={authorityFilter} onValueChange={setAuthorityFilter}>
              <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{FILTER_AUTHORITY.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={appliesFilter} onValueChange={setAppliesFilter}>
              <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{FILTER_APPLIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[120px] h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{FILTER_SEVERITY.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Showing {filtered.length} of {standards.length} standards</p>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center">
            <Shield className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-3">
              {standards.length === 0
                ? 'No inspection standards yet. Create your first standard to begin building the knowledge base.'
                : 'No standards match the current filters.'}
            </p>
            {standards.length === 0 && (
              <Button onClick={openNew} className="gap-1.5"><Plus className="w-4 h-4" /> Create Standard</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(std => {
            const authorities = std.authority_level || [];
            const sev = SEVERITY_OPTIONS.find(s => s.value === std.severity);
            return (
              <div key={std.id} className="border rounded-lg p-3 hover:bg-muted/30 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openDetail(std)}>
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <Badge className={`text-[10px] ${STANDARD_STATUSES[std.status]?.color || ''}`}>
                        {STANDARD_STATUSES[std.status]?.label || std.status}
                      </Badge>
                      {std.standard_number && <Badge variant="outline" className="text-[10px]">{std.standard_number}</Badge>}
                      {std.version && <Badge variant="outline" className="text-[10px]">v{std.version}</Badge>}
                      {std.category && <Badge className={`text-[10px] ${getCategoryColor(std.category)}`}>{std.category}</Badge>}
                      {std.inspection_level && <Badge variant="outline" className="text-[10px] capitalize">{std.inspection_level.replace('_', ' ')}</Badge>}
                      {sev && <Badge className={`text-[10px] ${sev.color}`}>Severity: {sev.label}</Badge>}
                      {authorities.map(a => <Badge key={a} className={`text-[10px] ${getAuthorityColor(a)}`}>{a}</Badge>)}
                    </div>
                    <p className="text-sm font-medium">{std.standard_name}</p>
                    {(std.applies_to || []).length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">Applies to: {(std.applies_to || []).join(', ')}</p>
                    )}
                    {std.pass_criteria && <p className="text-xs text-muted-foreground mt-1 line-clamp-1"><strong>Pass:</strong> {std.pass_criteria}</p>}
                    {std.fail_criteria && <p className="text-xs text-muted-foreground line-clamp-1"><strong>Fail:</strong> {std.fail_criteria}</p>}
                    {std.customer_explanation && <p className="text-xs text-muted-foreground line-clamp-1"><strong>Customer:</strong> {std.customer_explanation}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(std)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(std)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <StandardFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} onSave={handleSave} />
      <StandardDetailDrawer standard={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}