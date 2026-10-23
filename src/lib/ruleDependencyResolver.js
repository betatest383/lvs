/**
 * Rule Dependency Resolver
 *
 * Resolves the full dependency tree for a LogicRule and provides
 * reverse lookup capabilities ("where used") for any entity.
 *
 * Dependencies flow:
 *   Rule → Questions → Findings → Templates → Services → Materials
 *         → Pricing → Scope → Proposals → Inventory → Warehouse → Fleet
 *         → Scheduling → Presentation → Analytics → AI Coaching
 */

import { base44 } from '@/api/base44Client';

/**
 * Parse JSON safely with fallback
 */
function safeParse(json, fallback) {
  try { return JSON.parse(json || '[]'); } catch { return fallback; }
}

/**
 * Resolve all dependencies for a given rule.
 * Returns a structured dependency tree.
 */
export async function resolveRuleDependencies(rule) {
  if (!rule) return null;

  const tree = {
    rule,
    layers: [],
    impact: {
      questions: 0,
      findings: 0,
      templates: 0,
      services: 0,
      materials: 0,
      pricing: 0,
      scopes: 0,
      proposals: 0,
      inventory: 0,
      warehouse: 0,
      fleet: 0,
      scheduling: 0,
      presentation: 0,
      analytics: 0,
      ai_coaching: 0,
      active_rules: 0,
      historical_jobs: 0,
    },
    conflicts: [],
    broken_refs: [],
  };

  const tasks = [];

  // ── Layer 1: Inspection Questions ──
  tasks.push(
    base44.entities.InspectionQuestion.filter(
      { is_active: true },
      '-sort_order', 200
    ).then(questions => {
      const matching = questions.filter(q => {
        if (rule.output_finding_type && q.finding_type_config === rule.output_finding_type) return true;
        if (rule.category && q.question_category === rule.category) return true;
        if (rule.output_severity && q.severity_config === rule.output_severity) return true;
        return false;
      });
      tree.impact.questions = matching.length;
      tree.layers.push({
        key: 'questions',
        label: 'Inspection Questions',
        icon: 'HelpCircle',
        items: matching.slice(0, 20).map(q => ({
          id: q.id,
          name: q.question_text?.substring(0, 80) || 'Unnamed',
          type: 'InspectionQuestion',
          entity: q,
        })),
        total: matching.length,
      });
    }).catch(() => {})
  );

  // ── Layer 2: Findings (from rule's output_finding_type) ──
  if (rule.output_finding_type) {
    tasks.push(
      base44.entities.InspectionFinding.filter(
        { deficiency_type: rule.output_finding_type },
        '-created_date', 50
      ).then(findings => {
        tree.impact.findings = findings.length;
        tree.layers.push({
          key: 'findings',
          label: 'Deficiency Findings',
          icon: 'AlertTriangle',
          items: findings.slice(0, 15).map(f => ({
            id: f.id,
            name: f.title || f.deficiency_type || 'Finding',
            type: 'InspectionFinding',
            entity: f,
          })),
          total: findings.length,
        });
      }).catch(() => {})
    );
  }

  // ── Layer 3: Repair Recommendation Templates ──
  tasks.push(
    base44.entities.RepairRecommendationTemplate.filter(
      { is_active: true },
      '-sort_order', 200
    ).then(templates => {
      const matching = templates.filter(t => {
        if (rule.output_finding_type && t.deficiency_type === rule.output_finding_type) return true;
        if (rule.category && t.inspection_category === rule.category) return true;
        return false;
      });
      tree.impact.templates = matching.length;
      tree.layers.push({
        key: 'templates',
        label: 'Repair Recommendation Templates',
        icon: 'FileText',
        items: matching.slice(0, 15).map(t => ({
          id: t.id,
          name: t.template_name || 'Template',
          type: 'RepairRecommendationTemplate',
          entity: t,
        })),
        total: matching.length,
      });
    }).catch(() => {})
  );

  // ── Layer 4: Services ──
  tasks.push(
    base44.entities.ServiceCatalog.filter(
      { is_active: true },
      '-service_name', 200
    ).then(services => {
      tree.impact.services = services.length;
      tree.layers.push({
        key: 'services',
        label: 'Services',
        icon: 'Wrench',
        items: services.slice(0, 15).map(s => ({
          id: s.id,
          name: s.service_name || 'Service',
          type: 'ServiceCatalog',
          entity: s,
        })),
        total: services.length,
      });
    }).catch(() => {})
  );

  // ── Layer 5: Materials (from templates default_materials) ──
  tasks.push(
    base44.entities.InventoryMaster.filter(
      { chargeable_material: true, is_active: true },
      '-item_name', 100
    ).then(materials => {
      tree.impact.materials = materials.length;
      tree.layers.push({
        key: 'materials',
        label: 'Materials',
        icon: 'Package',
        items: materials.slice(0, 15).map(m => ({
          id: m.id,
          name: m.item_name || m.sku || 'Material',
          type: 'InventoryMaster',
          entity: m,
        })),
        total: materials.length,
      });
    }).catch(() => {})
  );

  // ── Layer 6: Scope of Work ──
  tasks.push(
    base44.entities.ScopeOfWork.filter(
      { workflow_version: 'v2_package' },
      '-created_date', 50
    ).then(scopes => {
      tree.impact.scopes = scopes.length;
      tree.layers.push({
        key: 'scopes',
        label: 'Scope of Work',
        icon: 'ClipboardList',
        items: scopes.slice(0, 10).map(s => ({
          id: s.id,
          name: `Scope for ${s.customer_name || 'Job'}`,
          type: 'ScopeOfWork',
          entity: s,
        })),
        total: scopes.length,
      });
    }).catch(() => {})
  );

  // ── Layer 7: Estimate Packages (Proposals) ──
  tasks.push(
    base44.entities.EstimatePackage.filter(
      { workflow_version: 'v2_package' },
      '-created_date', 50
    ).then(packages => {
      tree.impact.proposals = packages.length;
      tree.layers.push({
        key: 'proposals',
        label: 'Proposal Packages',
        icon: 'Presentation',
        items: packages.slice(0, 10).map(p => ({
          id: p.id,
          name: p.name || `Package ${p.package_number || ''}`,
          type: 'EstimatePackage',
          entity: p,
        })),
        total: packages.length,
      });
    }).catch(() => {})
  );

  // ── Layer 8: Inventory Reservations ──
  tasks.push(
    base44.entities.InventoryTransaction.filter(
      { transaction_type: 'reserve' },
      '-transaction_date', 50
    ).then(transactions => {
      tree.impact.inventory = transactions.length;
      tree.layers.push({
        key: 'inventory',
        label: 'Inventory Reservations',
        icon: 'Boxes',
        items: transactions.slice(0, 10).map(t => ({
          id: t.id,
          name: `${t.inventory_item_name || 'Item'} — ${t.quantity} ${t.unit_of_measure || ''}`,
          type: 'InventoryTransaction',
          entity: t,
        })),
        total: transactions.length,
      });
    }).catch(() => {})
  );

  // ── Layer 9: Warehouse ──
  tasks.push(
    base44.entities.WarehouseLocation.filter(
      { is_active: true },
      '-sort_order', 50
    ).then(locations => {
      tree.impact.warehouse = locations.length;
      tree.layers.push({
        key: 'warehouse',
        label: 'Warehouse Locations',
        icon: 'Warehouse',
        items: locations.slice(0, 10).map(l => ({
          id: l.id,
          name: l.name || 'Location',
          type: 'WarehouseLocation',
          entity: l,
        })),
        total: locations.length,
      });
    }).catch(() => {})
  );

  // ── Layer 10: Fleet ──
  tasks.push(
    base44.entities.TruckProfile.filter(
      {},
      '-created_date', 50
    ).then(trucks => {
      tree.impact.fleet = trucks.length;
      tree.layers.push({
        key: 'fleet',
        label: 'Fleet',
        icon: 'Truck',
        items: trucks.slice(0, 10).map(t => ({
          id: t.id,
          name: t.truck_number || t.name || 'Truck',
          type: 'TruckProfile',
          entity: t,
        })),
        total: trucks.length,
      });
    }).catch(() => {})
  );

  // ── Layer 11: Scheduling (Jobs) ──
  tasks.push(
    base44.entities.Job.filter(
      {},
      '-created_date', 50
    ).then(jobs => {
      tree.impact.historical_jobs = jobs.length;
      tree.impact.scheduling = jobs.filter(j => j.status === 'scheduled' || j.status === 'assigned').length;
      tree.layers.push({
        key: 'scheduling',
        label: 'Scheduling / Jobs',
        icon: 'CalendarClock',
        items: jobs.slice(0, 10).map(j => ({
          id: j.id,
          name: `${j.customer_name || 'Customer'} — ${j.service_date || ''}`,
          type: 'Job',
          entity: j,
        })),
        total: jobs.length,
      });
    }).catch(() => {})
  );

  // ── Layer 12: Customer Presentations ──
  tasks.push(
    base44.entities.CustomerPresentation.filter(
      {},
      '-created_date', 20
    ).then(presentations => {
      tree.impact.presentation = presentations.length;
      tree.layers.push({
        key: 'presentation',
        label: 'Customer Presentations',
        icon: 'MonitorPlay',
        items: presentations.slice(0, 10).map(p => ({
          id: p.id,
          name: `Presentation for ${p.customer_name || 'Customer'}`,
          type: 'CustomerPresentation',
          entity: p,
        })),
        total: presentations.length,
      });
    }).catch(() => {})
  );

  // ── Layer 13: Analytics (Job Activity Logs) ──
  tasks.push(
    base44.entities.JobActivityLog.filter(
      {},
      '-timestamp', 20
    ).then(logs => {
      tree.impact.analytics = logs.length;
      tree.layers.push({
        key: 'analytics',
        label: 'Analytics / Activity Log',
        icon: 'BarChart3',
        items: logs.slice(0, 10).map(l => ({
          id: l.id,
          name: `${l.event_label || l.event_type} — ${l.customer_name || ''}`,
          type: 'JobActivityLog',
          entity: l,
        })),
        total: logs.length,
      });
    }).catch(() => {})
  );

  // ── Active Rules (siblings) ──
  tasks.push(
    base44.entities.LogicRule.filter(
      { rule_type: 'automation', is_active: true },
      '-priority', 200
    ).then(allRules => {
      tree.impact.active_rules = allRules.length;

      // Detect conflicts: same source_module + trigger_event
      const conflicts = allRules.filter(r =>
        r.id !== rule.id &&
        r.source_module === rule.source_module &&
        r.trigger_event === rule.trigger_event
      );
      tree.conflicts = conflicts.map(r => ({
        id: r.id,
        name: r.rule_name,
        priority: r.priority || 0,
        conflict_type: 'same_trigger',
      }));
    }).catch(() => {})
  );

  // ── Run logs for this rule (for "most triggered" data) ──
  tasks.push(
    base44.entities.AutomationRunLog.filter(
      { rule_id: rule.id, log_type: 'rule_run' },
      '-created_date', 50
    ).then(logs => {
      tree.run_history = {
        total_runs: logs.length,
        successful: logs.filter(l => l.status === 'success').length,
        failed: logs.filter(l => l.status === 'failed' || l.status === 'error').length,
        avg_duration: logs.length > 0
          ? Math.round(logs.reduce((sum, l) => sum + (l.duration_ms || 0), 0) / logs.length)
          : 0,
        last_run: logs[0]?.created_date || null,
      };
    }).catch(() => {
      tree.run_history = { total_runs: 0, successful: 0, failed: 0, avg_duration: 0, last_run: null };
    })
  );

  await Promise.all(tasks);

  // Order layers
  const layerOrder = [
    'questions', 'findings', 'templates', 'services', 'materials',
    'pricing', 'scopes', 'proposals', 'inventory', 'warehouse',
    'fleet', 'scheduling', 'presentation', 'analytics', 'ai_coaching',
  ];
  tree.layers.sort((a, b) => layerOrder.indexOf(a.key) - layerOrder.indexOf(b.key));

  return tree;
}

