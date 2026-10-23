import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Enterprise Impersonation Service — End
 *
 * Marks an impersonation audit log as ended with duration.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json();
    const { log_id } = body;
    if (!log_id) return Response.json({ error: 'log_id is required' }, { status: 400 });

    const logs = await base44.asServiceRole.entities.ImpersonationLog.filter(
      { log_id, status: 'active' }, '-created_date', 1
    );
    if (!logs || logs.length === 0) {
      return Response.json({ error: 'Active impersonation log not found' }, { status: 404 });
    }

    const log = logs[0];
    const now = new Date();
    const start = new Date(log.start_time);
    const durationMinutes = Math.round((now.getTime() - start.getTime()) / 60000);

    await base44.asServiceRole.entities.ImpersonationLog.update(log.id, {
      end_time: now.toISOString(),
      duration_minutes: durationMinutes,
      status: 'ended',
    });

    return Response.json({ success: true, duration_minutes: durationMinutes });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});