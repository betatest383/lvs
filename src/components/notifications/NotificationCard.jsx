import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Bell, AlertTriangle, CheckCircle2, Clock, Archive } from 'lucide-react';
import {
  NOTIFICATION_TYPE_COLORS, NOTIFICATION_STATUS_COLORS, PRIORITY_COLORS,
  PRIORITY_BORDER, isUnread, isCritical, requiresAction, isResolved,
  RESOLUTION_TYPE_LABELS, RESOLUTION_TYPE_COLORS,
} from '@/lib/notificationConstants';
import { BADGE_COLORS } from '@/lib/notificationInclusionResolver';

export default function NotificationCard({ notification, onClick, onAcknowledge, onArchive }) {
  const n = notification;
  const inclusion = n._inclusion;
  const badge = inclusion?.badge;
  const badgeColor = badge ? BADGE_COLORS[badge] : '';

  return (
    <Card
      className="hover:shadow-md transition-shadow cursor-pointer group relative overflow-hidden"
      style={{ borderLeftWidth: '4px', borderLeftColor: PRIORITY_BORDER[n.priority] || '#ca8a04' }}
    >
      <CardContent className="p-3" onClick={() => onClick?.(n)}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              {isUnread(n) && <span className="w-2 h-2 rounded-full bg-accent shrink-0" />}
              <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${NOTIFICATION_TYPE_COLORS[n.notification_type] || ''}`}>{n.notification_type}</span>
              <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${PRIORITY_COLORS[n.priority] || ''}`}>{n.priority}</span>
              {badge && (
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${badgeColor}`}>{badge}</span>
              )}
              {inclusion?.unexpectedMatch && (
                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-500 text-white">Unexpected Match</span>
              )}
              {isResolved(n) && n.resolution_type && (
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${RESOLUTION_TYPE_COLORS[n.resolution_type] || ''}`}>
                  {RESOLUTION_TYPE_LABELS[n.resolution_type] || n.resolution_type}
                </span>
              )}
              {n.requires_acknowledgment && !requiresAction(n) && !isResolved(n) && (
                <span className="px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700 flex items-center gap-0.5">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Acked
                </span>
              )}
              {n.is_archived && (
                <span className="px-1.5 py-0.5 rounded text-xs bg-gray-200 text-gray-600 flex items-center gap-0.5">
                  <Archive className="w-2.5 h-2.5" /> Archived
                </span>
              )}
            </div>
            <p className="text-sm font-medium line-clamp-2">{n.title}</p>
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
              {n.source_module && <span className="truncate">{n.source_module}</span>}
              {n.created_date && <span>{new Date(n.created_date).toLocaleDateString()}</span>}
            </div>
          </div>
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${NOTIFICATION_STATUS_COLORS[n.status] || ''}`}>{n.status}</span>
        </div>
        {(onAcknowledge || onArchive) && (
          <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {requiresAction(n) && onAcknowledge && (
              <button
                onClick={(e) => { e.stopPropagation(); onAcknowledge(n); }}
                className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 flex items-center gap-1"
              >
                <CheckCircle2 className="w-3 h-3" /> Acknowledge
              </button>
            )}
            {onArchive && (
              <button
                onClick={(e) => { e.stopPropagation(); onArchive(n); }}
                className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/70 flex items-center gap-1"
              >
                <Archive className="w-3 h-3" /> Archive
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}