import { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, FileSpreadsheet, FileDown, ShieldAlert, RefreshCw, ListChecks, ClipboardList, Info } from 'lucide-react';
import { toast } from 'sonner';
import {
  classifyGaps, CATEGORY_META, CATEGORY_ORDER, PRIORITY_META, QUESTION_ROLES,
  exportGapsCSV, exportGapsExcel, exportGapsPDF,
} from '@/lib/inspectionMatrixGapClassifier';
import { GAP_STATUSES, STATUS_ORDER } from '@/lib/inspectionGapConfig';
import GapDashboard from '@/components/inspection/gapreview/GapDashboard';
import GapFilters from '@/components/inspection/gapreview/GapFilters';
import GapCard from '@/components/inspection/gapreview/GapCard';
import GapDetailDrawer from '@/components/inspection/gapreview/GapDetailDrawer';
import GapActionDialog from '@/components/inspection/gapreview/GapActionDialog';
import GapProjectMode from '@/components/inspection/gapreview/GapProjectMode';
import DependencyFlow from '@/components/inspection/DependencyFlow';

const DOT_MAP = {
  red: 'bg-red-500', orange: 'bg-orange-500', amber: 'bg-amber-500',
  blue: 'bg-blue-500', purple: 'bg-purple-500', green: 'bg-green-500',
  cyan: 'bg-cyan-500', pink: 'bg-pink-500', indigo: 'bg-indigo-500', gray: 'bg-gray-400',
};

