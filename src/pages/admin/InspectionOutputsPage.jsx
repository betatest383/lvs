import { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw, FileSpreadsheet, FileText, FileDown, Search, GitBranch, AlertTriangle, Zap } from 'lucide-react';
import { toast } from 'sonner';
import OutputDetailDrawer from '@/components/inspection/OutputDetailDrawer';
import { exportOutputsCSV, exportOutputsExcel, exportOutputsPDF, getImpactSystems } from '@/lib/inspectionOutputsExport';
import { QUESTION_PURPOSES, PURPOSE_COLOR, PURPOSE_ORDER, QUESTION_CATEGORIES, CATEGORY_COLOR, IMPACT_SYSTEMS } from '@/lib/inspectionMetadataConfig';

function safeParse(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

const FILTER_FORMS = [
  { value: 'all', label: 'All Forms' },
  { value: 'interior', label: 'Interior' },
  { value: 'exterior', label: 'Exterior' },
  { value: 'both', label: 'Both' },
];

const FILTER_ROLES = [
  { value: 'all', label: 'All Roles' },
  { value: 'observation', label: 'Observation' },
  { value: 'measurement', label: 'Measurement' },
  { value: 'photo', label: 'Photo' },
  { value: 'calculation_input', label: 'Calculation Input' },
  { value: 'derived_result', label: 'Derived Result' },
  { value: 'customer_information', label: 'Customer Information' },
  { value: 'administrative', label: 'Administrative' },
  { value: 'verification', label: 'Verification' },
];

const FILTER_PURPOSES = [
  { value: 'all', label: 'All Purposes' },
  ...PURPOSE_ORDER.map(p => ({ value: p, label: QUESTION_PURPOSES[p].label })),
];

const FILTER_CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  ...QUESTION_CATEGORIES.map(c => ({ value: c, label: c })),
];

const FILTER_OUTPUTS = [
  { value: 'pdf', label: 'PDF Impact', test: (e) => e.customer_pdf && e.customer_pdf !== 'hide' },
  { value: 'gallery', label: 'Gallery Impact', test: (e) => e.produces_gallery },
  { value: 'nfpa', label: 'NFPA Impact', test: (e) => e.nfpa_211_question },
  { value: 'repair', label: 'Repair Impact', test: (e) => e.repair_system && e.repair_system !== 'none' },
  { value: 'estimate', label: 'Estimate Impact', test: (e) => e.estimate_recommendation },
  { value: 'material', label: 'Material Calc Impact', test: (e) => e.feeds_material_calculator },
  { value: 'warehouse', label: 'Warehouse Impact', test: (e) => e.workflow_warehouse },
  { value: 'analytics', label: 'Analytics Impact', test: (e) => e.workflow_analytics },
];

