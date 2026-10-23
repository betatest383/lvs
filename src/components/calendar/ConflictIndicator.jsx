import React from 'react';
import { AlertTriangle, Clock, Users, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Conflict indicator — detects and displays scheduling conflicts.
 * Phase 4A: detect only, do NOT auto-resolve.
 *
 * Checks for:
 * - Two scheduled tasks overlapping for one employee
 * - Scheduled task outside configured work hours
 * - Active WorkSession overlapping scheduled work
 * - Critical tasks competing for the same time
 * - Employee assigned to simultaneous tasks
 */
export function detectConflicts(events) {
  const conflicts = [];
  const now = new Date();

  // Group by assignee
  const byAssignee = {};
  for (const e of events) {
    if (!e.startsAt || !e.assigneeId) continue;
    if (!byAssignee[e.assigneeId]) byAssignee[e.assigneeId] = [];
    byAssignee[e.assigneeId].push(e);
  }

  for (const [assigneeId, assigneeEvents] of Object.entries(byAssignee)) {
    // Sort by start time
    const sorted = [...assigneeEvents].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));

    for (let i = 0; i < sorted.length; i++) {
      const e = sorted[i];
      const start = new Date(e.startsAt);
      const end = e.endsAt ? new Date(e.endsAt) : new Date(start.getTime() + 60 * 60 * 1000);

      // Check work hours
      const startHour = start.getHours();
      if (startHour < 7 || startHour >= 18) {
        conflicts.push({
          type: 'outside_work_hours',
          severity: 'warning',
          eventId: e.id,
          message: `"${e.title}" starts at ${startHour}:00 — outside work hours (7am–6pm)`,
        });
      }

      // Check active WorkSession overlap
      if (e.workSessionStatus === 'in_progress' || e.workSessionStatus === 'paused_by_higher_priority') {
        conflicts.push({
          type: 'active_worksession_overlap',
          severity: 'warning',
          eventId: e.id,
          message: `"${e.title}" has an active WorkSession that may conflict with the scheduled time`,
        });
      }

      // Check overlap with next event
      for (let j = i + 1; j < sorted.length; j++) {
        const e2 = sorted[j];
        const start2 = new Date(e2.startsAt);
        if (start2 < end && start2 >= start) {
          const isCritical = e.priority === 'Critical' || e2.priority === 'Critical';
          conflicts.push({
            type: 'overlap',
            severity: isCritical ? 'critical' : 'warning',
            eventId: e.id,
            eventId2: e2.id,
            message: `"${e.title}" and "${e2.title}" overlap for ${e.assigneeName || 'same employee'}`,
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Conflict badge component to display on calendar cards.
 */
export default function ConflictIndicator({ conflicts }) {
  if (!conflicts || conflicts.length === 0) return null;

  const critical = conflicts.filter(c => c.severity === 'critical');
  const warnings = conflicts.filter(c => c.severity === 'warning');

  return (
    <div className="flex items-center gap-1">
      {critical.length > 0 && (
        <div
          className="flex items-center gap-0.5 text-red-600"
          title={critical.map(c => c.message).join('\n')}
        >
          <AlertCircle className="w-3 h-3" />
          <span className="text-[10px] font-medium">{critical.length}</span>
        </div>
      )}
      {warnings.length > 0 && (
        <div
          className="flex items-center gap-0.5 text-amber-600"
          title={warnings.map(c => c.message).join('\n')}
        >
          <AlertTriangle className="w-3 h-3" />
          <span className="text-[10px] font-medium">{warnings.length}</span>
        </div>
      )}
    </div>
  );
}