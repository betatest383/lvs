import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Play, ArrowLeft, Package, AlertTriangle, ShieldCheck, AlertCircle, FilePlus2, ChevronDown, ChevronUp, FlaskConical } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { createSession, clearAllLocalSessions, classifySession } from '@/lib/warehouseSetupSession';
import SessionManagerTable from '@/components/warehouse/setup/SessionManagerTable';
import ActivationExceptionsPanel from '@/components/warehouse/setup/ActivationExceptionsPanel';

const TABS = [
  { key: 'active', label: 'Active', statuses: ['awaiting_review', 'approved', 'posting', 'partially_posted'] },
  { key: 'draft', label: 'Draft', statuses: ['in_progress'] },
  { key: 'completed', label: 'Completed', statuses: ['completed'] },
  { key: 'archived', label: 'Archived', statuses: ['abandoned'] },
  { key: 'test', label: 'Test Records', statuses: null },
];

/**
 * Extract unresolved activation exceptions from sessions.
 * STRICT filters — only returns failures that meet ALL of these:
 *  - session.data_classification !== 'test' && !== 'superseded_test'
 *  - session.status !== 'abandoned' && !== 'archived'
 *  - failure.resolved !== true && failure.status !== 'resolved'
 *  - session.id exists
 *  - session has valid session_id and warehouse_location_name (no "Session: N/A")
 *  - session_id does NOT start with WSS-PARTIAL-FAIL (known dev test prefix)
 *  - item_name does NOT contain "Partial Failure Test" (known dev test item)
 */
function extractUnresolvedExceptions(sessions) {
  return sessions
    .filter(s => s && s.id)
    .filter(s => s.data_classification !== 'test' && s.data_classification !== 'superseded_test')
    .filter(s => s.status !== 'abandoned')
    .filter(s => !(s.session_id || '').startsWith('WSS-PARTIAL-FAIL'))
    .flatMap(s => {
      const results = s.activation_results_json ? (() => { try { return JSON.parse(s.activation_results_json); } catch { return []; } })() : [];
      return results
        .filter(r => !r.success)
        .filter(r => !r.resolved && r.status !== 'resolved')
        .filter(r => !(r.item_name || '').includes('Partial Failure Test'))
        .filter(r => s.session_id && s.warehouse_location_name)
        .map(r => ({
          session_record_id: s.id,
          session_id: s.session_id,
          warehouse: s.warehouse_location_name,
          item_id: r.item_id,
          item_name: r.item_name || 'Unknown Item',
          count: r.count,
          failure_type: r.idempotent ? 'idempotency_conflict' : 'activation_error',
          failure_message: r.error || 'Unknown error',
          idempotency_key: r.idempotency_key,
          date: r.posted_at || s.updated_date || s.started_at,
          status: 'unresolved',
        }));
    });
}

