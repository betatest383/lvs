import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    // SECURITY: Ignore caller-supplied role — always use server-resolved user role
    const role = user.role;

    // Get the role's portal_access_mode from RoleRegistry
    const roleRecords = await base44.asServiceRole.entities.RoleRegistry.filter({
      $or: [
        { role_key: role },
        { role_name: { $regex: role.replace(/_/g, ' '), $options: 'i' } }
      ]
    });
    const roleRecord = roleRecords[0];
    const portalAccessMode = roleRecord?.portal_access_mode || 'inherited';

    // JIT SAFETY NET: Activate any scheduled records whose time has arrived.
    // This ensures scheduled configs activate even if the cron automation hasn't fired yet.
    const scheduledRecords = await base44.asServiceRole.entities.NavigationVisibilityOverride.filter({
      role: role,
      status: 'scheduled',
      is_active: true,
    }, '-scheduled_publish_at', 10);

    const now = Date.now();
    for (const record of scheduledRecords) {
      if (!record.scheduled_publish_at) continue;
      try {
        if (new Date(record.scheduled_publish_at).getTime() <= now) {
          // Archive the current published version for this role
          const currentPublished = await base44.asServiceRole.entities.NavigationVisibilityOverride.filter({
            role: role,
            status: 'published',
            is_active: true,
          }, '-published_at', 1);
          if (currentPublished[0] && currentPublished[0].id !== record.id) {
            await base44.asServiceRole.entities.NavigationVisibilityOverride.update(currentPublished[0].id, {
              status: 'archived',
              is_active: false,
            });
          }
          // Activate the scheduled record
          await base44.asServiceRole.entities.NavigationVisibilityOverride.update(record.id, {
            status: 'published',
            published_at: new Date().toISOString(),
            published_by: 'scheduled_activation',
          });
        }
      } catch {}
    }

    // Get the latest published override for this role
    const records = await base44.asServiceRole.entities.NavigationVisibilityOverride.filter({
      role: role,
      status: 'published',
      is_active: true,
    }, '-published_at', 1);

    const published = records[0];
    if (!published) {
      return Response.json({
        overrides: [],
        landing_page: null,
        version: null,
        portal_access_mode: portalAccessMode,
      });
    }

    let parsed = [];
    try { parsed = JSON.parse(published.overrides_json || '[]'); } catch {}

    return Response.json({
      overrides: parsed,
      landing_page: published.landing_page_override || null,
      version: published.version,
      portal_access_mode: portalAccessMode,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});