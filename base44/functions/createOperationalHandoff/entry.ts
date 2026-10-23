import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const parse = (value: any, fallback: any) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
};

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { job_id, estimate_id } = await req.json();
    if (!job_id && !estimate_id) return Response.json({ error: 'job_id or estimate_id is required' }, { status: 400 });

    let estimate = estimate_id ? await base44.asServiceRole.entities.Estimate.get(estimate_id).catch(() => null) : null;
    if (!estimate && job_id) estimate = (await base44.asServiceRole.entities.Estimate.filter({ job_id }, '-created_date', 20))[0] || null;
    const jid = job_id || estimate?.job_id;
    if (!estimate || !jid) return Response.json({ error: 'Accepted estimate not found' }, { status: 404 });

    const [workflows, decisions, packages, scopes, job] = await Promise.all([
      base44.asServiceRole.entities.AppointmentWorkflow.filter({ job_id: jid }, '-updated_date', 5),
      base44.asServiceRole.entities.CustomerDecisionRecord.filter({ job_id: jid }, '-decided_at', 20),
      base44.asServiceRole.entities.EstimatePackage.filter({ job_id: jid }, '-created_date', 50),
      base44.asServiceRole.entities.ScopeOfWork.filter({ job_id: jid }, '-created_date', 50),
      base44.asServiceRole.entities.Job.get(jid).catch(() => null),
    ]);
    const workflow = workflows[0];
    const decision = decisions.find((d: any) => d.id === workflow?.current_customer_decision_record_id) ||
      decisions.find((d: any) => d.estimate_id === estimate.id && ['accept_option', 'switch_option'].includes(d.decision_type));
    const packageId = decision?.estimate_package_id || estimate.selected_package_id || workflow?.selected_option_id;
    const pkg = packages.find((p: any) => p.id === packageId);
    const scope = scopes.find((s: any) => s.estimate_package_id === packageId && !s.superseded_by_id);
    if (!pkg || !scope) return Response.json({ error: 'Accepted package and its scope are required before warehouse handoff.' }, { status: 422 });

    const key = 'accepted-estimate:' + (decision?.id || estimate.id);
    const existing = await base44.asServiceRole.entities.EnterpriseTask.filter({ source_module: 'Accepted Estimate Handoff', source_record_id: key }, null, 20);
    let warehouse = existing.find((t: any) => t.task_type === 'Warehouse');
    let scheduling = existing.find((t: any) => t.assigned_department === 'Scheduling');
    const customer = job?.customer_name || estimate.customer_name || pkg.customer_name || 'Customer';
    const jobRef = job?.crm_job_number || job?.servicetitan_job_number || jid;
    const materials = parse(scope.required_materials, []);
    const fleet = parse(estimate.fleet_resource_requests, []);
    const materialText = Array.isArray(materials) && materials.length ? materials.map((m: any) => '• ' + (m.quantity || 1) + ' ' + (m.unit || 'ea') + ' — ' + (m.material_name || m.name || 'Material')).join('\n') : 'No itemized materials were captured. Confirm required materials before release.';
    const fleetText = Array.isArray(fleet) && fleet.length ? fleet.map((r: any) => '• ' + (r.quantity_needed || 1) + ' ' + (r.vehicle_class || 'Vehicle') + ' — ' + (r.purpose || 'Required for this job')).join('\n') : (estimate.additional_fleet_required ? 'Additional vehicle is required; confirm vehicle class and days.' : 'No additional vehicle has been requested.');

    if (!warehouse) {
      warehouse = await base44.asServiceRole.entities.EnterpriseTask.create({
        title: 'Warehouse review — ' + customer + ' (' + (pkg.name || 'Accepted option') + ')',
        description: 'Customer accepted ' + (pkg.name || 'the selected option') + '. Confirm, reserve, and stage materials; verify any additional vehicle requirement before releasing the job to Scheduling.\n\nJob: ' + jobRef + '\nEstimate: ' + (estimate.estimate_number || 'Pending number') + '\n\nMaterials:\n' + materialText + '\n\nFleet / extra vehicle:\n' + fleetText,
        department: 'Warehouse', assigned_department: 'Warehouse', assigned_role: 'Warehouse Manager', task_type: 'Warehouse', priority: 'High', status: 'New', claim_mode: 'claimable',
        related_job: jid, related_customer: customer, related_record_id: estimate.id, related_module: 'Estimate', related_route: '/admin/estimates/' + estimate.id,
        source_module: 'Accepted Estimate Handoff', source_record_id: key, notes: 'Complete this review to release the scheduling task.'
      });
      await base44.asServiceRole.entities.EnterpriseNotification.create({ notification_id: 'NOTF-WH-' + Date.now(), title: 'Warehouse review required — ' + customer, message: 'An accepted estimate requires material and fleet review before scheduling. Job ' + jobRef + '.', notification_type: 'Operational', priority: 'High', status: 'Sent', recipient_department: 'Warehouse', recipient_role: 'Warehouse Manager', related_task: warehouse.id, related_job: jid, source_module: 'Accepted Estimate Handoff', source_record_id: key + ':warehouse', delivery_methods: ['In-App'] });
    }
    if (!scheduling) {
      scheduling = await base44.asServiceRole.entities.EnterpriseTask.create({
        title: 'Schedule accepted job — ' + customer,
        description: 'Waiting for Warehouse material/fleet release. After release, schedule this job in ServiceTitan (the calendar source of truth) and confirm the assigned vehicle does not conflict with future appointments.\n\nJob: ' + jobRef + '\nScope: ' + (scope.production_days || 0) + ' day(s), ' + (scope.total_estimated_hours || 0) + ' hour(s).\n\nFleet / extra vehicle:\n' + fleetText,
        department: 'Scheduling', assigned_department: 'Scheduling', assigned_role: 'Scheduling', task_type: 'Operational', priority: 'High', status: 'Waiting', claim_mode: 'claimable', dependency_task_ids: [warehouse.id],
        related_job: jid, related_customer: customer, related_record_id: estimate.id, related_module: 'Estimate', related_route: '/calendar',
        source_module: 'Accepted Estimate Handoff', source_record_id: key, notes: 'Use the ServiceTitan schedule; LVC OS displays the synced calendar and resource context.'
      });
    }
    return Response.json({ ok: true, warehouse_task_id: warehouse.id, scheduling_task_id: scheduling.id, already_existed: existing.length > 0 });
  } catch (error: any) { return Response.json({ error: error.message || String(error) }, { status: 500 }); }
});