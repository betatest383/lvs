import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  ArrowLeft, Download, File, Loader2, Link2, Clock, User, Tag,
  FileText, Image as ImageIcon, Video, ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import ResourceActionsMenu from '@/components/resources/ResourceActionsMenu';
import ResourceFormDialog from '@/components/resources/ResourceFormDialog';
import AIAssistPanel from '@/components/resources/AIAssistPanel';
import RelatedRecordsPanel from '@/components/resources/RelatedRecordsPanel';
import {
  getStatusBadgeClass, getStatusLabel, getSourceProviderLabel, formatFileSize,
  parseAuditHistory, parseClassificationData, canManageResource
} from '@/lib/productResourceConstants';

export default function ResourceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [resource, setResource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await base44.functions.invoke('manageProductResource', {
          action: 'get', resource_id: id,
        });
        if (res.data?.success && res.data.resource) {
          setResource(res.data.resource);
        } else {
          setNotFound(true);
        }
      } catch (e) {
        setNotFound(true);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const refreshResource = async () => {
    const res = await base44.functions.invoke('manageProductResource', {
      action: 'get', resource_id: id,
    });
    if (res.data?.success) setResource(res.data.resource);
  };

  const handleAction = async (actionKey) => {
    if (actionKey === 'edit') {
      setEditOpen(true);
      return;
    }
    if (actionKey === 'approve' || actionKey === 'reject' || actionKey === 'archive') {
      const titles = {
        approve: 'Approve Resource',
        reject: 'Reject Resource',
        archive: 'Archive Resource',
      };
      const labels = {
        approve: 'Approval notes (optional)',
        reject: 'Rejection reason (required)',
        archive: 'Archive reason (optional)',
      };
      setPendingAction({ action: actionKey, title: titles[actionKey], label: labels[actionKey] });
      setReason('');
      return;
    }
    // Direct actions: classify, submit_for_review, publish
    setActionLoading(true);
    try {
      const res = await base44.functions.invoke('manageProductResource', {
        action: actionKey, resource_id: id,
      });
      if (res.data?.success) {
        setResource(res.data.resource);
        toast.success('Action completed');
      } else {
        toast.error(res.data?.error || 'Action failed');
      }
    } catch (e) {
      toast.error(e.message);
    }
    setActionLoading(false);
  };

  const confirmAction = async () => {
    if (pendingAction.action === 'reject' && !reason.trim()) {
      toast.error('Rejection reason is required');
      return;
    }
    setActionLoading(true);
    try {
      const params = { action: pendingAction.action, resource_id: id };
      if (pendingAction.action === 'approve') params.review_notes = reason;
      if (pendingAction.action === 'reject') params.rejection_reason = reason;
      if (pendingAction.action === 'archive') params.archived_reason = reason;
      const res = await base44.functions.invoke('manageProductResource', params);
      if (res.data?.success) {
        setResource(res.data.resource);
        toast.success('Action completed');
        setPendingAction(null);
      } else {
        toast.error(res.data?.error || 'Action failed');
      }
    } catch (e) {
      toast.error(e.message);
    }
    setActionLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !resource) {
    return (
      <div className="text-center py-12">
        <File className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <h3 className="text-lg font-semibold">Resource not found</h3>
        <p className="text-sm text-muted-foreground mb-4">This resource may have been deleted or the ID is invalid.</p>
        <Link to="/resources/library"><Button variant="outline">Back to Library</Button></Link>
      </div>
    );
  }

  const audit = parseAuditHistory(resource.audit_history);
  const classification = parseClassificationData(resource.classification_data);
  const canManage = canManageResource(user, resource);
  const isImage = resource.file_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(resource.file_name || '');
  const isVideo = resource.file_type?.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(resource.file_name || '');
  const isPdf = resource.file_type === 'application/pdf' || /\.pdf$/i.test(resource.file_name || '');

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link to="/resources/library">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{resource.title}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${getStatusBadgeClass(resource.status)}`}>
              {getStatusLabel(resource.status)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {resource.resource_number} · {getSourceProviderLabel(resource.source_provider)}
          </p>
        </div>
        {!actionLoading && (
          <ResourceActionsMenu resource={resource} user={user} onAction={handleAction} />
        )}
        {actionLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* File preview */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">File</CardTitle>
              {resource.file_url && (
                <a href={resource.file_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm">
                    <Download className="h-3 w-3 mr-1" /> Download
                  </Button>
                </a>
              )}
            </CardHeader>
            <CardContent>
              {resource.file_url ? (
                <div className="space-y-3">
                  {isImage && (
                    <img src={resource.file_url} alt={resource.title} className="rounded-lg max-h-96 mx-auto" />
                  )}
                  {isVideo && (
                    <video src={resource.file_url} controls className="rounded-lg w-full max-h-96" />
                  )}
                  {isPdf && (
                    <iframe src={resource.file_url} className="w-full h-96 rounded-lg border" title={resource.title} />
                  )}
                  {!isImage && !isVideo && !isPdf && (
                    <a href={resource.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <ExternalLink className="h-4 w-4" /> {resource.file_name || 'Open file'}
                    </a>
                  )}
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span>{resource.file_name}</span>
                    <span>{formatFileSize(resource.file_size)}</span>
                    <span>{resource.file_type}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No file attached</p>
              )}
            </CardContent>
          </Card>

          {/* Description */}
          {resource.description && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Description</CardTitle></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap">{resource.description}</p></CardContent>
            </Card>
          )}

          {/* Classification */}
          {classification && (
            <Card>
              <CardHeader><CardTitle className="text-sm">AI Classification</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Confidence:</span>
                  <span className={`text-xs font-medium ${classification.confidence >= 70 ? 'text-green-600' : classification.confidence >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                    {classification.confidence}%
                  </span>
                </div>
                {classification.notes && <p className="text-xs text-muted-foreground">{classification.notes}</p>}
                {resource.classified_by && (
                  <p className="text-xs text-muted-foreground">Classified by: {resource.classified_by}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Metadata */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Metadata</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-xs text-muted-foreground">Resource Type</span><p>{resource.resource_type}</p></div>
                <div><span className="text-xs text-muted-foreground">Manufacturer</span><p>{resource.manufacturer || '—'}</p></div>
                <div><span className="text-xs text-muted-foreground">Product Line</span><p>{resource.product_line || '—'}</p></div>
                <div><span className="text-xs text-muted-foreground">Product Model</span><p>{resource.product_model || '—'}</p></div>
                <div><span className="text-xs text-muted-foreground">Appliance Type</span><p>{resource.appliance_type || '—'}</p></div>
                <div><span className="text-xs text-muted-foreground">Fuel Type</span><p>{resource.fuel_type || '—'}</p></div>
              </div>
              {resource.tags && resource.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-4">
                  {resource.tags.map((tag) => (
                    <span key={tag} className="text-xs bg-muted px-2 py-0.5 rounded flex items-center gap-1">
                      <Tag className="h-3 w-3" />{tag}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Related Records */}
          <RelatedRecordsPanel resource={resource} canManage={canManage} onLinkChange={setResource} />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <AIAssistPanel resourceId={id} />

          {/* Audit Trail */}
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Audit Trail</CardTitle></CardHeader>
            <CardContent>
              {audit.length === 0 ? (
                <p className="text-xs text-muted-foreground">No audit history</p>
              ) : (
                <div className="space-y-3">
                  {audit.slice().reverse().map((entry, idx) => (
                    <div key={idx} className="flex gap-2 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                      <div>
                        <p className="font-medium">{entry.action}</p>
                        {entry.details && <p className="text-muted-foreground">{entry.details}</p>}
                        <p className="text-muted-foreground flex items-center gap-1 mt-0.5">
                          <User className="h-3 w-3" />{entry.user}
                        </p>
                        <p className="text-muted-foreground">
                          {new Date(entry.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Dialog */}
      <ResourceFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        resource={resource}
        onSuccess={(updated) => { setResource(updated); }}
      />

      {/* Action Confirmation Dialog */}
      <Dialog open={!!pendingAction} onOpenChange={(open) => { if (!open) setPendingAction(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingAction?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>{pendingAction?.label}</Label>
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