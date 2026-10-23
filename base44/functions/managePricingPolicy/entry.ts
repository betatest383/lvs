import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { timingSafeEqual } from '../../shared/securityAuth.ts';

// Authorization: only Owner/Admin may manage pricing policy. The
// `promote_due_policies` action is system-initiated (no user session) and is
// the only action that runs without authentication — it may only activate
// scheduled policies whose effective time has already arrived, so an
// unauthenticated caller cannot create, edit, or delete policy data.

function isAdmin(user) {
  const r = (user?.role || '').toLowerCase();
  return r === 'owner' || r === 'admin';
}

// "Now" for effective-time comparison. effective_date_time is stored as a UTC
// instant; create_version converts the admin's local (America/New_York) input
// to UTC on input, so all comparisons here are instant-based and timezone
// consistent with that input conversion.
function nowDate() { return new Date(); }

// ── Concurrency-safe policy identity ──
// policy_id is the authoritative immutable identity. It is generated with a
// random 6-hex suffix and verified unique before create (retry up to 12x).
// Two simultaneous creates therefore cannot produce the same policy_id.
// version_number is a NON-AUTHORITATIVE display value (best-effort max+1);
// Base44 entity creates do not provide an atomic sequence, so concurrent
// creates may produce duplicate display version numbers. The unique
// policy_id + platform record id remain the authoritative identity.
async function generateUniquePolicyId(asRole) {
  for (let i = 0; i < 12; i++) {
    const hex = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
    const candidate = `PP-${hex}`;
    const existing = await asRole.entities.PricingPolicy.filter({ policy_id: candidate }, null, 1).catch(() => []);
    if (!existing || existing.length === 0) return candidate;
  }
  return `PP-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e6).toString(36).toUpperCase()}`;
}

async function nextDisplayVersion(asRole) {
  const existing = await asRole.entities.PricingPolicy.filter({}, null, 500).catch(() => []);
  return existing.reduce((mx, p) => Math.max(mx, p.version_number || 0), 0) + 1;
}

// Resolve all currently-active policies (status 'active' AND effective <= now).
async function resolveActiveList(asRole) {
  const now = nowDate();
  const policies = await asRole.entities.PricingPolicy.filter({ status: 'active' }, '-effective_date_time', 200).catch(() => []);
  return policies.filter(p => new Date(p.effective_date_time || p.created_at) <= now);
}

