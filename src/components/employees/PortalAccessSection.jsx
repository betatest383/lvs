import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Mail, MailCheck, RotateCcw, Eye, Ban, CheckCircle2, Clock, Send, UserCheck, AlertTriangle } from 'lucide-react';
import { notify } from '@/lib/notify';

const statusConfig = {
  'Pending': { icon: Clock, class: 'bg-slate-100 text-slate-600', label: 'Pending' },
  'Sent': { icon: Send, class: 'bg-blue-100 text-blue-700', label: 'Sent' },
  'Accepted': { icon: UserCheck, class: 'bg-purple-100 text-purple-700', label: 'Accepted' },
  'Expired': { icon: AlertTriangle, class: 'bg-amber-100 text-amber-700', label: 'Expired' },
  'Linked': { icon: CheckCircle2, class: 'bg-green-100 text-green-700', label: 'Linked' },
};

export default function PortalAccessSection({ employee, onEmployeeUpdated }) {
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [invitationStatus, setInvitationStatus] = useState(employee.invitation_status || 'Pending');
  const [linkedUser, setLinkedUser] = useState(null);
  const [showUserDetails, setShowUserDetails] = useState(false);

  const isAdmin = true; // Employee Detail already gates admin actions
  const isActive = employee.employment_status === 'Active';
  const isLinked = employee.user_linked === true;
  const canInvite = isAdmin && isActive && !isLinked;

  const resolveStatus = async () => {
    try {
      const res = await base44.functions.invoke('inviteEmployee', {
        action: 'status',
        employee_id: employee.employee_id,
      });
      const data = res.data;
      if (data.success) {
        setInvitationStatus(data.invitation_status);
        setLinkedUser(data.linked_user);
      }
    } catch (e) {
      // Fall back to stored value
      setInvitationStatus(employee.invitation_status || 'Pending');
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    resolveStatus();
  }, [employee.id, employee.user_linked, employee.last_invitation_sent]);

  const handleInvite = async () => {
    setLoading(true);
    try {
      // 1. Send platform invitation email (creates auth account)
      await base44.users.inviteUser(employee.email, employee.base44_user_role || 'user');
      // 2. Record invitation in EmployeeRegistry
      const res = await base44.functions.invoke('inviteEmployee', {
        action: 'track_invite',
        employee_id: employee.employee_id,
      });
      if (res.data?.success) {
        notify.success(`Invitation sent to ${employee.email}`, {
          sourceModule: 'Employee Registry',
          details: { email: employee.email, status: res.data.invitation_status },
        });
        setInvitationStatus(res.data.invitation_status);
        onEmployeeUpdated?.({
          ...employee,
          invitation_status: res.data.invitation_status,
          last_invitation_sent: res.data.last_invitation_sent,
          account_status: 'Active',
          login_email: employee.email,
        });
      }
    } catch (e) {
      notify.error('Failed to send invitation', {
        details: e.message,
        sourceModule: 'Employee Registry',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    try {
      await base44.users.inviteUser(employee.email, employee.base44_user_role || 'user');
      const res = await base44.functions.invoke('inviteEmployee', {
        action: 'track_invite',
        employee_id: employee.employee_id,
      });
      if (res.data?.success) {
        notify.success(`Invitation re-sent to ${employee.email}`, {
          sourceModule: 'Employee Registry',
        });
        setInvitationStatus(res.data.invitation_status);
        onEmployeeUpdated?.({
          ...employee,
          invitation_status: res.data.invitation_status,
          last_invitation_sent: res.data.last_invitation_sent,
        });
      }
    } catch (e) {
      notify.error('Failed to re-send invitation', { details: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset portal access? This will unlink the current user and send a fresh invitation.')) return;
    setLoading(true);
    try {
      // 1. Unlink user in backend
      const res = await base44.functions.invoke('inviteEmployee', {
        action: 'reset',
        employee_id: employee.employee_id,
      });
      if (res.data?.success) {
        // 2. Re-send invitation
        await base44.users.inviteUser(employee.email, employee.base44_user_role || 'user');
        notify.success('Portal access reset. New invitation sent.', {
          sourceModule: 'Employee Registry',
        });
        setInvitationStatus(res.data.invitation_status);
        setLinkedUser(null);
        onEmployeeUpdated?.({
          ...employee,
          linked_user_id: '',
          login_email: employee.email,
          user_linked: false,
          link_date: '',
          invitation_status: res.data.invitation_status,
          last_invitation_sent: res.data.last_invitation_sent,
          account_status: 'Active',
        });
      }
    } catch (e) {
      notify.error('Failed to reset portal access', { details: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    if (!confirm('Disable login for this employee? They will not be able to access the portal.')) return;
    setLoading(true);
    try {
      await base44.functions.invoke('linkUserToEmployee', {
        action: 'disable',
        employee_id: employee.employee_id,
      });
      notify.success('Login disabled', { sourceModule: 'Employee Registry' });
      onEmployeeUpdated?.({ ...employee, account_status: 'Disabled' });
    } catch (e) {
      notify.error('Failed to disable login', { details: e.message });
    } finally {
      setLoading(false);
    }
  };

  const config = statusConfig[invitationStatus] || statusConfig['Pending'];
  const StatusIcon = config.icon;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-base">Portal Access</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage employee authentication and portal access
            </p>
          </div>
          {statusLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${config.class}`}>
              <StatusIcon className="h-3.5 w-3.5" />
              {config.label}
            </div>
          )}
        </div>

        {/* Invitation status detail row */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Login Email</div>
            <div className="font-medium">{employee.login_email || employee.email || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Account Status</div>
            <div className="font-medium">{employee.account_status || 'Pending'}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Last Invitation Sent</div>
            <div className="font-medium">
              {employee.last_invitation_sent
                ? new Date(employee.last_invitation_sent).toLocaleString()
                : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Linked Since</div>
            <div className="font-medium">
              {employee.link_date
                ? new Date(employee.link_date).toLocaleString()
                : '—'}
            </div>
          </div>
        </div>

        {/* Linked user details (expandable) */}
        {isLinked && linkedUser && showUserDetails && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">User ID:</span>
              <span className="font-mono text-xs">{linkedUser.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name:</span>
              <span>{linkedUser.full_name || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email:</span>
              <span>{linkedUser.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Role:</span>
              <span>{linkedUser.role}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created:</span>
              <span>{linkedUser.created_date ? new Date(linkedUser.created_date).toLocaleString() : '—'}</span>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!isLinked && canInvite ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleInvite} disabled={loading} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Mail className="h-4 w-4 mr-1.5" />}
              Invite Employee
            </Button>
          </div>
        ) : isLinked ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowUserDetails(!showUserDetails)}>
              <Eye className="h-3.5 w-3.5 mr-1.5" />
              {showUserDetails ? 'Hide' : 'View'} Linked User
            </Button>
            <Button variant="outline" size="sm" onClick={handleResend} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <MailCheck className="h-3.5 w-3.5 mr-1.5" />}
              Resend Invitation
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset} disabled={loading}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Reset Portal Access
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDisable} disabled={loading}>
              <Ban className="h-3.5 w-3.5 mr-1.5" />
              Disable Login
            </Button>
          </div>
        ) : !isActive ? (
          <p className="text-xs text-muted-foreground">
            Portal access can only be managed for active employees.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}