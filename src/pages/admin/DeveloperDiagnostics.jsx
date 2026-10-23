import React from 'react';
import { useSyncExternalStore } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useIdentityResolver } from '@/hooks/useIdentityResolver';
import { useMyTasks } from '@/hooks/useMyTasks';
import { useMyNotifications } from '@/hooks/useMyNotifications';
import { useDeveloperMode } from '@/hooks/useDeveloperMode';
import { subscribe, getSnapshot } from '@/lib/taskRealtimeStore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import {
  Bug, RefreshCw, Activity, Mail, CheckCircle2, XCircle, Clock,
  Database, AlertTriangle, ShieldCheck, Bell, CheckSquare,
} from 'lucide-react';

/**
 * DeveloperDiagnostics — dedicated in-page diagnostics for Owner/Admin.
 *
 * Replaces the floating GlobalDeveloperPanel and TaskRealtimeDebugPanel
 * that previously covered task controls on iPad/mobile. This page is
 * accessible only via /admin/developer-diagnostics and requires admin role.
 *
 * Error isolation: wrapped in ErrorBoundary so a diagnostics crash
 * never blanks the application.
 */
function DiagnosticsContent() {
  const { user: authUser, employee: linkedEmployee } = useAuth();
  const { resolutionChain } = useIdentityResolver();
  const { devModeEnabled, toggleDevMode, canAccessDevTools, isProduction } = useDeveloperMode();

  // Realtime store snapshot — re-renders when refreshEpoch changes
  useSyncExternalStore(subscribe, () => getSnapshot().refreshEpoch);
  const snap = getSnapshot();
  const d = snap.debug || {};

  const emp = linkedEmployee;
  const { taskCount, totalFetched: taskTotalFetched, refetch: refetchTasks } = useMyTasks(emp);
  const { notificationCount = 0, totalFetched: notifTotalFetched = 0, refetch: refetchNotifs } = useMyNotifications(emp);

  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    refetchTasks();
    refetchNotifs();
    setTimeout(() => setRefreshing(false), 600);
  };

  if (!canAccessDevTools) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <ShieldCheck className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">Developer diagnostics are available to Owner and Admin roles only.</p>
        </div>
      </div>
    );
  }

  const pollTime = d.lastPollTime ? new Date(d.lastPollTime).toLocaleTimeString('en-US', { hour12: false }) : '—';
  const hasPollError = !d.lastResponseOk && d.lastResponseOk !== null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bug className="w-6 h-6 text-amber-500" />
          <h1 className="text-2xl font-bold">Developer Diagnostics</h1>
          <Badge className={devModeEnabled ? 'bg-green-600 text-white' : 'bg-slate-500 text-white'}>
            {devModeEnabled ? 'Dev Mode ON' : 'Dev Mode OFF'}
          </Badge>
          <Badge variant="outline">{isProduction ? 'Production' : 'Dev / Preview'}</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Dev Mode Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bug className="w-4 h-4 text-amber-500" />
            Show Developer Diagnostics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Developer Mode</p>
              <p className="text-xs text-muted-foreground">
                Controls whether the floating developer panel appears on other pages (desktop only). Default: Off. Stored per user.
              </p>
            </div>
            <Switch checked={devModeEnabled} onCheckedChange={toggleDevMode} />
          </div>
        </CardContent>
      </Card>

      {/* Realtime Polling Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="w-4 h-4 text-accent" />
            Realtime Task Polling
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Row icon={<Clock className="h-3 w-3" />} label="Last Poll" value={pollTime} />
          <Row icon={<Mail className="h-3 w-3" />} label="Authenticated Email" value={d.lastPollEmail || authUser?.email || '—'} />
          <Row
            icon={d.lastResponseOk
              ? <CheckCircle2 className="h-3 w-3 text-green-600" />
              : d.lastResponseOk === null
                ? <Clock className="h-3 w-3" />
                : <XCircle className="h-3 w-3 text-red-600" />}
            label="Response Status"
            value={d.lastResponseOk === null ? 'No poll yet' : d.lastResponseOk ? 'OK' : 'FAILED'}
            valueClass={d.lastResponseOk === null ? '' : d.lastResponseOk ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}
          />
          <Row icon={<Database className="h-3 w-3" />} label="Returned Count" value={String(d.lastReturnedCount ?? '—')} />
          <Row icon={<Database className="h-3 w-3" />} label="Store Count" value={String(d.lastStoreCount ?? '—')} />
          <Row icon={<Activity className="h-3 w-3" />} label="Poll Type" value={d.lastPollIsInitial === null ? '—' : d.lastPollIsInitial ? 'Seed (initial)' : 'Poll (15s)'} />
          <Row icon={<Activity className="h-3 w-3" />} label="Store Status" value={snap.status} />
          <Row icon={<Activity className="h-3 w-3" />} label="Badge Count" value={String(snap.badgeCount)} />
          {hasPollError && (
            <div className="flex items-start gap-2 pt-2 border-t">
              <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <div>
                <span className="text-sm text-muted-foreground">Latest Error: </span>
                <span className="text-sm text-red-600 font-medium break-words">{d.lastError || '—'}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Identity Resolution */}
      {resolutionChain && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="w-4 h-4 text-blue-500" />
              Identity Resolution — {resolutionChain.mode || 'unknown'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Row label="Auth User ID" value={resolutionChain.auth_user_id} mono />
            <Row label="Auth Email" value={resolutionChain.auth_email} mono />
            <Row label="Auth Role" value={resolutionChain.auth_role} />
            <Row label="Employee Match Method" value={resolutionChain.employee_match_method} />
            <Row label="Employee Record ID" value={resolutionChain.employee_record_id} mono />
            <Row label="Employee ID" value={resolutionChain.employee_id} mono />
            <Row label="Employee Email" value={resolutionChain.employee_email} mono />
            <Row label="Linked User ID" value={resolutionChain.linked_user_id} mono />
            <Row label="Canonical Role Key" value={resolutionChain.canonical_role_key} mono />
            <Row label="Department" value={resolutionChain.department} />
            <Row label="Landing Page" value={resolutionChain.landing_page} mono />
            <Row label="Current Route" value={window.location.pathname} mono />
            <Row label="Fallback Used" value={resolutionChain.fallback_used || 'None'} />
          </CardContent>
        </Card>
      )}

      {/* Task Filter */}
      {emp && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckSquare className="w-4 h-4 text-green-500" />
              Task Filter Debug
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Row label="Employee ID" value={emp.employee_id} mono />
            <Row label="Employee Email" value={(emp.email || '').toLowerCase().trim()} mono />
            <Row label="Role" value={resolutionChain?.canonical_role_key} />
            <Row label="Department" value={emp.department} />
            <Row label="Tasks Fetched" value={String(taskTotalFetched)} />
            <Row label="Tasks After Filter" value={String(taskCount)} />
          </CardContent>
        </Card>
      )}

      {/* Notification Filter */}
      {emp && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="w-4 h-4 text-amber-500" />
              Notification Filter Debug
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Row label="Registry ID" value={emp.id} mono />
            <Row label="Recipient Email" value={(emp.email || '').toLowerCase().trim()} mono />
            <Row label="Total Fetched" value={String(notifTotalFetched)} />
            <Row label="Matching Count" value={String(notificationCount)} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ icon, label, value, mono, valueClass = '' }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className={`ml-auto text-right truncate max-w-[300px] ${mono ? 'font-mono text-xs' : 'font-medium'} ${valueClass}`}>
        {value === undefined || value === null || value === '' ? '—' : String(value)}
      </span>
    </div>
  );
}

export default function DeveloperDiagnostics() {
  return (
    <ErrorBoundary message="Developer Diagnostics encountered an error. The application continues normally.">
      <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
        <DiagnosticsContent />
      </div>
    </ErrorBoundary>
  );
}