// Supersede all currently-active policies except the record with newRecordId.
// Returns the prior active policy record id (first one superseded).
async function supersedeActive(asRole, newRecordId) {
  const now = nowDate();
  const policies = await asRole.entities.PricingPolicy.filter({ status: 'active' }, '-effective_date_time', 200).catch(() => []);
  const active = policies.filter(p => new Date(p.effective_date_time || p.created_at) <= now && p.id !== newRecordId);
  let priorId = null;
  for (const p of active) {
    priorId = priorId || p.id;
    await asRole.entities.PricingPolicy.update(p.id, { status: 'superseded' });
  }
  return priorId;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let body = {};
    try { body = await req.json(); } catch {}
    const action = body.action || 'list_history';
    const asRole = base44.asServiceRole;

    // ── promote_due_policies (system-initiated, no user required) ──
    // Promotes the earliest due scheduled policy to active, superseding the
    // prior active policy. Idempotent: re-running with nothing due is a no-op;
    // re-running after a successful promotion finds nothing due. Deterministic
    // for multiple scheduled policies with different effective dates (earliest
    // first; later ones stay scheduled until their own time). Fails safely if
    // two due policies share the exact same effective time (conflict). Verifies
    // a single active policy remains after promotion, reverting on conflict.
    if (action === 'promote_due_policies') {
      // ── SECURE AUTHORIZATION ──
      // promote_due_policies is a system-initiated mutation. It must NOT be
      // callable as an unauthenticated request merely because it runs before
      // the normal user-auth check. One verified authorization path is required:
      //   (1) An authenticated Owner/Admin Base44 user — the scheduled automation
      //       runner invokes this function with an admin service identity, and
      //       an Owner/Admin may trigger it as a controlled diagnostic.
      //   (2) A valid X-LVC-Scheduler-Secret header, validated against the
      //       LVC_SCHEDULER_SECRET environment variable using constant-time
      //       comparison (timingSafeEqual). For external system callers without
      //       a user session.
      // Unauthenticated (no user, no header) → 401. Invalid credential or a
      // regular employee → 403. The secret is never logged, returned, or echoed.
      // No database read or mutation occurs before authorization succeeds.
      let promoteUser = null;
      try { promoteUser = await base44.auth.me(); } catch {}
      if (promoteUser) {
        if (!isAdmin(promoteUser)) {
          return Response.json({ error: 'Only Owner/Admin may trigger scheduled policy promotion.' }, { status: 403 });
        }
      } else {
        const expectedSecret = Deno.env.get('LVC_SCHEDULER_SECRET') || '';
        const providedSecret = req.headers.get('X-LVC-Scheduler-Secret') || '';
        if (!expectedSecret) {
          return Response.json({ error: 'Server not configured for scheduled promotion.' }, { status: 500 });
        }
        if (!providedSecret) {
          return Response.json({ error: 'Unauthorized — authentication required.' }, { status: 401 });
        }
        if (!timingSafeEqual(providedSecret, expectedSecret)) {
          return Response.json({ error: 'Forbidden — invalid scheduler credential.' }, { status: 403 });
        }
      }
      const now = nowDate();
      const scheduled = await asRole.entities.PricingPolicy.filter({ status: 'scheduled' }, 'effective_date_time', 200).catch(() => []);
      const due = scheduled.filter(p => new Date(p.effective_date_time || p.created_at) <= now);
      if (due.length === 0) {
        return Response.json({ ok: true, promoted: [], message: 'No scheduled policies are due for activation.' });
      }
      due.sort((a, b) => new Date(a.effective_date_time) - new Date(b.effective_date_time));
      if (due.length > 1 && new Date(due[0].effective_date_time).getTime() === new Date(due[1].effective_date_time).getTime()) {
        return Response.json({ ok: false, error: 'Conflicting due scheduled policies share the same effective time. Resolve manually.', due }, { status: 409 });
      }
      const target = due[0];
      const priorId = await supersedeActive(asRole, target.id);
      const ts = new Date().toISOString();
      const updated = await asRole.entities.PricingPolicy.update(target.id, {
        status: 'active',
        effective_immediately: true,
        activated_by: 'system:scheduled-automation',
        activated_at: ts,
        superseded_policy_id: priorId || target.superseded_policy_id || null,
      });
      const activeNow = await resolveActiveList(asRole);
      if (activeNow.length > 1) {
        await asRole.entities.PricingPolicy.update(target.id, { status: 'scheduled', activated_by: target.activated_by, activated_at: target.activated_at });
        return Response.json({ ok: false, error: 'Multiple active policies detected after promotion. Reverted to prevent conflict.', active_count: activeNow.length }, { status: 409 });
      }
      return Response.json({ ok: true, promoted: [updated], active_count: activeNow.length });
    }

    // All other actions require an authenticated Owner/Admin.
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isAdmin(user)) return Response.json({ error: 'Only Owner/Admin users may manage the pricing policy.' }, { status: 403 });

    // ── resolve_active ──
    if (action === 'resolve_active') {
      const active = await resolveActiveList(asRole);
      if (active.length === 0) return Response.json({ ok: false, error: 'No active pricing policy is configured. Contact an administrator.' }, { status: 400 });
      if (active.length > 1) return Response.json({ ok: false, error: 'Multiple active pricing policies detected. Contact an administrator.' }, { status: 500 });
      return Response.json({ ok: true, policy: active[0] });
    }

    // ── list_history ──
    if (action === 'list_history') {
      const policies = await asRole.entities.PricingPolicy.filter({}, '-version_number', 500).catch(() => []);
      return Response.json({ ok: true, policies });
    }

    // ── create_version ──
    if (action === 'create_version') {
      const { policy_name, gross_profit_per_production_day, gross_profit_target_per_crew_hour, minimum_gross_margin_percentage, minimum_net_contribution_per_production_day, minimum_net_contribution_per_crew_hour, partial_day_net_contribution_threshold_hours, effective_date_time, effective_immediately, change_reason, source_policy_id, pricing_target_model } = body;
      const model = (pricing_target_model === 'hourly_capped') ? 'hourly_capped' : 'daily';
      if (!policy_name || !String(policy_name).trim()) return Response.json({ error: 'Policy name is required.' }, { status: 400 });
      const mm = Number(minimum_gross_margin_percentage);
      if (!(mm > 0 && mm < 100)) return Response.json({ error: 'Minimum gross margin must be greater than 0% and less than 100%.' }, { status: 400 });
      const minNet = Number(minimum_net_contribution_per_production_day);
       const minNetHourly = Number(minimum_net_contribution_per_crew_hour ?? 450);
       const partialThreshold = Number(partial_day_net_contribution_threshold_hours ?? 8);
      if (!(minNet >= 0)) return Response.json({ error: 'Minimum daily net contribution must be zero or greater.' }, { status: 400 });
      if (!change_reason || !String(change_reason).trim()) return Response.json({ error: 'A written change reason is required.' }, { status: 400 });
      // Fixed company policy — the 8-hour daily cap is never editable or overridable.
      const maxTargetHoursPerDay = 8;
      let gpPerDay = 0, hourlyGp = 0;
      if (model === 'hourly_capped') {
        hourlyGp = Number(gross_profit_target_per_crew_hour);
        if (!(hourlyGp > 0)) return Response.json({ error: 'Gross profit target per crew hour must be greater than zero.' }, { status: 400 });
        gpPerDay = hourlyGp * maxTargetHoursPerDay; // derived display value
      } else {
        gpPerDay = Number(gross_profit_per_production_day);
        if (!(gpPerDay > 0)) return Response.json({ error: 'Required gross profit per production day must be greater than zero.' }, { status: 400 });
      }

      const policy_id = await generateUniquePolicyId(asRole);
      const version_number = await nextDisplayVersion(asRole);
      const now = nowDate();

      let status = 'draft';
      let effectiveISO = effective_date_time ? new Date(effective_date_time).toISOString() : null;
      if (effective_immediately) { status = 'active'; effectiveISO = now.toISOString(); }
      else if (effectiveISO && new Date(effectiveISO) > now) { status = 'scheduled'; }

      let superseded_policy_id = null;
      if (status === 'active') { superseded_policy_id = await supersedeActive(asRole, null); }

      const created = await asRole.entities.PricingPolicy.create({
        policy_id, version_number,
        policy_name: String(policy_name).trim(),
        pricing_target_model: model,
        gross_profit_target_per_crew_hour: model === 'hourly_capped' ? hourlyGp : null,
        maximum_target_hours_per_day: maxTargetHoursPerDay,
        gross_profit_per_production_day: gpPerDay,
        minimum_gross_margin_percentage: mm,
        minimum_net_contribution_per_production_day: minNet,
         minimum_net_contribution_per_crew_hour: minNetHourly,
         partial_day_net_contribution_threshold_hours: partialThreshold,
        effective_date_time: effectiveISO,
        effective_immediately: !!effective_immediately,
        status,
        change_reason: String(change_reason).trim(),
        created_by: user.email,
        created_at: now.toISOString(),
        activated_by: status === 'active' ? user.email : null,
        activated_at: status === 'active' ? now.toISOString() : null,
        superseded_policy_id,
        source_policy_id: source_policy_id || null,
      });
      return Response.json({ ok: true, policy: created });
    }

    // ── activate (manual) ──
    if (action === 'activate') {
      const { policy_id } = body;
      if (!policy_id) return Response.json({ error: 'policy_id is required.' }, { status: 400 });
      const policies = await asRole.entities.PricingPolicy.filter({ policy_id }, null, 10).catch(() => []);
      const target = policies[0];
      if (!target) return Response.json({ error: 'Policy not found.' }, { status: 404 });
      if (target.status === 'active') return Response.json({ error: 'Policy is already active.' }, { status: 400 });
      if (target.status === 'superseded' || target.status === 'canceled') return Response.json({ error: 'Cannot activate a superseded or canceled policy.' }, { status: 400 });

      const priorId = await supersedeActive(asRole, target.id);
      const now = nowDate();
      const updated = await asRole.entities.PricingPolicy.update(target.id, {
        status: 'active',
        effective_date_time: now.toISOString(),
        effective_immediately: true,
        activated_by: user.email,
        activated_at: now.toISOString(),
        superseded_policy_id: priorId,
      });
      const activeNow = await resolveActiveList(asRole);
      if (activeNow.length > 1) {
        await asRole.entities.PricingPolicy.update(target.id, { status: target.status, activated_by: target.activated_by, activated_at: target.activated_at });
        return Response.json({ ok: false, error: 'Multiple active policies detected after activation. Reverted.', active_count: activeNow.length }, { status: 409 });
      }
      return Response.json({ ok: true, policy: updated });
    }

    // ── cancel ──
    if (action === 'cancel') {
      const { policy_id } = body;
      if (!policy_id) return Response.json({ error: 'policy_id is required.' }, { status: 400 });
      const policies = await asRole.entities.PricingPolicy.filter({ policy_id }, null, 10).catch(() => []);
      const target = policies[0];
      if (!target) return Response.json({ error: 'Policy not found.' }, { status: 404 });
      if (target.status !== 'scheduled' && target.status !== 'draft') return Response.json({ error: 'Only draft or scheduled policies can be canceled.' }, { status: 400 });
      const updated = await asRole.entities.PricingPolicy.update(target.id, { status: 'canceled' });
      return Response.json({ ok: true, policy: updated });
    }

    // ── create_from ──
    if (action === 'create_from') {
      const { source_policy_id } = body;
      if (!source_policy_id) return Response.json({ error: 'source_policy_id is required.' }, { status: 400 });
      const policies = await asRole.entities.PricingPolicy.filter({ policy_id: source_policy_id }, null, 10).catch(() => []);
      const src = policies[0];
      if (!src) return Response.json({ error: 'Source policy not found.' }, { status: 404 });
      const policy_id = await generateUniquePolicyId(asRole);
      const version_number = await nextDisplayVersion(asRole);
      const created = await asRole.entities.PricingPolicy.create({
        policy_id, version_number,
        policy_name: `${src.policy_name || 'Policy'} (Copy)`,
        pricing_target_model: src.pricing_target_model || 'daily',
        gross_profit_target_per_crew_hour: src.gross_profit_target_per_crew_hour || null,
        maximum_target_hours_per_day: src.maximum_target_hours_per_day || 8,
        gross_profit_per_production_day: src.gross_profit_per_production_day,
        minimum_gross_margin_percentage: src.minimum_gross_margin_percentage,
        minimum_net_contribution_per_production_day: src.minimum_net_contribution_per_production_day ?? 3600,
         minimum_net_contribution_per_crew_hour: src.minimum_net_contribution_per_crew_hour ?? 450,
         partial_day_net_contribution_threshold_hours: src.partial_day_net_contribution_threshold_hours ?? 8,
        effective_date_time: null,
        effective_immediately: false,
        status: 'draft',
        change_reason: `Created from ${src.policy_id} — pending edit.`,
        created_by: user.email,
        created_at: new Date().toISOString(),
        source_policy_id: src.policy_id,
      });
      return Response.json({ ok: true, policy: created });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});