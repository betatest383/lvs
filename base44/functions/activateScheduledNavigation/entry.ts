import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * Scheduled activation engine for NavigationVisibilityOverride.
 *
 * Finds all records with status='scheduled', is_active=true whose
 * scheduled_publish_at has arrived, and activates them:
 *   1. Archives the current 'published' version for that role
 *   2. Sets the scheduled record to status='published'
 *   3. Records published_at and published_by='scheduled_activation'
 *
 * Designed to run every 5 minutes via a scheduled automation.
 * Also invoked just-in-time by getNavigationOverrides as a safety net.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'owner') {
      return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });
    }

    const now = new Date();
    const nowISO = now.toISOString();

    // Find ALL scheduled records across all roles
    const allScheduled = await base44.asServiceRole.entities.NavigationVisibilityOverride.filter({
      status: 'scheduled',
      is_active: true,
    }, '-scheduled_publish_at', 200);

    // Filter to only those whose activation time has arrived
    const dueRecords = allScheduled.filter(r => {
      if (!r.scheduled_publish_at) return false;
      try {
        return new Date(r.scheduled_publish_at).getTime() <= now.getTime();
      } catch {
        return false;
      }
    });

    const results = [];

    for (const record of dueRecords) {
      try {
        // 1. Archive the current published version for this role (if any)
        const currentPublished = await base44.asServiceRole.entities.NavigationVisibilityOverride.filter({
          role: record.role,
          status: 'published',
          is_active: true,
        }, '-published_at', 1);

        if (currentPublished[0] && currentPublished[0].id !== record.id) {
          await base44.asServiceRole.entities.NavigationVisibilityOverride.update(currentPublished[0].id, {
            status: 'archived',
            is_active: false,
          });
        }

        // 2. Activate the scheduled record
        await base44.asServiceRole.entities.NavigationVisibilityOverride.update(record.id, {
          status: 'published',
          published_at: nowISO,
          published_by: 'scheduled_activation',
        });

        results.push({
          role: record.role,
          version: record.version,
          record_id: record.id,
          scheduled_for: record.scheduled_publish_at,
          activated: true,
        });
      } catch (e) {
        results.push({
          role: record.role,
          version: record.version,
          record_id: record.id,
          activated: false,
          error: e.message,
        });
      }
    }

    return Response.json({
      checked: allScheduled.length,
      due: dueRecords.length,
      activated: results.filter(r => r.activated).length,
      failed: results.filter(r => !r.activated).length,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});