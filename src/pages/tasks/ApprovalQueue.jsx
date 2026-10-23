import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, XCircle, RefreshCw, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { APPROVAL_STATUS_COLORS, parseJSON } from '@/lib/enterpriseTaskConstants';
import { approveWarehouseOpeningBalance } from '@/lib/warehouseSetupSession';

export default function ApprovalQueue() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionTask, setActionTask] = useState(null);
  const [actionType, setActionType] = useState('');
  const [actionNotes, setActionNotes] = useState('');
  const [canonicalProcessing, setCanonicalProcessing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const all = await base44.entities.EnterpriseTask.list('-created_date', 500);
      setTasks(all.filter(t => t.requires_approval && (t.approval_status === 'Pending' || !t.approval_status)));
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleAction = async () => {
    if (!actionTask || !actionType) return;

    // ─── Warehouse opening-balance approval: call canonical action ───
    const isWarehouseApproval = actionTask.related_module === 'inventory_count_session' && actionTask.task_type === 'Approval';
    if (isWarehouseApproval) {
      setCanonicalProcessing(true);
      try {
        if (actionType === 'Approve') {
          const result = await approveWarehouseOpeningBalance(actionTask.related_record_id, 'approve');
          if (result.success) {
            toast.success(result.already_approved ? 'Already approved — reconciled' : 'Opening balance approved');
          } else {
            toast.error(result.error || 'Approval failed');
          }
        } else if (actionType === 'Reject' || actionType === 'Request Changes') {
          if (!actionNotes.trim()) { toast.error('Reason required'); return; }
          const result = await approveWarehouseOpeningBalance(actionTask.related_record_id, 'return_for_correction', actionNotes);
          if (result.success) {
            toast.success('Returned for correction');
          } else {
            toast.error(result.error || 'Return failed');
          }
        }
      } catch (err) {
        toast.error(err.response?.data?.error || err.message || 'Action failed');
      } finally {
        setCanonicalProcessing(false);
        setActionTask(null);
        setActionType('');
        setActionNotes('');
        load();
      }
      return;
    }

    // ─── Standard task approval (non-warehouse) ───
    const action = actionType === 'Approve' ? 'Approved' : actionType === 'Reject' ? 'Rejected' : 'Changes Requested';
    const newApprovalStatus = actionType === 'Approve' ? 'Approved' : actionType === 'Reject' ? 'Rejected' : 'Changes Requested';
    const newTaskStatus = actionType === 'Approve' ? 'In Progress' : actionType === 'Reject' ? 'Cancelled' : 'Waiting';

    const approvalHistory = parseJSON(actionTask.approval_history, []);
    approvalHistory.push({ action, approver: 'You', notes: actionNotes, timestamp: new Date().toISOString() });

    const updates = {
      approval_status: newApprovalStatus,
      approved_by: 'You',
      approved_date: new Date().toISOString().split('T')[0],
      approval_notes: actionNotes,
      status: newTaskStatus,
      approval_history: JSON.stringify(approvalHistory),
    };

    await base44.entities.EnterpriseTask.update(actionTask.id, updates);
    toast.success(`Task ${action.toLowerCase()}`);
    setActionTask(null);
    setActionType('');
    setActionNotes('');
    load();
  };

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Approval Queue</h1>
        <p className="text-muted-foreground text-sm">Tasks requiring approval before proceeding.</p>
      </div>

      {tasks.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground"><CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-600" />No tasks pending approval.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {tasks.map(t => (
            <Card key={t.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <Link to={`/tasks/detail/${t.id}`} className="font-medium text-sm hover:text-accent">{t.title}</Link>
                    <p className="text-xs text-muted-foreground mt-0.5">{t.task_number || t.task_id} • {t.task_type} • {t.department}</p>
                    {t.description && <p className="text-sm text-muted-foreground mt-1">{t.description}</p>}
                    {t.assigned_to && <p className="text-xs text-muted-foreground mt-1">👤 {t.assigned_to}</p>}
                    {t.approval_role && <p className="text-xs text-muted-foreground">Approval: {t.approval_role}</p>}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button size="sm" onClick={() => { setActionTask(t); setActionType('Approve'); setActionNotes(''); }} className="bg-green-600 hover:bg-green-700 text-white">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setActionTask(t); setActionType('Reject'); setActionNotes(''); }} className="border-red-300 text-red-600 hover:bg-red-50">
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setActionTask(t); setActionType('Request Changes'); setActionNotes(''); }}>
                      <RefreshCw className="w-3.5 h-3.5 mr-1" /> Changes
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {actionTask && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => setActionTask(null)}>
          <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
            <CardContent className="p-4 space-y-3">
              <h3 className="font-bold flex items-center gap-2">
                {actionType === 'Approve' && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                {actionType === 'Reject' && <XCircle className="w-5 h-5 text-red-600" />}
                {actionType === 'Request Changes' && <RefreshCw className="w-5 h-5 text-amber-600" />}
                {actionType} Task
              </h3>
              <p className="text-sm text-muted-foreground">{actionTask.title}</p>
              <Textarea value={actionNotes} onChange={e => setActionNotes(e.target.value)} placeholder="Approval notes (required)..." rows={3} />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setActionTask(null)}>Cancel</Button>
                <Button size="sm" onClick={handleAction} disabled={!actionNotes.trim() || canonicalProcessing} className="bg-accent text-accent-foreground hover:bg-accent/90">
                  {canonicalProcessing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                  Confirm {actionType}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}