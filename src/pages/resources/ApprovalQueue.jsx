import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Check, X, Clock, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { canReviewResource, formatFileSize } from '@/lib/productResourceConstants';

export default function ApprovalQueue() {
  const { user } = useAuth();
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('manageProductResource', {
        action: 'list', status: 'Pending Review', limit: 100,
      });
      if (res.data?.success) setResources(res.data.resources || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const canReview = canReviewResource(user);

  const startAction = (resource, action) => {
    setPendingAction({ resource, action });
    setReason('');
  };

  const confirmAction = async () => {
    if (pendingAction.action === 'reject' && !reason.trim()) {
      toast.error('Rejection reason is required');
      return;
    }
    setActionLoading(true);
    try {
      const params = { action: pendingAction.action, resource_id: pendingAction.resource.id };
      if (pendingAction.action === 'approve') params.review_notes = reason;
      if (pendingAction.action === 'reject') params.rejection_reason = reason;
      const res = await base44.functions.invoke('manageProductResource', params);
      if (res.data?.success) {
        toast.success(pendingAction.action === 'approve' ? 'Resource approved' : 'Resource rejected');
        setPendingAction(null);
        load();
      } else {
        toast.error(res.data?.error || 'Action failed');
      }
    } catch (e) {
      toast.error(e.message);
    }
    setActionLoading(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Approval Queue</h2>
        <p className="text-sm text-muted-foreground">Resources pending review and approval</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : resources.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No resources pending review</p>
        </div>
      ) : (
        <div className="space-y-3">
          {resources.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex-1 min-w-0">
                  <Link to={`/resources/detail/${r.id}`} className="hover:underline">
                    <h3 className="text-sm font-medium truncate">{r.title}</h3>
                  </Link>
                  <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{r.resource_number}</span>
                    <span>{r.manufacturer || '—'}</span>
                    <span>{r.resource_type}</span>
                    <span>{formatFileSize(r.file_size)}</span>
                    {r.classification_confidence != null && (
                      <span>AI confidence: {r.classification_confidence}%</span>
                    )}
                  </div>
                  {r.submitted_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Submitted {new Date(r.submitted_at).toLocaleString()} by {r.submitted_by || '—'}
                    </p>
                  )}
                </div>
                {canReview && (
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="default" onClick={() => startAction(r, 'approve')}>
                      <Check className="h-3 w-3 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => startAction(r, 'reject')}>
                      <X className="h-3 w-3 mr-1" /> Reject
                    </Button>
                  </div>
                )}
                <Link to={`/resources/detail/${r.id}`}>
                  <Button size="sm" variant="ghost"><ArrowRight className="h-4 w-4" /></Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Action Dialog */}
      <Dialog open={!!pendingAction} onOpenChange={(open) => { if (!open) setPendingAction(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingAction?.action === 'approve' ? 'Approve Resource' : 'Reject Resource'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">{pendingAction?.resource?.title}</p>
            <Label>
              {pendingAction?.action === 'approve' ? 'Approval notes (optional)' : 'Rejection reason (required)'}
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Enter reason..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingAction(null)}>Cancel</Button>
            <Button
              variant={pendingAction?.action === 'reject' ? 'destructive' : 'default'}
              onClick={confirmAction}
              disabled={actionLoading}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}