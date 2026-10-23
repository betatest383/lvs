import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Archive, MapPin, Clock, Hash, AlertTriangle, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { loadActiveSession, loadSessionById, createSession, persistStep, persistCounts, saveLocalCounts, loadLocalCounts, clearLocal, clearAllLocalSessions, archiveSession, submitForReview, approveCounts, rejectCounts, activateSession } from '@/lib/warehouseSetupSession';
import WizardProgress from '@/components/warehouse/setup/WizardProgress';
import AIAssistPanel from '@/components/warehouse/setup/AIAssistPanel';
import WizardNav from '@/components/warehouse/setup/WizardNav';
import SessionResumeDialog from '@/components/warehouse/setup/SessionResumeDialog';
import StepSelectWarehouse from '@/components/warehouse/setup/StepSelectWarehouse';
import StepSelectOrAddBins from '@/components/warehouse/setup/StepSelectOrAddBins';
import StepStockAndCount from '@/components/warehouse/setup/StepStockAndCount';
import StepReviewExceptions from '@/components/warehouse/setup/StepReviewExceptions';
import { UnassignedWarningDialog } from '@/components/warehouse/setup/AssignmentDialogs';
import StepReview from '@/components/warehouse/setup/StepReview';
import StepActivate from '@/components/warehouse/setup/StepActivate';

const STEP_NAMES = ['Select Warehouse', 'Select or Add Bins', 'Stock & Count', 'Review Exceptions', 'Review', 'Activate'];

