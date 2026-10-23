import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  checkAndCreateResumeObligation,
  updateResumeObligation,
} from '../../shared/taskResponseHelpers.ts';

/**
 * retryResumeObligations — Scheduled automation that retries failed
 * ResumeObligation records. Called every 5 minutes by a scheduled automation.
 *
 * Finds obligations in 'failed' state with retry_count < max_retries,
 * reloads the interrupting task, and calls checkAndCreateResumeObligation
 * again. If successful, marks as 'notified'. If still failing, increments
 * retry_count. When retries are exhausted, sets requires_admin_review = true.
 *
 * This ensures no employee's resume obligation is permanently lost.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Find failed obligations that haven't exhausted retries
    const failedObligations = await base44.asServiceRole.entities.ResumeObligation.filter({
      operation_state: 'failed',
      requires_admin_review: false,
    }, '-last_retry_at', 50);

    const results = [];

    for (const obligation of failedObligations) {
      if (obligation.retry_count >= (obligation.max_retries || 5)) {
        // Exhausted retries — mark for admin review
        await updateResumeObligation(base44, obligation.obligation_key, {
          requires_admin_review: true,
          admin_review_status: 'pending',
        });
        results.push({ obligation_key: obligation.obligation_key, result: 'exhausted_retries' });
        continue;
      }

      // Reload the interrupting task
      let interruptingTask = null;
      try {
        interruptingTask = await base44.asServiceRole.entities.EnterpriseTask.get(obligation.interrupting_task_id);
      } catch { /* task may not exist */ }

      if (!interruptingTask) {
        // Interrupting task no longer exists — mark as no_longer_applicable
        await updateResumeObligation(base44, obligation.obligation_key, {
          operation_state: 'no_longer_applicable',
          completed_at: new Date().toISOString(),
          notes: 'Interrupting task no longer exists during retry',
        });
        results.push({ obligation_key: obligation.obligation_key, result: 'no_longer_applicable' });
        continue;
      }

      // Retry: call checkAndCreateResumeObligation again
      try {
        const result = await checkAndCreateResumeObligation(base44, {
          completedTask: interruptingTask,
          user,
          terminalStatus: obligation.terminal_status || interruptingTask.status || 'Completed',
        });

        if (result.notification) {
          // Success — the obligation was updated to 'notified' by checkAndCreateResumeObligation
          results.push({
            obligation_key: obligation.obligation_key,
            result: 'notified',
            notification_id: result.notification.id,
          });
        } else {
          // Still couldn't create notification — increment retry count
          const retryCount = (obligation.retry_count || 0) + 1;
          await updateResumeObligation(base44, obligation.obligation_key, {
            retry_count: retryCount,
            last_retry_at: new Date().toISOString(),
            requires_admin_review: retryCount >= (obligation.max_retries || 5),
            admin_review_status: retryCount >= (obligation.max_retries || 5) ? 'pending' : 'none',
          });
          results.push({
            obligation_key: obligation.obligation_key,
            result: 'still_failing',
            retry_count: retryCount,
          });
        }
      } catch (e) {
        // Retry threw — increment retry count
        const retryCount = (obligation.retry_count || 0) + 1;
        await updateResumeObligation(base44, obligation.obligation_key, {
          retry_count: retryCount,
          last_error: e.message,
          last_retry_at: new Date().toISOString(),
          requires_admin_review: retryCount >= (obligation.max_retries || 5),
          admin_review_status: retryCount >= (obligation.max_retries || 5) ? 'pending' : 'none',
        });
        results.push({
          obligation_key: obligation.obligation_key,
          result: 'error',
          error: e.message,
          retry_count: retryCount,
        });
      }
    }

    return Response.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    return Response.json({ error: String(error.message || error) }, { status: 500 });
  }
});