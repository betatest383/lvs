import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot } from '@/lib/taskRealtimeStore';
import { useAuth } from '@/lib/AuthContext';
import { Activity, Mail, CheckCircle2, XCircle, Clock, Database, AlertTriangle } from 'lucide-react';

/**
 * Temporary visible debug panel for real-time task delivery diagnostics.
 * Visible ONLY to admin (Owner) users. Shows the last poll cycle's state
 * so the Owner can diagnose real-time failures on devices without a console
 * (e.g. Chrome for iPad).
 *
 * This panel does NOT modify any task logic — it only reads from the store.
 */
export default function TaskRealtimeDebugPanel() {
  const { user } = useAuth();
  useSyncExternalStore(subscribe, () => getSnapshot().refreshEpoch);
  const snap = getSnapshot();

  // Temporary: visible to admin (Owner), Philip's lead-tech session, or ?taskDebug=1
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const debugFlag = urlParams?.get('taskDebug') === '1';
  const isPhilip = user?.email === 'lvcsdocs@gmail.com';
  if (user?.role !== 'admin' && !isPhilip && !debugFlag) return null;

  const d = snap.debug || {};
  const pollTime = d.lastPollTime ? new Date(d.lastPollTime).toLocaleTimeString('en-US', { hour12: false }) : '—';
  const hasError = !d.lastResponseOk && d.lastResponseOk !== null;
  const borderColor = d.lastResponseOk === null ? 'border-muted-foreground/30' : d.lastResponseOk ? 'border-green-500' : 'border-red-500';

  return (
    <div className={`fixed bottom-4 right-4 z-[9999] w-72 rounded-lg border-2 ${borderColor} bg-card shadow-xl text-xs`}>
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-muted/50 rounded-t-lg">
        <Activity className="h-3.5 w-3.5 text-accent" />
        <span className="font-semibold">Task Realtime Debug</span>
        <span className="ml-auto text-[10px] text-muted-foreground">Owner only</span>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        <Row icon={<Clock className="h-3 w-3" />} label="Last Poll" value={pollTime} />
        <Row icon={<Mail className="h-3 w-3" />} label="Logged-in Email" value={d.lastPollEmail || user?.email || '—'} />
        <Row
          icon={d.lastResponseOk ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : d.lastResponseOk === null ? <Clock className="h-3 w-3" /> : <XCircle className="h-3 w-3 text-red-600" />}
          label="Response Status"
          value={d.lastResponseOk === null ? 'No poll yet' : d.lastResponseOk ? 'OK' : 'FAILED'}
          valueClass={d.lastResponseOk === null ? '' : d.lastResponseOk ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}
        />
        <Row icon={<Database className="h-3 w-3" />} label="Returned Count" value={String(d.lastReturnedCount ?? '—')} />
        <Row icon={<Database className="h-3 w-3" />} label="Store Count" value={String(d.lastStoreCount ?? '—')} />
        <Row icon={<Activity className="h-3 w-3" />} label="Poll Type" value={d.lastPollIsInitial === null ? '—' : d.lastPollIsInitial ? 'Seed (initial)' : 'Poll (15s)'} />
        {hasError && (
          <div className="flex items-start gap-1.5 pt-1 border-t border-border">
            <AlertTriangle className="h-3 w-3 text-red-600 mt-0.5 shrink-0" />
            <div>
              <div className="text-muted-foreground">Latest Error</div>
              <div className="text-red-600 font-medium break-words">{d.lastError || '—'}</div>
            </div>
          </div>
        )}
        <div className="pt-1.5 border-t border-border text-[10px] text-muted-foreground flex justify-between">
          <span>Store: {snap.status}</span>
          <span>Badge: {snap.badgeCount}</span>
          <span>Epoch: {snap.refreshEpoch}</span>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, value, valueClass = '' }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className={`ml-auto text-right truncate max-w-[140px] ${valueClass}`}>{value}</span>
    </div>
  );
}