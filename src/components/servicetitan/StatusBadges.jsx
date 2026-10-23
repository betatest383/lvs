import { EVENT_STATUS_COLORS } from "@/lib/servicetitanConstants";

export function EventStatusBadge({ status }) {
  const color = EVENT_STATUS_COLORS[status] || 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {status || 'Unknown'}
    </span>
  );
}

export function TransferSheetStatusBadge({ status }) {
  const colors = {
    'Not Started': 'bg-slate-100 text-slate-600',
    'In Progress': 'bg-amber-100 text-amber-700',
    Picked: 'bg-green-100 text-green-700',
    'N/A': 'bg-slate-100 text-slate-400',
  };
  const color = colors[status] || 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {status || '—'}
    </span>
  );
}

export function SyncBadge({ lastSynced }) {
  if (!lastSynced) return <span className="text-xs text-muted-foreground">Never synced</span>;
  const diff = Date.now() - new Date(lastSynced).getTime();
  const mins = Math.floor(diff / 60000);
  const isStale = mins > 60;
  return (
    <span className={`text-xs ${isStale ? 'text-amber-600' : 'text-muted-foreground'}`}>
      {mins < 1 ? 'synced just now' : mins < 60 ? `synced ${mins}m ago` : `synced ${Math.floor(mins / 60)}h ago`}
    </span>
  );
}