export default function InspectionOutputsPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [formFilter, setFormFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [purposeFilter, setPurposeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [outputFilters, setOutputFilters] = useState({});
  const [inactiveOnly, setInactiveOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await base44.entities.InspectionMatrixEntry.list('display_order', 500);
      setEntries(data);
    } catch {
      toast.error('Failed to load inspection outputs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (search) {
        const q = search.toLowerCase();
        if (!e.question_text?.toLowerCase().includes(q) &&
            !e.section?.toLowerCase().includes(q) &&
            !e.subsection?.toLowerCase().includes(q) &&
            !e.question_category?.toLowerCase().includes(q)) return false;
      }
      if (formFilter !== 'all' && e.inspection_type !== formFilter) return false;
      if (roleFilter !== 'all' && e.question_role !== roleFilter) return false;
      if (categoryFilter !== 'all' && e.question_category !== categoryFilter) return false;
      if (purposeFilter !== 'all') {
        const purposes = safeParse(e.question_purpose, []);
        if (!Array.isArray(purposes) || !purposes.includes(purposeFilter)) return false;
      }
      for (const [key, active] of Object.entries(outputFilters)) {
        if (active) {
          const filterDef = FILTER_OUTPUTS.find(f => f.value === key);
          if (filterDef && !filterDef.test(e)) return false;
        }
      }
      if (inactiveOnly && e.is_active) return false;
      return true;
    });
  }, [entries, search, formFilter, roleFilter, purposeFilter, categoryFilter, outputFilters, inactiveOnly]);

  const stats = useMemo(() => {
    const total = entries.length;
    const active = entries.filter(e => e.is_active).length;
    const needsReview = entries.filter(e => e.needs_review).length;

    // Purpose distribution
    const purposeCounts = {};
    for (const e of entries) {
      const purposes = safeParse(e.question_purpose, []);
      if (Array.isArray(purposes)) {
        for (const p of purposes) {
          purposeCounts[p] = (purposeCounts[p] || 0) + 1;
        }
      }
    }

    // Category distribution (top 5)
    const catCounts = {};
    for (const e of entries) {
      if (e.question_category) {
        catCounts[e.question_category] = (catCounts[e.question_category] || 0) + 1;
      }
    }
    const topCategories = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return { total, active, inactive: total - active, needsReview, purposeCounts, topCategories };
  }, [entries]);

  const toggleOutput = (key) => {
    setOutputFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-primary" />
            Outputs & Data Lineage
          </h1>
          <p className="text-xs text-muted-foreground">
            Track where each inspection question flows downstream — PDF, photos, NFPA, repair, material, estimate, and workflow systems
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportOutputsCSV(filtered)} disabled={filtered.length === 0}>
            <FileText className="w-3.5 h-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportOutputsExcel(filtered)} disabled={filtered.length === 0}>
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportOutputsPDF(filtered)} disabled={filtered.length === 0}>
            <FileDown className="w-3.5 h-3.5" /> PDF
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Questions</p>
            <p className="text-lg font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Active</p>
            <p className="text-lg font-bold text-green-600">{stats.active}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Needs Review</p>
            <p className="text-lg font-bold text-amber-600">{stats.needsReview}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Categories</p>
            <p className="text-lg font-bold text-blue-600">{stats.topCategories.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Categories */}
      {stats.topCategories.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Top Question Categories</p>
            <div className="flex flex-wrap gap-1.5">
              {stats.topCategories.map(([cat, count]) => (
                <Badge key={cat} className={`text-[10px] ${CATEGORY_COLOR[cat] || 'bg-gray-100 text-gray-600'}`}>
                  {cat}: {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search questions, categories, sections..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
            <Select value={formFilter} onValueChange={setFormFilter}>
              <SelectTrigger className="w-[120px] h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{FILTER_FORMS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{FILTER_ROLES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={purposeFilter} onValueChange={setPurposeFilter}>
              <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{FILTER_PURPOSES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px] h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{FILTER_CATEGORIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTER_OUTPUTS.map(f => (
              <OutputToggle key={f.value} active={!!outputFilters[f.value]} onClick={() => toggleOutput(f.value)} label={f.label} />
            ))}
            <OutputToggle active={inactiveOnly} onClick={() => setInactiveOnly(!inactiveOnly)} label="Inactive Only" variant="danger" />
          </div>
        </CardContent>
      </Card>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {entries.length} questions
        </p>
      </div>

      {/* Output table */}
      {filtered.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center">
            <GitBranch className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No questions match the current filters.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left p-2 font-semibold text-muted-foreground sticky left-0 bg-muted/50 min-w-[200px]">Question</th>
                  <th className="text-left p-2 font-semibold text-muted-foreground whitespace-nowrap">Form</th>
                  <th className="text-left p-2 font-semibold text-muted-foreground whitespace-nowrap">Section</th>
                  <th className="text-left p-2 font-semibold text-muted-foreground whitespace-nowrap">Role</th>
                  <th className="text-left p-2 font-semibold text-muted-foreground whitespace-nowrap">Category</th>
                  <th className="text-left p-2 font-semibold text-muted-foreground whitespace-nowrap">Purpose</th>
                  <th className="text-center p-2 font-semibold text-muted-foreground whitespace-nowrap">PDF</th>
                  <th className="text-center p-2 font-semibold text-muted-foreground whitespace-nowrap">Photo</th>
                  <th className="text-center p-2 font-semibold text-muted-foreground whitespace-nowrap">NFPA</th>
                  <th className="text-center p-2 font-semibold text-muted-foreground whitespace-nowrap">Repair</th>
                  <th className="text-center p-2 font-semibold text-muted-foreground whitespace-nowrap">Material</th>
                  <th className="text-center p-2 font-semibold text-muted-foreground whitespace-nowrap">Estimate</th>
                  <th className="text-center p-2 font-semibold text-muted-foreground whitespace-nowrap">Scope</th>
                  <th className="text-center p-2 font-semibold text-muted-foreground whitespace-nowrap">Warehouse</th>
                  <th className="text-center p-2 font-semibold text-muted-foreground whitespace-nowrap">Analytics</th>
                  <th className="text-center p-2 font-semibold text-muted-foreground whitespace-nowrap">Active</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => {
                  const purposes = safeParse(e.question_purpose, []);
                  const purposeList = Array.isArray(purposes) ? purposes.slice(0, 2) : [];
                  const impactCount = getImpactSystems(e).length;
                  return (
                    <tr
                      key={e.id}
                      onClick={() => { setSelectedEntry(e); setDrawerOpen(true); }}
                      className="border-b border-border hover:bg-muted/20 cursor-pointer transition-colors"
                    >
                      <td className="p-2 sticky left-0 bg-card min-w-[200px]">
                        <div className="flex items-center gap-1.5">
                          {e.needs_review && <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                          <span className="text-xs font-medium line-clamp-1">{e.question_text}</span>
                        </div>
                        {impactCount > 0 && (
                          <span className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-0.5">
                            <Zap className="w-2 h-2 text-orange-400" /> {impactCount} systems
                          </span>
                        )}
                      </td>
                      <td className="p-2 capitalize">{e.inspection_type}</td>
                      <td className="p-2 whitespace-nowrap">{e.section}</td>
                      <td className="p-2 capitalize whitespace-nowrap">{e.question_role?.replace(/_/g, ' ')}</td>
                      <td className="p-2 whitespace-nowrap">
                        {e.question_category && (
                          <Badge className={`text-[9px] ${CATEGORY_COLOR[e.question_category] || 'bg-gray-100 text-gray-600'}`}>
                            {e.question_category}
                          </Badge>
                        )}
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-0.5">
                          {purposeList.map(p => (
                            <Badge key={p} className={`text-[9px] ${PURPOSE_COLOR[p] || 'bg-gray-100 text-gray-600'}`}>
                              {QUESTION_PURPOSES[p]?.label || p}
                            </Badge>
                          ))}
                          {purposeList.length < (Array.isArray(purposes) ? purposes.length : 0) && (
                            <Badge variant="outline" className="text-[9px]">+{(purposes?.length || 0) - purposeList.length}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-2 text-center">
                        {e.customer_pdf === 'show' ? <Dot color="blue" /> : e.customer_pdf === 'conditional' ? <Dot color="amber" /> : <span className="text-muted-foreground/30">—</span>}
                      </td>
                      <td className="p-2 text-center">{e.photo_required ? <Dot color="purple" /> : <span className="text-muted-foreground/30">—</span>}</td>
                      <td className="p-2 text-center">{e.nfpa_211_question ? <Dot color="red" /> : <span className="text-muted-foreground/30">—</span>}</td>
                      <td className="p-2 text-center">{e.repair_system && e.repair_system !== 'none' ? <Dot color="purple" /> : <span className="text-muted-foreground/30">—</span>}</td>
                      <td className="p-2 text-center">{e.feeds_material_calculator ? <Dot color="amber" /> : <span className="text-muted-foreground/30">—</span>}</td>
                      <td className="p-2 text-center">{e.estimate_recommendation ? <Dot color="orange" /> : <span className="text-muted-foreground/30">—</span>}</td>
                      <td className="p-2 text-center">{e.workflow_scope_of_work ? <Dot color="indigo" /> : <span className="text-muted-foreground/30">—</span>}</td>
                      <td className="p-2 text-center">{e.workflow_warehouse ? <Dot color="amber" /> : <span className="text-muted-foreground/30">—</span>}</td>
                      <td className="p-2 text-center">{e.workflow_analytics ? <Dot color="blue" /> : <span className="text-muted-foreground/30">—</span>}</td>
                      <td className="p-2 text-center">{e.is_active ? <Dot color="green" /> : <Dot color="red" />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <OutputDetailDrawer entry={selectedEntry} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}

function Dot({ color }) {
  const colorMap = {
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    red: 'bg-red-500',
    amber: 'bg-amber-500',
    orange: 'bg-orange-500',
    indigo: 'bg-indigo-500',
    green: 'bg-green-500',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colorMap[color] || 'bg-gray-400'}`} />;
}

function OutputToggle({ active, onClick, label, variant }) {
  const base = 'px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors border whitespace-nowrap';
  const styles = variant === 'danger'
    ? active
      ? 'bg-red-600 text-white border-red-600'
      : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
    : active
      ? 'bg-accent text-accent-foreground border-accent'
      : 'bg-muted text-muted-foreground border-border hover:bg-muted/80';
  return <button onClick={onClick} className={`${base} ${styles}`}>{label}</button>;
}