/**
 * Reverse lookup: for a given entity, find all rules that reference it.
 */
export async function reverseLookupRules(entityType, entityId) {
  const rules = await base44.entities.LogicRule.filter(
    { rule_type: 'automation', is_active: true },
    '-priority', 500
  );

  const matches = [];

  for (const rule of rules) {
    const actions = safeParse(rule.actions_json, []);
    const conditions = safeParse(rule.conditions_json, []);

    // Check if any action field_mapping references this entity
    for (const action of actions) {
      const mappings = action.field_mappings || [];
      for (const m of mappings) {
        if (m.value === entityId || m.value === entityType) {
          matches.push({
            rule,
            match_type: 'action_field',
            action_key: action.action_key,
            field: m.field,
          });
        }
      }
    }

    // Check output_repair_id
    if (rule.output_repair_id === entityId) {
      matches.push({
        rule,
        match_type: 'output_repair',
      });
    }
  }

  return matches;
}

/**
 * Detect conflicting rules (same trigger, same priority).
 */
export async function detectRuleConflicts() {
  const rules = await base44.entities.LogicRule.filter(
    { rule_type: 'automation', is_active: true },
    '-priority', 500
  );

  const conflicts = [];
  const grouped = {};

  for (const rule of rules) {
    const key = `${rule.source_module}::${rule.trigger_event}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(rule);
  }

  for (const [key, group] of Object.entries(grouped)) {
    if (group.length < 2) continue;
    // Check for same-priority conflicts
    const byPriority = {};
    for (const r of group) {
      const p = r.priority || 0;
      if (!byPriority[p]) byPriority[p] = [];
      byPriority[p].push(r);
    }
    for (const [priority, samePriority] of Object.entries(byPriority)) {
      if (samePriority.length > 1) {
        conflicts.push({
          type: 'same_priority',
          source_module: group[0].source_module,
          trigger_event: group[0].trigger_event,
          priority: Number(priority),
          rules: samePriority.map(r => ({ id: r.id, name: r.rule_name })),
        });
      }
    }
  }

  return conflicts;
}