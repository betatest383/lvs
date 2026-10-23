import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ChevronLeft, CheckCircle2, Eye, Send, Ban, Archive, Pencil, Link2,
  User, Clock, AlertTriangle, Shield, Route, ExternalLink, CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import NotificationFormDialog from '@/components/notifications/NotificationFormDialog';
import ManagerFollowupActions from '@/components/notifications/ManagerFollowupActions';
import {
  NOTIFICATION_TYPE_COLORS, NOTIFICATION_STATUS_COLORS, PRIORITY_COLORS,
  RELATED_FIELDS, requiresAction, isResolved,
  RESOLUTION_TYPE_LABELS, RESOLUTION_TYPE_COLORS,
} from '@/lib/notificationConstants';

export default function NotificationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        // Fetch notification via manageNotification (server-side visibility check)
        const response = await base44.functions.invoke('manageNotification', {
          action: 'get',
          notificationId: id,
        });
        if (!mounted) return;
        if (response.data?.success) {
          const n = response.data.notification;
          setNotification(n);
          // Auto-mark Read (but NOT Acknowledged) if currently Sent/Delivered/Pending
          if (n && ['Sent', 'Delivered', 'Pending'].includes(n.status)) {
            const readResponse = await base44.functions.invoke('manageNotification', {
              action: 'mark_read',
              notificationId: n.id,
            });
            if (readResponse.data?.success && mounted) {
              setNotification(readResponse.data.notification);
            }
          }
        } else {
          setNotification(null);
        }
      } catch (err) {
        if (mounted) setNotification(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [id]);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;
  if (!notification) return <div className="text-center py-12 text-muted-foreground">Notification not found or you are not authorized to view it.</div>;

  const n = notification;
  const relatedLinks = RELATED_FIELDS.filter((f) => n[f.key]);

  const handleAcknowledge = async () => {
    try {
      const response = await base44.functions.invoke('manageNotification', {
        action: 'acknowledge',
        notificationId: n.id,
        response: 'acknowledged',
      });
      if (response.data?.success) {
        setNotification(response.data.notification || { ...n, status: 'Acknowledged', acknowledged_date: new Date().toISOString() });
        toast.success('Notification acknowledged');
      } else {
        toast.error(response.data?.error || 'Failed to acknowledge');
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to acknowledge');
    }
  };

  const handleResend = async () => {
    try {
      const response = await base44.functions.invoke('manageNotification', {
        action: 'resend',
        notificationId: n.id,
      });
      if (response.data?.success) {
        setNotification(response.data.notification);
        toast.success('Notification resent');
      }
    } catch (err) {
      toast.error('Failed to resend');
    }
  };

  const handleCancel = async () => {
    try {
      const response = await base44.functions.invoke('manageNotification', {
        action: 'cancel',
        notificationId: n.id,
        resolutionReason: 'Cancelled by admin',
      });
      if (response.data?.success) {
        setNotification(response.data.notification);
        toast.success('Notification cancelled');
      }
    } catch (err) {
      toast.error('Failed to cancel');
    }
  };

  const handleArchive = async () => {
    try {
      const response = await base44.functions.invoke('manageNotification', {
        action: 'archive',
        notificationId: n.id,
      });
      if (response.data?.success) {
        setNotification(response.data.notification);
        toast.success('Notification archived');
      }
    } catch (err) {
      toast.error('Failed to archive');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/notifications/center')}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
        <div className="flex gap-1">
          {isResolved(n) ? (
            n.source_module === 'task_registry' && n.related_task && (
              <Button size="sm" onClick={() => navigate(`/tasks/detail/${n.related_task}`)} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                <Eye className="w-3.5 h-3.5 mr-1" /> View Task
              </Button>
            )
          ) : (
            <>
              {n.source_module === 'task_registry' && n.related_task && (
                <Button size="sm" onClick={() => navigate(`/tasks/detail/${n.related_task}`)} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                  <ExternalLink className="w-3.5 h-3.5 mr-1" /> View Task
                </Button>
              )}
              {requiresAction(n) && (
                <Button size="sm" onClick={handleAcknowledge} className="bg-green-600 hover:bg-green-700 text-white">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Acknowledge
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={handleResend}><Send className="w-3.5 h-3.5 mr-1" /> Resend</Button>
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}><Pencil className="w-3.5 h-3.5 mr-1" /> Edit</Button>
              <Button size="sm" variant="outline" onClick={handleArchive}><Archive className="w-3.5 h-3.5 mr-1" /> Archive</Button>
              <Button size="sm" variant="outline" onClick={handleCancel} className="text-red-600"><Ban className="w-3.5 h-3.5 mr-1" /> Cancel</Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="font-mono text-xs text-muted-foreground">{n.notification_id}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${NOTIFICATION_TYPE_COLORS[n.notification_type] || ''}`}>{n.notification_type}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${PRIORITY_COLORS[n.priority] || ''}`}>{n.priority}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${NOTIFICATION_STATUS_COLORS[n.status] || ''}`}>{n.status}</span>
            {isResolved(n) && n.resolution_type && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${RESOLUTION_TYPE_COLORS[n.resolution_type] || ''}`}>
                {RESOLUTION_TYPE_LABELS[n.resolution_type] || n.resolution_type}
              </span>
            )}
            {n.requires_acknowledgment && !isResolved(n) && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${requiresAction(n) ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                {requiresAction(n) ? '⚠ Acknowledgment Required' : '✓ Acknowledged'}
              </span>
            )}
            {n.is_archived && <span className="px-2 py-0.5 rounded-full text-xs bg-gray-200 text-gray-600">Archived</span>}
            {n.assignment_version > 0 && <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">Assignment v{n.assignment_version}</span>}
          </div>
          <h1 className="text-xl font-bold">{n.title}</h1>
          <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{n.message}</p>
        </CardContent>
      </Card>

      {/* Manager follow-up actions (only shown for manager follow-up notifications) */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-accent" /> Manager Actions
          </h3>
          <ManagerFollowupActions
            notification={n}
            onRefresh={async () => {
              // Reload the notification after a manager action
              try {
                const response = await base44.functions.invoke('manageNotification', {
                  action: 'get',
                  notificationId: n.id,
                });
                if (response.data?.success) {
                  setNotification(response.data.notification);
                }
              } catch { /* noop */ }
            }}
          />
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><User className="w-4 h-4 text-accent" /> Recipient</h3>
            {[
              { label: 'Registry ID', key: 'recipient_employee_registry_id' },
              { label: 'Name', key: 'recipient_name' },
              { label: 'Email', key: 'recipient_email' },
              { label: 'Role', key: 'recipient_role' },
              { label: 'Department', key: 'recipient_department' },
              { label: 'User ID', key: 'recipient_user_id' },
            ].map((f) => (
              <div key={f.key} className="flex justify-between text-sm py-1 border-b last:border-0">
                <span className="text-muted-foreground">{f.label}</span>
                <span className="font-medium text-right font-mono text-xs">{n[f.key] || '—'}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><Link2 className="w-4 h-4 text-accent" /> Related Records</h3>
            {relatedLinks.length === 0 ? <p className="text-sm text-muted-foreground">No related records.</p> : (
              <div className="space-y-1">
                {relatedLinks.map((f) => (
                  <div key={f.key} className="flex justify-between text-sm py-1 border-b last:border-0">
                    <span className="text-muted-foreground">{f.label}</span><span className="font-medium text-right">{n[f.key]}</span>
                  </div>
                ))}
              </div>
            )}
            {n.source_module && (
              <div className="flex justify-between text-sm py-1 border-t mt-1 pt-1">
                <span className="text-muted-foreground">Source Module</span><span className="font-medium text-right">{n.source_module}</span>
              </div>
            )}
            {n.notification_purpose && (
              <div className="flex justify-between text-sm py-1">
                <span className="text-muted-foreground">Purpose</span><span className="font-medium text-right text-xs">{n.notification_purpose}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-accent" /> Timeline</h3>
            <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Created</span><span className="font-medium text-right">{n.created_date ? new Date(n.created_date).toLocaleString() : '—'}</span></div>
            <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Sent</span><span className="font-medium text-right">{n.sent_date ? new Date(n.sent_date).toLocaleString() : '—'}</span></div>
            <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Read</span><span className="font-medium text-right">{n.read_date ? new Date(n.read_date).toLocaleString() : '—'}</span></div>
            <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Acknowledged</span><span className="font-medium text-right">{n.acknowledged_date ? new Date(n.acknowledged_date).toLocaleString() : '—'}</span></div>
            <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Resolved</span><span className="font-medium text-right">{n.resolved_at ? new Date(n.resolved_at).toLocaleString() : '—'}</span></div>
            <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Archived</span><span className="font-medium text-right">{n.archived_at ? new Date(n.archived_at).toLocaleString() : '—'}</span></div>
            <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Escalation Level</span><span className="font-medium text-right">{n.escalation_level || 0}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><Shield className="w-4 h-4 text-accent" /> Acknowledgment</h3>
            <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Required</span><span className="font-medium">{n.requires_acknowledgment ? 'Yes' : 'No'}</span></div>
            {n.requires_acknowledgment && (
              <>
                <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Acknowledged By</span><span className="font-medium">{n.acknowledged_by || '—'}</span></div>
                <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Acknowledged Date</span><span className="font-medium">{n.acknowledged_date ? new Date(n.acknowledged_date).toLocaleString() : '—'}</span></div>
              </>
            )}
            <div className="flex justify-between text-sm py-1"><span className="text-muted-foreground">Delivery Methods</span><span className="font-medium text-right">{(n.delivery_methods || []).join(', ') || 'In-App'}</span></div>
          </CardContent>
        </Card>
      </div>

      {isResolved(n) && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><CheckCircle className="w-4 h-4 text-emerald-600" /> Resolution</h3>
            <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Resolution Type</span><span className={`px-2 py-0.5 rounded text-xs font-medium border ${RESOLUTION_TYPE_COLORS[n.resolution_type] || ''}`}>{RESOLUTION_TYPE_LABELS[n.resolution_type] || n.resolution_type || '—'}</span></div>
            <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Decision</span><span className="font-medium text-right">{n.resolution_decision || '—'}</span></div>
            <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Resolved By</span><span className="font-medium text-right">{n.resolved_by_name || '—'}</span></div>
            <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Resolved At</span><span className="font-medium text-right">{n.resolved_at ? new Date(n.resolved_at).toLocaleString() : '—'}</span></div>
            {n.resolution_reason && <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Reason</span><span className="font-medium text-right text-xs">{n.resolution_reason}</span></div>}
            <div className="flex justify-between text-sm py-1"><span className="text-muted-foreground">Source</span><span className="font-medium text-right text-xs">{n.resolution_source_type || '—'}: {n.resolution_source_id || '—'}</span></div>
          </CardContent>
        </Card>
      )}

      <NotificationFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initialData={n}
        onSave={async (data) => {
          const response = await base44.functions.invoke('manageNotification', {
            action: 'edit',
            notificationId: n.id,
            notificationData: data,
          });
          if (response.data?.success) {
            setNotification(response.data.notification);
            toast.success('Notification updated');
          } else {
            toast.error(response.data?.error || 'Failed to update');
          }
        }}
      />
    </div>
  );
}