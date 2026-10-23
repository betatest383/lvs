import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RotateCcw, Pause, Play, ShieldAlert, Clock, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

/**
 * TaskResumeHistorySection — Displays interruption and resume history
 * for a task in the TaskDetail page.
 *
 * Shows:
 *   - Interrupted by task (if currently interrupted)
 *   - Interruption timestamp
 *   - Saved checkpoint
 *   - Resume required status
 *   - Resume notification status
 *   - Resume attempts / results
 *   - Resumed timestamp
 *   - Manager help requests
 */
export default function TaskResumeHistorySection({ taskId }) {
  const [sessions, setSessions] = useState([]);
  const [checkpoints, setCheckpoints] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [resumeNotifs, setResumeNotifs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [sessionRes, checkpointRes] = await Promise.all([
          base44.functions.invoke('manageNotification', {
            action: 'list',
            listScope: 'all',
            filters: { limit: 200 },
          }),
          base44.entities.WorkSession.filter({ task_id: taskId }, '-created_date', 20),
        ]);

        if (cancelled) return;

        // Filter sessions for this task
        const taskSessions = (Array.isArray(sessionRes.data?.notifications) ? [] : [])
          .concat(Array.isArray(checkpointRes) ? checkpointRes : []);
        setSessions(taskSessions);

        // Load checkpoints for this task
        const taskCheckpoints = await base44.entities.WorkCheckpoint.filter(
          { task_id: taskId },
          '-created_date',
          20
        );
        if (!cancelled) setCheckpoints(taskCheckpoints || []);

        // Load OrchestrationDecisions for this task
        const taskDecisions = await base44.entities.OrchestrationDecision.filter(
          { $or: [{ selected_task_id: taskId }, { previous_task_id: taskId }] },
          '-created_date',
          20
        );
        if (!cancelled) setDecisions(taskDecisions || []);

        // Load resume notifications for this task
        const allNotifs = sessionRes.data?.notifications || [];
        const resumeNotifs = allNotifs.filter(
          (n) => n.related_task === taskId && n.notification_purpose === 'task_resume_required'
        );
        if (!cancelled) setResumeNotifs(resumeNotifs);
      } catch (e) {
        // Silent fail — this section is informational
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [taskId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <RotateCcw className="w-4 h-4" />
            Interruption & Resume History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  const hasHistory = sessions.length > 0 || checkpoints.length > 0 || decisions.length > 0 || resumeNotifs.length > 0;

  if (!hasHistory) {
    return null; // Don't show the section if there's no history
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <RotateCcw className="w-4 h-4" />
          Interruption & Resume History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Work Sessions */}
        {sessions.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Work Sessions</p>
            <div className="space-y-2">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                  <SessionStatusIcon status={s.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{s.work_session_number || 'Session'}</p>
                    <p className="text-xs text-muted-foreground">
                      Status: {s.status}
                      {s.started_at && ` • Started: ${new Date(s.started_at).toLocaleString()}`}
                      {s.paused_at && ` • Paused: ${new Date(s.paused_at).toLocaleString()}`}
                      {s.resumed_at && ` • Resumed: ${new Date(s.resumed_at).toLocaleString()}`}
                      {s.completed_at && ` • Completed: ${new Date(s.completed_at).toLocaleString()}`}
                    </p>
                    {s.interrupted_by_task_number && (
                      <p className="text-xs text-muted-foreground">
                        Interrupted by: {s.interrupted_by_task_number}
                      </p>
                    )}
                    {s.resume_required && (
                      <Badge variant="warning" className="mt-1 text-xs">Resume Required</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Checkpoints */}
        {checkpoints.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Checkpoints</p>
            <div className="space-y-2">
              {checkpoints.map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                  <CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{c.checkpoint_number || 'Checkpoint'}</p>
                    <p className="text-xs text-muted-foreground">
                      Status: {c.resume_status}
                      {c.route && ` • Route: ${c.route}`}
                      {c.workflow_step !== undefined && ` • Step: ${c.workflow_step}`}
                      {c.created_at && ` • Created: ${new Date(c.created_at).toLocaleString()}`}
                      {c.resumed_at && ` • Resumed: ${new Date(c.resumed_at).toLocaleString()}`}
                    </p>
                    {c.interrupting_task_number && (
                      <p className="text-xs text-muted-foreground">
                        Caused by: {c.interrupting_task_number}
                      </p>
                    )}
                    {c.notes && (
                      <p className="text-xs text-muted-foreground italic">{c.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Orchestration Decisions */}
        {decisions.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Orchestration Decisions</p>
            <div className="space-y-2">
              {decisions.map((d) => (
                <div key={d.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                  <DecisionIcon type={d.decision_type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{d.decision_number || 'Decision'}</p>
                    <p className="text-xs text-muted-foreground">
                      Type: {d.decision_type?.replace(/_/g, ' ')}
                      {d.created_at && ` • ${new Date(d.created_at).toLocaleString()}`}
                    </p>
                    {d.decision_reason && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{d.decision_reason}</p>
                    )}
                    {d.orchestration_mode && (
                      <Badge variant="outline" className="mt-1 text-xs">{d.orchestration_mode}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resume Notifications */}
        {resumeNotifs.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Resume Notifications</p>
            <div className="space-y-2">
              {resumeNotifs.map((n) => (
                <div key={n.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                  <Clock className="w-4 h-4 text-orange-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Status: {n.status}
                      {n.sent_date && ` • Sent: ${new Date(n.sent_date).toLocaleString()}`}
                      {n.resume_snooze_until && ` • Snoozed until: ${new Date(n.resume_snooze_until).toLocaleString()}`}
                      {n.resolved_at && ` • Resolved: ${new Date(n.resolved_at).toLocaleString()}`}
                    </p>
                    {n.resolution_decision && (
                      <p className="text-xs text-muted-foreground italic">{n.resolution_decision}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SessionStatusIcon({ status }) {
  if (status === 'active') return <Play className="w-4 h-4 text-green-500 flex-shrink-0" />;
  if (status === 'interrupted') return <Pause className="w-4 h-4 text-orange-500 flex-shrink-0" />;
  if (status === 'paused') return <Pause className="w-4 h-4 text-yellow-500 flex-shrink-0" />;
  if (status === 'completed') return <CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0" />;
  return <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />;
}

function DecisionIcon({ type }) {
  if (type === 'interrupt_current_work') return <ShieldAlert className="w-4 h-4 text-orange-500 flex-shrink-0" />;
  if (type === 'resume_previous_work') return <RotateCcw className="w-4 h-4 text-blue-500 flex-shrink-0" />;
  return <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />;
}