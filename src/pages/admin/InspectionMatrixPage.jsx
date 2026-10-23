import { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw, FileSpreadsheet, FileText, FileDown, AlertTriangle, Search, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import MatrixEntryDetail from '@/components/inspection/MatrixEntryDetail';
import DependencyFlow from '@/components/inspection/DependencyFlow';
import { exportCSV, exportExcel, exportPDF } from '@/lib/inspectionMatrixExport';
import { QUESTION_ROLES } from '@/lib/inspectionMatrixGapClassifier';
import { QUESTION_PURPOSES, PURPOSE_COLOR, PURPOSE_ORDER, QUESTION_CATEGORIES, CATEGORY_COLOR } from '@/lib/inspectionMetadataConfig';
import { INSPECTION_MODULES } from '@/lib/inspectionModules';

const FILTER_MODULES = [
  { value: 'all', label: 'All Modules' },
  ...INSPECTION_MODULES.map(m => ({ value: m.key, label: m.label })),
];

function safeParse(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

const FILTER_SECTIONS = [
  { value: 'all', label: 'All Sections' },
  { value: 'General Info', label: 'General Info' },
  { value: 'Exterior', label: 'Exterior' },
  { value: 'Interior', label: 'Interior' },
  { value: 'Safety', label: 'Safety' },
];

const FILTER_REPAIR_SYSTEMS = [
  { value: 'all', label: 'All Repair Systems' },
  { value: 'crown', label: 'Crown' },
  { value: 'masonry', label: 'Masonry' },
  { value: 'liner', label: 'Liner' },
  { value: 'smoke_chamber', label: 'Smoke Chamber' },
  { value: 'cap_chase', label: 'Cap / Chase' },
  { value: 'other', label: 'Other' },
  { value: 'none', label: 'None' },
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

const ROLE_COLOR = {
  observation: 'bg-blue-100 text-blue-700',
  measurement: 'bg-amber-100 text-amber-700',
  photo: 'bg-purple-100 text-purple-700',
  calculation_input: 'bg-cyan-100 text-cyan-700',
  derived_result: 'bg-green-100 text-green-700',
  customer_information: 'bg-pink-100 text-pink-700',
  administrative: 'bg-gray-100 text-gray-600',
  verification: 'bg-indigo-100 text-indigo-700',
};

export default function InspectionMatrixPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [repairSystemFilter, setRepairSystemFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [purposeFilter, setPurposeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [nfpaOnly, setNfpaOnly] = useState(false);
  const [pdfOnly, setPdfOnly] = useState(false);
  const [estimateOnly, setEstimateOnly] = useState(false);
  const [materialCalcOnly, setMaterialCalcOnly] = useState(false);
  const [photoOnly, setPhotoOnly] = useState(false);
  const [conditionalOnly, setConditionalOnly] = useState(false);
  const [gapsOnly, setGapsOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await base44.entities.InspectionMatrixEntry.list('sort_order', 500);
      setEntries(data);
    } catch {
      toast.error('Failed to load inspection matrix');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleBuild = async () => {
    setBuilding(true);
    try {
      const res = await base44.functions.invoke('buildInspectionMatrix', {});
      toast.success(`Matrix built: ${res.data?.entries_created || 0} entries, ${res.data?.gaps_identified || 0} gaps found`);
      load();
    } catch {
      toast.error('Failed to build inspection matrix');
    } finally {
      setBuilding(false);
    }
  };

  const hasGap = (e) =>
    e.validation_unused || e.validation_duplicate || e.validation_incomplete ||
    e.validation_missing_mapping || e.validation_missing_repair_mapping ||
    e.validation_missing_pdf_mapping || e.validation_missing_material_calc ||
    e.validation_missing_estimate_mapping;

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (search) {
        const q = search.toLowerCase();
        if (!e.question_text?.toLowerCase().includes(q) &&
            !e.finding_type?.toLowerCase().includes(q) &&
            !e.section?.toLowerCase().includes(q) &&
            !e.subsection?.toLowerCase().includes(q)) return false;
      }
      if (sectionFilter !== 'all' && e.section !== sectionFilter) return false;
      if (repairSystemFilter !== 'all' && e.repair_system !== repairSystemFilter) return false;
      if (roleFilter !== 'all' && e.question_role !== roleFilter) return false;
      if (categoryFilter !== 'all' && e.question_category !== categoryFilter) return false;
      if (moduleFilter !== 'all' && e.inspection_module !== moduleFilter) return false;
      if (purposeFilter !== 'all') {
        const purposes = safeParse(e.question_purpose, []);
        if (!Array.isArray(purposes) || !purposes.includes(purposeFilter)) return false;
      }
      if (nfpaOnly && !e.nfpa_211_question) return false;
      if (pdfOnly && e.customer_pdf === 'hide') return false;
      if (estimateOnly && !e.estimate_recommendation) return false;
      if (materialCalcOnly && !e.feeds_material_calculator) return false;
      if (photoOnly && !e.photo_required && !e.photo_optional) return false;
      if (conditionalOnly && !e.conditional_logic) return false;
      if (gapsOnly && !hasGap(e)) return false;
      return true;
    });
  }, [entries, search, sectionFilter, repairSystemFilter, roleFilter, purposeFilter, categoryFilter, moduleFilter, nfpaOnly, pdfOnly, estimateOnly, materialCalcOnly, photoOnly, conditionalOnly, gapsOnly]);

  const stats = useMemo(() => {
    const total = entries.length;
    const gaps = entries.filter(hasGap).length;
    const nfpa = entries.filter(e => e.nfpa_211_question).length;
    const safety = entries.filter(e => e.safety_concern).length;
    const conditional = entries.filter(e => e.conditional_logic).length;
    const withMapping = entries.filter(e => e.pricebook_mapping).length;
    const withRule = entries.filter(e => e.recommendation_trigger).length;
    const inactive = entries.filter(e => !e.is_active).length;
    return { total, gaps, nfpa, safety, conditional, withMapping, withRule, inactive };
  }, [entries]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Inspection Matrix</h1>
          <p className="text-xs text-muted-foreground">
            Master blueprint of every inspection question and its downstream connections
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleBuild} disabled={building}>
            {building ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Rebuild Matrix
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportCSV(filtered)} disabled={filtered.length === 0}>
            <FileText className="w-3.5 h-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportExcel(filtered)} disabled={filtered.length === 0}>
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportPDF(filtered)} disabled={filtered.length === 0}>
            <FileDown className="w-3.5 h-3.5" /> PDF
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p>
            <p className="text-lg font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Gaps</p>
            <p className="text-lg font-bold text-red-600">{stats.gaps}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">NFPA 211</p>
            <p className="text-lg font-bold text-blue-600">{stats.nfpa}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Safety</p>
            <p className="text-lg font-bold text-red-600">{stats.safety}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Conditional</p>
            <p className="text-lg font-bold text-amber-600">{stats.conditional}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Rule Linked</p>
            <p className="text-lg font-bold text-purple-600">{stats.withRule}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">PB Mapped</p>
            <p className="text-lg font-bold text-green-600">{stats.withMapping}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Inactive</p>
            <p className="text-lg font-bold text-gray-500">{stats.inactive}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search questions, findings, sections..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
            <Select value={sectionFilter} onValueChange={setSectionFilter}>
              <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FILTER_SECTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={repairSystemFilter} onValueChange={setRepairSystemFilter}>
              <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FILTER_REPAIR_SYSTEMS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FILTER_ROLES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={purposeFilter} onValueChange={setPurposeFilter}>
              <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FILTER_PURPOSES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[170px] h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FILTER_CATEGORIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FILTER_MODULES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <FilterToggle active={nfpaOnly} onClick={() => setNfpaOnly(!nfpaOnly)} label="NFPA 211" />
            <FilterToggle active={pdfOnly} onClick={() => setPdfOnly(!pdfOnly)} label="On PDF" />
            <FilterToggle active={estimateOnly} onClick={() => setEstimateOnly(!estimateOnly)} label="Estimate" />
            <FilterToggle active={materialCalcOnly} onClick={() => setMaterialCalcOnly(!materialCalcOnly)} label="Material Calc" />
            <FilterToggle active={photoOnly} onClick={() => setPhotoOnly(!photoOnly)} label="Photos" />
            <FilterToggle active={conditionalOnly} onClick={() => setConditionalOnly(!conditionalOnly)} label="Conditional" />
            <FilterToggle active={gapsOnly} onClick={() => setGapsOnly(!gapsOnly)} label="Incomplete / Gaps" variant="danger" />
          </div>
        </CardContent>
      </Card>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {entries.length} questions
        </p>
      </div>

      {/* Matrix entries */}
      {filtered.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center">
            <ClipboardList className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-3">
              {entries.length === 0
                ? 'No inspection matrix entries yet. Click "Rebuild Matrix" to analyze the inspection system.'
                : 'No questions match the current filters.'}
            </p>
            {entries.length === 0 && (
              <Button onClick={handleBuild} disabled={building} className="gap-1.5">
                {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Build Inspection Matrix
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(entry => {
            const flags = safeParse(entry.validation_flags, []);
            const hasIssue = flags.length > 0;
            return (
              <button
                key={entry.id}
                onClick={() => { setSelectedEntry(entry); setDetailOpen(true); }}
                className={`w-full text-left border rounded-lg p-3 hover:bg-muted/30 transition-colors ${
                  hasIssue ? 'border-red-200 bg-red-50/20' : 'border-border'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <Badge variant="secondary" className="text-[10px]">{entry.section}</Badge>
                      <Badge variant="outline" className="text-[10px]">{entry.subsection}</Badge>
                      {entry.question_role && (
                        <Badge className={`text-[10px] ${ROLE_COLOR[entry.question_role] || 'bg-gray-100 text-gray-600'}`}>
                          {(QUESTION_ROLES[entry.question_role]?.label) || entry.question_role}
                        </Badge>
                      )}
                      {entry.question_category && (
                        <Badge className={`text-[10px] ${CATEGORY_COLOR[entry.question_category] || 'bg-gray-100 text-gray-600'}`}>
                          {entry.question_category}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] capitalize">{entry.question_type?.replace(/_/g, ' ')}</Badge>
                      {entry.required && <Badge className="text-[10px] bg-red-100 text-red-700">Required</Badge>}
                      {entry.conditional_logic && <Badge className="text-[10px] bg-amber-100 text-amber-700">Conditional</Badge>}
                      {entry.nfpa_211_question && <Badge className="text-[10px] bg-blue-100 text-blue-700">NFPA</Badge>}
                      {entry.safety_concern && <Badge className="text-[10px] bg-red-100 text-red-700">Safety</Badge>}
                      {entry.repair_system && entry.repair_system !== 'none' && (
                        <Badge className="text-[10px] bg-purple-100 text-purple-700 capitalize">{entry.repair_system}</Badge>
                      )}
                      {entry.standard_names && (
                        <Badge className="text-[10px] bg-indigo-100 text-indigo-700" title={entry.standard_names}>
                          {entry.standard_names.split(';')[0]}{entry.standard_names.includes(';') ? ' +' : ''}
                        </Badge>
                      )}
                      {entry.standard_authority_levels && (
                        <Badge className="text-[10px] bg-red-50 text-red-600" title={entry.standard_authority_levels}>
                          {entry.standard_authority_levels.split(',')[0]}{entry.standard_authority_levels.includes(',') ? ' +' : ''}
                        </Badge>
                      )}
                      {entry.severity && (
                        <Badge className={`text-[10px] ${
                          entry.severity === 'critical' ? 'bg-red-100 text-red-700'
                          : entry.severity === 'major' ? 'bg-orange-100 text-orange-700'
                          : entry.severity === 'moderate' ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                        }`}>{entry.severity}</Badge>
                      )}
                      {!entry.is_active && <Badge className="text-[10px] bg-gray-200 text-gray-600">Inactive</Badge>}
                    </div>
                    <p className="text-sm font-medium line-clamp-1">{entry.question_text}</p>
                    {entry.shows_when && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">↳ {entry.shows_when}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {hasIssue && (
                      <Badge className="text-[10px] bg-red-100 text-red-700 gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" /> {flags.length}
                      </Badge>
                    )}
                    {entry.good_better_best && (
                      <Badge variant="outline" className="text-[10px]">{entry.good_better_best}</Badge>
                    )}
                    {entry.pricebook_mapping && (
                      <Badge className="text-[10px] bg-green-100 text-green-700">Mapped</Badge>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <MatrixEntryDetail entry={selectedEntry} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}

function FilterToggle({ active, onClick, label, variant }) {
  const base = 'px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors border';
  const styles = variant === 'danger'
    ? active
      ? 'bg-red-600 text-white border-red-600'
      : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
    : active
      ? 'bg-accent text-accent-foreground border-accent'
      : 'bg-muted text-muted-foreground border-border hover:bg-muted/80';
  return (
    <button onClick={onClick} className={`${base} ${styles}`}>{label}</button>
  );
}