export default function WarehouseSetupDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [activeTab, setActiveTab] = useState('active');
  const [creatingTest, setCreatingTest] = useState(false);
  const [showExceptions, setShowExceptions] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const data = await base44.entities.InventoryCountSession.list('-updated_date', 200);
      setSessions(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const isAdmin = user?.role === 'admin';

  // ── Classification helpers ──
  const isTestSession = (s) => s.data_classification === 'test' || s.data_classification === 'superseded_test';
  const isProductionSession = (s) => !isTestSession(s);

  const tabSessions = (tabKey) => {
    const tab = TABS.find(t => t.key === tabKey);
    if (!tab) return [];
    if (tabKey === 'test') return sessions.filter(isTestSession);
    return sessions.filter(s => tab.statuses.includes(s.status) && isProductionSession(s));
  };

  // ── Stats ──
  const productionSessions = useMemo(() => sessions.filter(isProductionSession), [sessions]);
  const activeCount = TABS[0].statuses.flatMap(st => productionSessions.filter(x => x.status === st)).length;
  const draftCount = productionSessions.filter(s => s.status === 'in_progress').length;
  const completedCount = productionSessions.filter(s => s.status === 'completed').length;
  const archivedCount = productionSessions.filter(s => s.status === 'abandoned').length;

  // ── Unresolved activation exceptions (production only) ──
  const unresolvedExceptions = useMemo(() => extractUnresolvedExceptions(sessions), [sessions]);

  const handleStartNewSession = async () => {
    setCreatingTest(true);
    try {
      const { session: newSession } = await createSession();
      clearAllLocalSessions();
      const launchWarehouseId = new URLSearchParams(window.location.search).get('warehouseId');
      const targetPath = launchWarehouseId
        ? `/warehouse/setup/${newSession.id}?warehouseId=${launchWarehouseId}`
        : `/warehouse/setup/${newSession.id}`;
      toast({ title: 'New session created', description: `Session ${newSession.session_id} ready at Step 1.` });
      navigate(targetPath);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Failed to create session', description: e.response?.data?.error || e.message });
    } finally {
      setCreatingTest(false);
    }
  };

  const handleClassifyAsTest = async (session) => {
    try {
      await classifySession(session.id, 'test', 'Classified as test from Session Manager');
      toast({ title: 'Session classified as test', description: `${session.session_id} moved to Test Records.` });
      loadSessions();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Classification failed', description: e.response?.data?.error || e.message });
    }
  };

  const handleClassifyAsProduction = async (session) => {
    try {
      await classifySession(session.id, 'production', 'Restored to production from Test Records');
      toast({ title: 'Session restored to production', description: `${session.session_id} moved back to operational tabs.` });
      loadSessions();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Classification failed', description: e.response?.data?.error || e.message });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Warehouse Setup Sessions</h1>
          <p className="text-sm text-muted-foreground mt-1">Track and manage warehouse inventory setup sessions.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to="/warehouse" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input text-sm hover:bg-accent/10">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <button
            onClick={handleStartNewSession}
            disabled={creatingTest}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
          >
            {creatingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus2 className="w-4 h-4" />}
            Start New Session
          </button>
          <Link to="/warehouse/setup" className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md border border-input text-sm font-medium hover:bg-accent/10">
            <Play className="w-4 h-4" /> Resume Wizard
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="flex items-center gap-3 p-4 rounded-lg border bg-card">
          <Package className="w-5 h-5 text-blue-600" /><div><p className="text-2xl font-bold">{activeCount}</p><p className="text-xs text-muted-foreground">Active</p></div>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-lg border bg-card">
          <AlertTriangle className="w-5 h-5 text-amber-600" /><div><p className="text-2xl font-bold">{draftCount}</p><p className="text-xs text-muted-foreground">Draft</p></div>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-lg border bg-card">
          <ShieldCheck className="w-5 h-5 text-green-700" /><div><p className="text-2xl font-bold">{completedCount}</p><p className="text-xs text-muted-foreground">Completed</p></div>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-lg border bg-card">
          <AlertCircle className="w-5 h-5 text-gray-500" /><div><p className="text-2xl font-bold">{archivedCount}</p><p className="text-xs text-muted-foreground">Archived</p></div>
        </div>
      </div>

      {/* ─── Activation Exceptions (compact banner + expandable detail) ─── */}
      {unresolvedExceptions.length > 0 ? (
        <div className="space-y-2">
          <button
            onClick={() => setShowExceptions(!showExceptions)}
            className="w-full flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100/70 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <span className="text-sm font-medium text-red-900">
                {unresolvedExceptions.length} unresolved activation {unresolvedExceptions.length === 1 ? 'exception' : 'exceptions'}
              </span>
            </div>
            {showExceptions ? <ChevronUp className="w-4 h-4 text-red-600" /> : <ChevronDown className="w-4 h-4 text-red-600" />}
          </button>
          {showExceptions && (
            <ActivationExceptionsPanel exceptions={unresolvedExceptions} onRefresh={loadSessions} />
          )}
        </div>
      ) : (
        <div className="p-3 rounded-lg border bg-card flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="w-4 h-4 text-green-600" />
          No unresolved activation exceptions.
        </div>
      )}

      {/* ─── Session Manager ─── */}
      <div className="space-y-3">
        <h2 className="font-semibold">Session Manager</h2>

        <div className="flex gap-1 border-b overflow-x-auto">
          {TABS.map(tab => {
            const count = tabSessions(tab.key).length;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === tab.key
                    ? 'border-accent text-accent'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.key === 'test' && <FlaskConical className="w-3.5 h-3.5" />}
                {tab.label} ({count})
              </button>
            );
          })}
        </div>

        {activeTab === 'test' && (
          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800 flex items-center gap-2">
            <FlaskConical className="w-4 h-4 shrink-0" />
            Test records are hidden from operational views. Use the Classify as Production action to restore a session to normal tabs.
          </div>
        )}

        <SessionManagerTable
          sessions={tabSessions(activeTab)}
          onRefresh={loadSessions}
          canDelete={isAdmin}
          canStartTest={isAdmin}
          isTestTab={activeTab === 'test'}
          onClassifyAsTest={handleClassifyAsTest}
          onClassifyAsProduction={handleClassifyAsProduction}
        />
      </div>
    </div>
  );
}