function safeParseGap(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

const DEFAULT_FILTERS = {
  status: 'all', assignedTo: 'all', priority: 'all', confidence: 'all',
  role: 'all', purpose: 'all', category: 'all', repairSystem: 'all',
  section: 'all', form: 'all', department: 'all', inspectionModule: 'all',
  nfpaOnly: false, estimateOnly: false, warehouseOnly: false,
  materialCalcOnly: false, pdfOnly: false, analyticsOnly: false,
};

export default function InspectionMatrixGapReview() {
  const [entries, setEntries] = useState([]);
  const [gapReviewMap, setGapReviewMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('audit');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedGap, setSelectedGap] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionDialog, setActionDialog] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [showFlow, setShowFlow] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [matrixData, reviewData, user] = await Promise.all([
        base44.entities.InspectionMatrixEntry.list('-matrix_build_date', 500),
        base44.entities.InspectionGapReview.filter({}).catch(() => []),
        base44.auth.me().catch(() => null),
      ]);
      setEntries(matrixData);
      const rMap = {};
      for (const r of reviewData) rMap[r.gap_id] = r;
      setGapReviewMap(rMap);
      setCurrentUser(user);
    } catch {
      toast.error('Failed to load gap review data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Classify + merge with review records
  const allGaps = useMemo(() => {
    const classified = classifyGaps(entries);
    return classified.map(gap => {
      const review = gapReviewMap[gap.gap_id];
      if (review) {
        return {
          ...gap,
          status: review.status || 'new',
          assigned_to: review.assigned_to || '',
          department: review.department || '',
          target_date: review.target_date || '',
          priority_override: review.priority_override || '',
          reviewed_by: review.reviewed_by || '',
          review_date: review.review_date || '',
          resolution_notes: review.resolution_notes || '',
          review_id: review.id,
        };
      }
      return gap;
    });
  }, [entries, gapReviewMap]);

  // Apply filters
  const filteredGaps = useMemo(() => {
    return allGaps.filter(g => {
      if (filters.status !== 'all' && g.status !== filters.status) return false;
      if (filters.assignedTo === 'unassigned' && g.assigned_to) return false;
      if (filters.assignedTo !== 'all' && filters.assignedTo !== 'unassigned' && g.assigned_to !== filters.assignedTo) return false;
      if (filters.priority !== 'all') {
        const effPri = g.priority_override || g.gap_priority;
        if (effPri !== filters.priority) return false;
      }
      if (filters.confidence !== 'all' && g.confidence_level !== filters.confidence) return false;
      if (filters.role !== 'all' && g.question_role !== filters.role) return false;
      if (filters.category !== 'all' && g.question_category !== filters.category) return false;
      if (filters.repairSystem !== 'all') {
        if (filters.repairSystem === 'none' && g.repair_system && g.repair_system !== 'none') return false;
        if (filters.repairSystem !== 'none' && g.repair_system !== filters.repairSystem) return false;
      }
      if (filters.section !== 'all' && g.section !== filters.section) return false;
      if (filters.form !== 'all' && g.inspection_type !== filters.form) return false;
      if (filters.inspectionModule !== 'all' && g.inspection_module !== filters.inspectionModule) return false;
      if (filters.department !== 'all' && g.department !== filters.department) return false;
      if (filters.purpose !== 'all') {
        const p = safeParseGap(g.question_purpose, []);
        if (!Array.isArray(p) || !p.includes(filters.purpose)) return false;
      }
      if (filters.nfpaOnly && !g.nfpa_211_question) return false;
      if (filters.estimateOnly && !g.estimate_recommendation) return false;
      if (filters.pdfOnly && g.customer_pdf === 'hide') return false;
      if (filters.warehouseOnly && !(g.impact_systems || []).includes('Warehouse')) return false;
      if (filters.materialCalcOnly && !(g.impact_systems || []).includes('Material Calculator')) return false;
      if (filters.analyticsOnly && !(g.impact_systems || []).includes('Analytics')) return false;
      return true;
    });
  }, [allGaps, filters]);

  // Assignees for filter dropdown
  const assignees = useMemo(() => {
    const set = new Set();
    for (const g of allGaps) if (g.assigned_to) set.add(g.assigned_to);
    return Array.from(set);
  }, [allGaps]);

  // Grouped by category for audit mode
  const grouped = useMemo(() => {
    const map = {};
    for (const cat of CATEGORY_ORDER) map[cat] = [];
    for (const g of filteredGaps) {
      if (!map[g.gap_category]) map[g.gap_category] = [];
      map[g.gap_category].push(g);
    }
    return map;
  }, [filteredGaps]);

  // ─── Upsert gap review record ───
  const upsertGapReview = async (gap, updates) => {
    const baseData = {
      gap_id: gap.gap_id,
      question_id: gap.question_id,
      question_text: gap.question_text,
      gap_type: gap.gap_type,
      gap_category: gap.gap_category,
      priority: gap.gap_priority,
      confidence_score: gap.confidence_score,
      confidence_level: gap.confidence_level,
      confidence_reason: gap.confidence_reason,
      systems_affected: JSON.stringify(gap.impact_systems || []),
      question_role: gap.question_role,
      question_purpose: gap.question_purpose,
      question_category: gap.question_category,
      section: gap.section,
      subsection: gap.subsection,
      inspection_type: gap.inspection_type,
      repair_system: gap.repair_system,
      nfpa_211_question: gap.nfpa_211_question,
      safety_concern: gap.safety_concern,
      estimate_recommendation: gap.estimate_recommendation,
      customer_pdf: gap.customer_pdf,
      logic_source: gap.logic_source,
      gap_why: gap.gap_why,
      gap_action: gap.gap_action,
      matrix_build_date: gap.matrix_build_date,
      ...updates,
    };
    if (gap.review_id) {
      await base44.entities.InspectionGapReview.update(gap.review_id, baseData);
      return { ...gap, ...updates };
    } else {
      const rec = await base44.entities.InspectionGapReview.create(baseData);
      return { ...gap, ...updates, review_id: rec.id };
    }
  };

  const handleMarkStatus = async (gap, status) => {
    try {
      const updates = { status };
      if (['reviewed', 'fixed', 'not_applicable'].includes(status)) {
        updates.reviewed_by = currentUser?.full_name || 'Unknown';
        updates.review_date = new Date().toISOString();
      }
      const updated = await upsertGapReview(gap, updates);
      setGapReviewMap(prev => ({ ...prev, [updated.gap_id]: updated }));
      if (selectedGap?.gap_id === gap.gap_id) setSelectedGap(updated);
      toast.success(`Gap marked as ${GAP_STATUSES[status]?.label || status}`);
    } catch {
      toast.error('Failed to update gap status');
    }
  };

  const handleAssign = async (gap, data) => {
    try {
      const updated = await upsertGapReview(gap, data);
      setGapReviewMap(prev => ({ ...prev, [updated.gap_id]: updated }));
      if (selectedGap?.gap_id === gap.gap_id) setSelectedGap(updated);
      setActionDialog(null);
      toast.success('Gap assigned successfully');
    } catch {
      toast.error('Failed to assign gap');
    }
  };

  const handleAddNote = async (gap, data) => {
    try {
      const existingNote = gap.resolution_notes || '';
      const newNote = data.resolution_notes || '';
      const combinedNote = existingNote
        ? `${existingNote}\n---\n[${new Date().toLocaleString()}] ${newNote}`
        : `[${new Date().toLocaleString()}] ${newNote}`;
      const updated = await upsertGapReview(gap, { resolution_notes: combinedNote });
      setGapReviewMap(prev => ({ ...prev, [updated.gap_id]: updated }));
      if (selectedGap?.gap_id === gap.gap_id) setSelectedGap(updated);
      setActionDialog(null);
      toast.success('Note added');
    } catch {
      toast.error('Failed to add note');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await base44.functions.invoke('syncGapReviews', { gaps: allGaps });
      toast.success(`Synced: ${res.data?.created || 0} created, ${res.data?.updated || 0} updated, ${res.data?.marked_fixed || 0} auto-resolved`);
      const reviewData = await base44.entities.InspectionGapReview.filter({});
      const rMap = {};
      for (const r of reviewData) rMap[r.gap_id] = r;
      setGapReviewMap(rMap);
    } catch {
      toast.error('Failed to sync gap reviews');
    } finally {
      setSyncing(false);
    }
  };

  const handleViewDetail = (gap) => {
    setSelectedGap(gap);
    setDrawerOpen(true);
  };

  const toggleCategory = (cat) => setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-500" />
            Inspection Improvement Management
          </h1>
          <p className="text-xs text-muted-foreground">
            {allGaps.length} gap instances across {new Set(allGaps.map(g => g.question_id)).size} questions ·
            {allGaps.filter(g => g.status === 'fixed' || g.status === 'not_applicable').length} resolved ·
            {allGaps.filter(g => g.status !== 'fixed' && g.status !== 'not_applicable').length} remaining
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode toggle */}
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setMode('audit')}
              className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 ${mode === 'audit' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
            >
              <ListChecks className="w-3.5 h-3.5" /> Audit Mode
            </button>
            <button
              onClick={() => setMode('project')}
              className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 ${mode === 'project' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
            >
              <ClipboardList className="w-3.5 h-3.5" /> Project Mode
            </button>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowFlow(!showFlow)}>
            <Info className="w-3.5 h-3.5" /> Flow
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSync} disabled={syncing || allGaps.length === 0}>
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Sync
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportGapsCSV(filteredGaps)} disabled={filteredGaps.length === 0}>
            <FileText className="w-3.5 h-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportGapsExcel(filteredGaps)} disabled={filteredGaps.length === 0}>
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportGapsPDF(filteredGaps)} disabled={filteredGaps.length === 0}>
            <FileDown className="w-3.5 h-3.5" /> PDF
          </Button>
        </div>
      </div>

      {/* Dependency Flow */}
      {showFlow && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <p className="text-xs font-semibold mb-2 text-muted-foreground">Question Dependency Flow</p>
            <DependencyFlow activeRole={filters.role !== 'all' ? filters.role : null} />
          </CardContent>
        </Card>
      )}

      {/* Dashboard */}
      <GapDashboard gaps={allGaps} />

      {/* Filters */}
      <GapFilters filters={filters} setFilters={setFilters} assignees={assignees} />

      {/* Results summary */}
      <p className="text-xs text-muted-foreground">
        Showing {filteredGaps.length} of {allGaps.length} gaps
      </p>

      {/* Gap list */}
      {filteredGaps.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center">
            <ShieldAlert className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No gaps match the current filters.</p>
          </CardContent>
        </Card>
      ) : mode === 'project' ? (
        <GapProjectMode
          gaps={filteredGaps}
          onViewDetail={handleViewDetail}
          onMarkStatus={handleMarkStatus}
          onAssign={(gap) => setActionDialog({ type: 'assign', gap })}
          onAddNote={(gap) => setActionDialog({ type: 'note', gap })}
        />
      ) : (
        <div className="space-y-2">
          {CATEGORY_ORDER.map(cat => {
            const catGaps = grouped[cat] || [];
            if (catGaps.length === 0) return null;
            const meta = CATEGORY_META[cat];
            const isExpanded = expandedCategories[cat] !== false;

            return (
              <Card key={cat} className="border-0 shadow-sm overflow-hidden">
                <button
                  onClick={() => toggleCategory(cat)}
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${DOT_MAP[meta.color]}`} />
                    <span className="text-sm font-semibold">{meta.label}</span>
                    <span className="text-xs text-muted-foreground hidden md:inline">— {meta.description}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {['critical', 'high', 'medium', 'low'].map(pri => {
                      const c = catGaps.filter(g => (g.priority_override || g.gap_priority) === pri).length;
                      if (c === 0) return null;
                      return <Badge key={pri} className="text-[10px]">{PRIORITY_META[pri].label}: {c}</Badge>;
                    })}
                    <Badge variant="secondary" className="text-[10px]">{catGaps.length}</Badge>
                  </div>
                </button>
                {isExpanded && (
                  <div className="divide-y divide-border">
                    {catGaps.map((gap, idx) => (
                      <GapCard
                        key={`${gap.gap_id}_${idx}`}
                        gap={gap}
                        onViewDetail={handleViewDetail}
                        onMarkStatus={handleMarkStatus}
                        onAssign={(g) => setActionDialog({ type: 'assign', gap: g })}
                        onAddNote={(g) => setActionDialog({ type: 'note', gap: g })}
                      />
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail Drawer */}
      <GapDetailDrawer
        gap={selectedGap}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onMarkStatus={handleMarkStatus}
        onAssign={(g) => setActionDialog({ type: 'assign', gap: g })}
        onAddNote={(g) => setActionDialog({ type: 'note', gap: g })}
      />

      {/* Action Dialog */}
      <GapActionDialog
        dialog={actionDialog}
        gap={actionDialog?.gap || null}
        onClose={() => setActionDialog(null)}
        onSave={actionDialog?.type === 'assign' ? handleAssign : handleAddNote}
      />
    </div>
  );
}