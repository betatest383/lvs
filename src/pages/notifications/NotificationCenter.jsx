import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search, Send, Archive, Ban, CheckSquare } from 'lucide-react';
import { toast } from 'sonner';
import NotificationCard from '@/components/notifications/NotificationCard';
import NotificationFormDialog from '@/components/notifications/NotificationFormDialog';
import {
  NOTIFICATION_TYPES, NOTIFICATION_STATUSES, NOTIFICATION_PRIORITIES, SOURCE_MODULES,
} from '@/lib/notificationConstants';

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [selected, setSelected] = useState(new Set());
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('manageNotification', {
        action: 'list',
        listScope: 'all',
        filters: {},
      });
      if (response.data?.success) {
        setNotifications(response.data.notifications || []);
      } else {
        setNotifications([]);
      }
    } catch (err) {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    try {
      if (editing) {
        const response = await base44.functions.invoke('manageNotification', {
          action: 'edit',
          notificationId: editing.id,
          notificationData: data,
        });
        if (response.data?.success) {
          toast.success('Notification updated');
        } else {
          toast.error(response.data?.error || 'Failed to update notification');
          return;
        }
      } else {
        const response = await base44.functions.invoke('manageNotification', {
          action: 'create',
          notificationData: data,
        });
        if (response.data?.success) {
          toast.success('Notification sent');
        } else {
          toast.error(response.data?.error || 'Failed to create notification');
          return;
        }
      }
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Operation failed');
    }
  };

  const handleResend = async (n) => {
    try {
      const response = await base44.functions.invoke('manageNotification', {
        action: 'resend',
        notificationId: n.id,
      });
      if (response.data?.success) {
        toast.success('Notification resent');
        load();
      } else {
        toast.error(response.data?.error || 'Failed to resend');
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to resend');
    }
  };

  const handleArchive = async (n) => {
    try {
      const response = await base44.functions.invoke('manageNotification', {
        action: 'archive',
        notificationId: n.id,
      });
      if (response.data?.success) {
        toast.success('Notification archived');
        load();
      }
    } catch (err) {
      toast.error('Failed to archive');
    }
  };

  const handleCancel = async (n) => {
    try {
      const response = await base44.functions.invoke('manageNotification', {
        action: 'cancel',
        notificationId: n.id,
        resolutionReason: 'Cancelled by admin',
      });
      if (response.data?.success) {
        toast.success('Notification cancelled');
        load();
      }
    } catch (err) {
      toast.error('Failed to cancel');
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkArchive = async () => {
    for (const id of selected) {
      await base44.functions.invoke('manageNotification', { action: 'archive', notificationId: id });
    }
    toast.success(`${selected.size} notifications archived`);
    setSelected(new Set());
    load();
  };

  const bulkCancel = async () => {
    for (const id of selected) {
      await base44.functions.invoke('manageNotification', { action: 'cancel', notificationId: id, resolutionReason: 'Bulk cancelled' });
    }
    toast.success(`${selected.size} notifications cancelled`);
    setSelected(new Set());
    load();
  };

  const handleAcknowledge = async (n) => {
    try {
      const response = await base44.functions.invoke('manageNotification', {
        action: 'acknowledge',
        notificationId: n.id,
        response: 'acknowledged',
      });
      if (response.data?.success) {
        toast.success('Acknowledged');
        load();
      } else {
        toast.error(response.data?.error || 'Failed to acknowledge');
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to acknowledge');
    }
  };

  const filtered = notifications.filter((n) => {
    if (search) {
      const q = search.toLowerCase();
      if (!n.title?.toLowerCase().includes(q) && !n.message?.toLowerCase().includes(q) && !n.notification_id?.toLowerCase().includes(q) && !n.recipient_name?.toLowerCase().includes(q)) return false;
    }
    if (typeFilter && n.notification_type !== typeFilter) return false;
    if (statusFilter && n.status !== statusFilter) return false;
    if (priorityFilter && n.priority !== priorityFilter) return false;
    if (sourceFilter && n.source_module !== sourceFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notification Center</h1>
          <p className="text-muted-foreground text-sm">Manage all enterprise notifications.</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="w-4 h-4 mr-2" /> Create Notification
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notifications..." className="pl-9" />
        </div>
        <Select value={typeFilter || '__all'} onValueChange={(v) => setTypeFilter(v === '__all' ? '' : v)}>
          <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent><SelectItem value="__all">All Types</SelectItem>{NOTIFICATION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={statusFilter || '__all'} onValueChange={(v) => setStatusFilter(v === '__all' ? '' : v)}>
          <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="__all">All Statuses</SelectItem>{NOTIFICATION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={priorityFilter || '__all'} onValueChange={(v) => setPriorityFilter(v === '__all' ? '' : v)}>
          <SelectTrigger className="w-32 h-9 text-sm"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent><SelectItem value="__all">All Priorities</SelectItem>{NOTIFICATION_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={sourceFilter || '__all'} onValueChange={(v) => setSourceFilter(v === '__all' ? '' : v)}>
          <SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent><SelectItem value="__all">All Sources</SelectItem>{SOURCE_MODULES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={bulkArchive}><Archive className="w-3.5 h-3.5 mr-1" /> Archive</Button>
          <Button size="sm" variant="outline" onClick={bulkCancel}><Ban className="w-3.5 h-3.5 mr-1" /> Cancel</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No notifications found.</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((n) => (
            <div key={n.id} className="relative">
              <div className="absolute top-2 left-2 z-10">
                <Checkbox checked={selected.has(n.id)} onCheckedChange={() => toggleSelect(n.id)} />
              </div>
              <NotificationCard
                notification={n}
                onClick={(n) => navigate(`/notifications/detail/${n.id}`)}
                onAcknowledge={handleAcknowledge}
                onArchive={handleArchive}
              />
              <div className="flex gap-1 mt-1">
                <Button size="sm" variant="ghost" onClick={() => handleResend(n)} className="text-xs h-7"><Send className="w-3 h-3 mr-1" /> Resend</Button>
                <Button size="sm" variant="ghost" onClick={() => handleCancel(n)} className="text-xs h-7 text-red-600"><Ban className="w-3 h-3 mr-1" /> Cancel</Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(n); setDialogOpen(true); }} className="text-xs h-7 ml-auto">Edit</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <NotificationFormDialog open={dialogOpen} onOpenChange={setDialogOpen} initialData={editing} onSave={handleSave} />
    </div>
  );
}