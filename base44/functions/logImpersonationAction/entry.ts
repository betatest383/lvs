import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Enterprise Impersonation Service — Log Action
 *
 * Appends an action to the impersonation audit trail.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { log_id, action, module } = body;
    if (!log_id || !action) return Response.json({ error: 'log_id and action are required' }, { status: 400 });

    const logs = await base44.asServiceRole.entities.ImpersonationLog.filter(
      { log_id }, '-created_date', 1
    );
    if (!logs || logs.length === 0) {
      return Response.json({ error: 'Log not found' }, { status: 404 });
    }

    const log = logs[0];
    let actions = [];
    try { actions = JSON.parse(log.actions_performed || '[]'); } catch {}
    actions.push({
      action,
      module: module || '',
      timestamp: new Date().toISOString(),
    });

    await base44.asServiceRole.entities.ImpersonationLog.update(log.id, {
      actions_performed: JSON.stringify(actions).substring(0, 50000),
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});