export default function WarehouseSetupWizard() {
  const navigate = useNavigate();
  const { sessionId: routeSessionId } = useParams();
  const preselectedWarehouseId = new URLSearchParams(window.location.search).get('warehouseId');
  const { user } = useAuth();
  const { toast } = useToast();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState([]);
  const [bins, setBins] = useState([]);
  const [permissions, setPermissions] = useState({});
  const [totals, setTotals] = useState({});
  const [counts, setCounts] = useState({});
  const [userQuestion, setUserQuestion] = useState('');
  const [showUnassignedWarning, setShowUnassignedWarning] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [unfinishedSession, setUnfinishedSession] = useState(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [assignmentsValid, setAssignmentsValid] = useState(false);
  const [exceptionsCleared, setExceptionsCleared] = useState(false);

  const loadSupportingData = useCallback(async (sessionObj) => {
    try {
      const [locs, bns] = await Promise.all([
        base44.entities.WarehouseLocation.list('-created_date', 500),
        base44.entities.BinLocation.list('-created_date', 500),
      ]);
      setLocations(locs || []);
      setBins(bns || []);

      const matRes = await base44.functions.invoke('queryWarehouseMaterials', { page: 1, page_size: 1 });
      const matData = matRes.data || matRes;
      if (matData.permissions) setPermissions(matData.permissions);
      if (matData.totals) setTotals(matData.totals);
    } catch (e) {
      console.error('Failed to load data:', e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      // ── Route param: load the EXACT session from the URL ──
      // Also refetches when user changes (Act As User) to pick up
      // approval state synced by another user.
      if (routeSessionId) {
        try {
          const { session: target, counts: targetCounts } = await loadSessionById(routeSessionId);
          if (target) {
            setSession(target);
            setCounts(targetCounts && Object.keys(targetCounts).length > 0 ? targetCounts : loadLocalCounts(target.id));
            await loadSupportingData(target);
          } else {
            toast({ variant: 'destructive', title: 'Session not found', description: 'Redirecting to setup sessions.' });
            navigate('/warehouse/setup-dashboard');
          }
        } catch (e) {
          console.error('Failed to load session by ID:', e);
          toast({ variant: 'destructive', title: 'Failed to load session', description: e.response?.data?.error || e.message });
          navigate('/warehouse/setup-dashboard');
        } finally {
          setLoading(false);
        }
        return;
      }

      // ── No route param: check for unfinished session ──
      const { session: existing, counts: existingCounts, hasUnfinished } = await loadActiveSession();

      if (hasUnfinished && existing) {
        setUnfinishedSession(existing);
        setCounts(existingCounts && Object.keys(existingCounts).length > 0 ? existingCounts : loadLocalCounts(existing.id));
        setShowResumeDialog(true);
        setLoading(false);
        return;
      }

      // ── No unfinished session — create a brand new one ──
      try {
        const { session: newSession, counts: newCounts } = await createSession();
        clearAllLocalSessions();
        setSession(newSession);
        setCounts(newCounts || {});
        // Navigate to the explicit session route so URL reflects the active session
        navigate(`/warehouse/setup/${newSession.id}`, { replace: true });
        await loadSupportingData(newSession);
      } catch (e) {
        console.error('Failed to initialize session:', e);
        toast({ variant: 'destructive', title: 'Failed to create session', description: e.response?.data?.error || e.message });
      } finally {
        setLoading(false);
      }
    })();
  }, [routeSessionId, user?.email]);

  const handleResume = async () => {
    setShowResumeDialog(false);
    setLoading(true);
    try {
      const sess = unfinishedSession;
      setSession(sess);
      setCounts(loadLocalCounts(sess.id));
      // Navigate to the explicit session route
      navigate(`/warehouse/setup/${sess.id}`, { replace: true });
      await loadSupportingData(sess);
    } catch (e) {
      console.error('Failed to resume:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveAndStartNew = async () => {
    setShowResumeDialog(false);
    setLoading(true);
    try {
      const { session: newSession, counts: newCounts } = await createSession(unfinishedSession?.id);
      clearAllLocalSessions();
      setSession(newSession);
      setCounts(newCounts || {});
      setUnfinishedSession(null);
      navigate(`/warehouse/setup/${newSession.id}`, { replace: true });
      await loadSupportingData(newSession);
      toast({ title: 'New session started', description: `Previous session archived. New session ${newSession.session_id} created.` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Failed to start new session', description: e.response?.data?.error || e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelResume = () => {
    setShowResumeDialog(false);
    navigate('/warehouse/setup-dashboard');
  };

  const handleArchiveCurrent = async () => {
    if (!session?.id) return;
    setArchiving(true);
    try {
      await archiveSession(session.id);
      clearLocal(session.id);
      toast({ title: 'Session archived', description: `${session.session_id} has been archived for audit.` });
      navigate('/warehouse/setup-dashboard');
    } catch (e) {
      toast({ variant: 'destructive', title: 'Archive failed', description: e.response?.data?.error || e.message });
    } finally {
      setArchiving(false);
      setShowArchiveConfirm(false);
    }
  };

  const loadData = useCallback(async () => {
    try {
      const [locs, bns] = await Promise.all([
        base44.entities.WarehouseLocation.list('-created_date', 500),
        base44.entities.BinLocation.list('-created_date', 500),
      ]);
      setLocations(locs || []);
      setBins(bns || []);

      // Refresh permissions and totals
      const matRes = await base44.functions.invoke('queryWarehouseMaterials', { page: 1, page_size: 1 });
      const matData = matRes.data || matRes;
      if (matData.permissions) setPermissions(matData.permissions);
      if (matData.totals) setTotals(matData.totals);
    } catch (e) {
      console.error('Failed to load data:', e);
    }
  }, [session?.id, session?.warehouse_location_id]);

  const handleSessionUpdate = useCallback((updatedSession) => {
    setSession(updatedSession);
  }, []);

  // ─── Status-driven step routing (authoritative) ───
  // Session status determines the accessible step. Persisted current_step
  // is only used for in_progress sessions and capped at Step 5 Review —
  // an awaiting_review session never defaults to Activate.
  const STATUS_STEP_MAP = {
    awaiting_review: 4,
    approved: 5,
    posting: 5,
    partially_posted: 5,
    completed: 5,
    abandoned: 0,
  };
  const isCompleted = session?.status === 'completed' || !!session?.completed_at;
  const sessionStatus = session?.status || 'in_progress';
  const currentStep = isCompleted
    ? 5
    : STATUS_STEP_MAP[sessionStatus] !== undefined
      ? STATUS_STEP_MAP[sessionStatus]
      : Math.min(session?.current_step || 0, 4);
  const isStepLocked = ['awaiting_review', 'approved', 'posting', 'partially_posted', 'completed', 'abandoned'].includes(sessionStatus);

  const handleCountChange = useCallback((updater) => {
    setCounts(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (session?.id) {
        persistCounts(session.id, next).catch(e => {
          toast({ variant: 'destructive', title: 'Failed to save counts', description: e.response?.data?.error || e.message });
        });
      }
      if (session?.id) saveLocalCounts(session.id, next);
      return next;
    });
  }, [session, toast]);

  const countedItems = Object.values(counts).filter(v => v?.count !== undefined && v?.count !== '').length;
  const sessionAssignedCount = session?.assigned_item_ids?.length || 0;
  const noMaterialsConfirmed = session?.no_materials_confirmed || false;
  const allItemsCounted = sessionAssignedCount === 0
    ? noMaterialsConfirmed
    : countedItems >= sessionAssignedCount;
  const sessionAdvanced = ['awaiting_review', 'approved', 'posting', 'partially_posted', 'completed'].includes(session?.status);

  const stepCompleted = [
    !!session?.warehouse_location_id,
    bins.filter(b => b.warehouse_location_id === session?.warehouse_location_id && b.is_active !== false).length > 0,
    (sessionAssignedCount > 0 && assignmentsValid) || noMaterialsConfirmed,
    exceptionsCleared || sessionAdvanced,
    ['approved', 'posting', 'partially_posted', 'completed'].includes(session?.status),
    session?.status === 'completed',
  ];

  const canContinue = stepCompleted[currentStep] || false;
  const isLastStep = currentStep === 5;

  const advanceStep = () => {
    if (currentStep < 5 && session?.id) {
      const next = currentStep + 1;
      persistStep(session.id, next);
      setSession(s => ({ ...s, current_step: next }));
    }
  };

  const handleContinue = () => {
    advanceStep();
  };

  const handlePrevious = () => {
    if (currentStep > 0 && session?.id) {
      const prev = currentStep - 1;
      persistStep(session.id, prev);
      setSession(s => ({ ...s, current_step: prev }));
    }
  };

  const handleSaveProgress = () => {
    if (session?.id) {
      persistCounts(session.id, counts).catch(e => {
        toast({ variant: 'destructive', title: 'Failed to save', description: e.response?.data?.error || e.message });
      });
    }
  };

  const handleExit = () => {
    handleSaveProgress();
    navigate('/warehouse');
  };

  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const handleSubmitForReview = async () => {
    if (!session?.id || isSubmittingReview) return;
    setIsSubmittingReview(true);
    try {
      const updated = await submitForReview(session.id);
      // Always refresh the full session from backend to reflect true status
      const { session: refreshed } = await loadSessionById(session.id);
      setSession(refreshed || updated);
      if (updated?.status === 'awaiting_review' && updated?.submitted_at !== session?.submitted_at) {
        toast({ title: 'Submitted for review', description: 'Owner or Authorized Director must review and approve.' });
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'Failed to submit', description: e.response?.data?.error || e.message });
      // On error, refresh session to catch cases where backend transitioned but response failed
      try {
        const { session: refreshed } = await loadSessionById(session.id);
        if (refreshed) setSession(refreshed);
      } catch {}
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleApprove = async () => {
    if (!session?.id) return;
    try {
      const { summary } = await approveCounts(session.id);
      // ── Refresh from backend so status-driven routing moves to Step 6 Activate ──
      const { session: refreshed } = await loadSessionById(session.id);
      setSession(refreshed);
      toast({ title: 'Counts approved', description: `${summary?.item_count || 0} items, $${(summary?.total_value || 0).toFixed(2)} total value (server-calculated).` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Approval failed', description: e.response?.data?.error || e.message });
    }
  };

  const handleReject = async (reason) => {
    if (!session?.id) return;
    try {
      const updated = await rejectCounts(session.id, reason);
      // ── Route submitter to Stock & Count (step 2) for corrections ──
      if (updated?.id) {
        await persistStep(updated.id, 2);
        const { session: refreshed } = await loadSessionById(updated.id);
        setSession(refreshed || updated);
      } else {
        setSession(updated);
      }
      toast({ title: 'Returned for correction', description: 'Session reverted to in_progress. Submitter notified.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Return failed', description: e.response?.data?.error || e.message });
    }
  };

  const handleActivate = async () => {
    if (!session?.id) return;
    // ── Frontend guard: never re-activate a completed session ──
    if (session?.status === 'completed') return;
    try {
      const { session: updated, summary } = await activateSession(session.id);
      // ── Refetch from backend to render the true persisted completed state ──
      const { session: refreshed } = await loadSessionById(session.id);
      setSession(refreshed || updated);
      // Clear stale local counts cache
      if (session?.id) clearLocal(session.id);
      if (summary?.all_posted) {
        toast({ title: 'Inventory activated!', description: `${summary.succeeded} opening balances created.` });
      } else if (summary?.already_completed) {
        toast({ title: 'Already activated', description: `${summary.succeeded} opening balances already posted.` });
      } else {
        toast({ variant: 'destructive', title: `${summary?.failed || 0} activation(s) failed`, description: `${summary?.succeeded || 0} succeeded. Session marked as Partially Posted.` });
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'Activation failed', description: e.response?.data?.error || e.message });
    }
  };

  const handleFinish = () => {
    if (session?.id) clearLocal(session.id);
    navigate('/warehouse/setup-dashboard');
  };

  const handleViewInventory = () => {
    navigate('/inventory');
  };

  // ─── AI context: backend loads all session data server-side ───
  // The panel only needs session ID, step, and user — the backend
  // loads assigned items, bins, counts, and metrics from the DB.
  const aiContext = {
    session_id: session?.id || session?.session_id,
    step_index: currentStep,
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0: return <StepSelectWarehouse locations={locations} bins={bins} session={session} permissions={permissions} onDataChange={loadData} onSessionUpdate={handleSessionUpdate} preselectedWarehouseId={preselectedWarehouseId} />;
      case 1: return <StepSelectOrAddBins locations={locations} bins={bins} session={session} permissions={permissions} onDataChange={loadData} />;
      case 2: return <StepStockAndCount key={session?.id} locations={locations} bins={bins} onDataChange={loadData} permissions={permissions} onContinue={handleContinue} session={session} onSessionUpdate={handleSessionUpdate} onValidityChange={setAssignmentsValid} onCountChange={handleCountChange} />;
      case 3: return <StepReviewExceptions key={session?.id} locations={locations} bins={bins} permissions={permissions} session={session} onSessionUpdate={handleSessionUpdate} onCountChange={handleCountChange} onValidityChange={setExceptionsCleared} onContinue={handleContinue} />;
      case 4: return <StepReview counts={counts} locations={locations} bins={bins} session={session} userEmail={user?.email} onSubmitForReview={handleSubmitForReview} onApprove={handleApprove} onReject={handleReject} onReturnToCounts={() => { if (session?.id) { persistStep(session.id, 3); setSession(s => ({ ...s, current_step: 3 })); } }} permissions={permissions} wizardSubmitting={isSubmittingReview} />;
      case 5: return <StepActivate session={session} onActivate={handleActivate} />;
      default: return null;
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
    <div className="min-h-screen flex flex-col">
      <WizardProgress currentStep={currentStep} isCompleted={isCompleted} />

      {/* ── Session Identity Header ── */}
      {session && (
        <div className="border-b bg-muted/30 px-4 py-2">
          <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <span className="flex items-center gap-1.5 font-medium">
                <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-mono">{session.session_id}</span>
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="w-3.5 h-3.5" />
                {session.warehouse_location_name || 'No location set'}
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                {session.started_at ? new Date(session.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                session.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                session.status === 'awaiting_review' ? 'bg-amber-100 text-amber-700' :
                session.status === 'completed' ? 'bg-green-100 text-green-700' :
                session.status === 'abandoned' ? 'bg-gray-200 text-gray-600' :
                'bg-purple-100 text-purple-700'
              }`}>
                {session.status === 'in_progress' ? 'Draft' :
                 session.status === 'abandoned' ? 'Archived' :
                 session.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {session.status === 'in_progress' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowArchiveConfirm(true)}
                  disabled={archiving}
                >
                  {archiving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Archive className="w-3 h-3" />}
                  Archive Session
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {renderStep()}

          <AIAssistPanel
            stepIndex={currentStep}
            stepName={STEP_NAMES[currentStep]}
            session={session}
            user={user}
            permissions={permissions}
          />
        </div>
      </div>

      <div className="sticky bottom-0">
        <WizardNav
          currentStep={currentStep}
          canContinue={canContinue}
          onContinue={handleContinue}
          onPrevious={handlePrevious}
          onSaveProgress={handleSaveProgress}
          onExit={handleExit}
          isLastStep={isLastStep}
          isCompleted={isCompleted}
          onFinish={handleFinish}
          onViewInventory={handleViewInventory}
        />
      </div>

      <UnassignedWarningDialog
        open={showUnassignedWarning}
        unassignedCount={totals.stocked_unassigned || 0}
        onContinue={() => { setShowUnassignedWarning(false); advanceStep(); }}
        onGoBack={() => setShowUnassignedWarning(false)}
      />

      <SessionResumeDialog
        open={showResumeDialog}
        session={unfinishedSession}
        onResume={handleResume}
        onArchiveAndStartNew={handleArchiveAndStartNew}
        onCancel={handleCancelResume}
      />

      {/* ── Archive Confirmation Dialog ── */}
      <Dialog open={showArchiveConfirm} onOpenChange={(open) => !open && setShowArchiveConfirm(false)}>
        <DialogContent className="max-w-md" onCloseAttempt={() => setShowArchiveConfirm(false)}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Archive this warehouse setup?
            </DialogTitle>
            <DialogDescription>
              The session will remain available for audit but cannot be resumed unless restored.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800">
            Session <span className="font-mono font-medium">{session?.session_id}</span> will be moved to Archived.
            Its assigned materials and counts will not carry over to any new session.
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button variant="outline" className="w-full" onClick={() => setShowArchiveConfirm(false)}>
              <X className="w-4 h-4" /> Cancel
            </Button>
            <Button variant="destructive" className="w-full" onClick={handleArchiveCurrent} disabled={archiving}>
              {archiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
              Archive Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}