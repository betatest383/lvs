import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { stableSortQuestions } from '@/lib/inspectionQuestionOrdering';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Eye, CheckCircle2, XCircle, Clock, User, Camera, AlertTriangle, Loader2, ShieldAlert, FileText, MapPin } from 'lucide-react';
import moment from 'moment';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';
// ScrollArea replaced with native overflow-y-auto for reliable touch + mouse wheel scrolling

const SEVERITY_STYLES = {
  info: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Info' },
  minor: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Minor' },
  moderate: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Moderate' },
  major: { bg: 'bg-red-100', text: 'text-red-700', label: 'Major' },
  critical: { bg: 'bg-red-200', text: 'text-red-800', label: 'Critical' },
};

function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
}

export default function ModuleReviewDialog({
  open, moduleKey, moduleName, submission, findings, assignment,
  onApprove, onReject, onClose,
}) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [acting, setActing] = useState(false);

  const [isDirty, setIsDirty] = useState(false);
  const isLoadedRef = useRef(false);

  useEffect(() => {
    if (open) { isLoadedRef.current = false; setIsDirty(false); }
    else { isLoadedRef.current = false; }
  }, [open]);

  useEffect(() => {
    if (!open || !isLoadedRef.current) return;
    setIsDirty(true);
  }, [reviewNotes, pendingAction]);

  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onClose());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    base44.entities.InspectionQuestion.filter({ is_active: true }, 'sort_order')
      .then(qs => setQuestions(stableSortQuestions(qs)))
      .catch(() => setQuestions([]))
      .finally(() => { setLoading(false); Promise.resolve().then(() => { isLoadedRef.current = true; }); });
  }, [open]);

  useEffect(() => {
    if (!open) {
      setReviewNotes('');
      setPendingAction(null);
    }
  }, [open]);

  if (!open) return null;

  const answers = safeJsonParse(submission?.answers, {});
  const questionMap = new Map(questions.map(q => [q.id, q]));

  const moduleFindings = (findings || []).filter(f =>
    f.interior_exterior === moduleKey ||
    (moduleKey === 'interior' && f.interior_exterior === 'both') ||
    (moduleKey === 'exterior' && f.interior_exterior === 'both')
  );
  const deficiencies = moduleFindings.filter(f => f.is_deficiency !== false);
  const photos = submission?.photos || [];

  const answerEntries = Object.entries(answers).filter(([key]) => {
    if (key.endsWith('_photos')) return false;
    return questionMap.has(key);
  });

  const handleConfirm = async () => {
    if (!pendingAction) return;
    setActing(true);
    try {
      if (pendingAction === 'approve') {
        await onApprove(moduleKey, reviewNotes);
      } else {
        await onReject(moduleKey, reviewNotes);
      }
      onClose();
    } catch (e) {
      console.error('Review action failed:', e);
    }
    setActing(false);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCloseAttempt(); }}>
...
    </Dialog>
    <DirtyCloseWarning
      open={showWarning}
      onContinueEditing={cancelDiscard}
      onDiscardChanges={confirmDiscard}
    />
    </>
  );
}