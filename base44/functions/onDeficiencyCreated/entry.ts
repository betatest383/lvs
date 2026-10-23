import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireInternalAutomationSecret } from '../../shared/securityAuth.ts';

/**
 * Repair Recommendation Engine — Deficiency Created Subscriber (SECURED)
 *
 * Triggered automatically by an entity automation when a new
 * InspectionFinding (deficiency) is created. Runs the full downstream
 * repair recommendation pipeline.
 *
 * SECURITY (Stage 2F Remediation):
 *   - Rejects unauthenticated direct public calls
 *   - Requires authenticated admin/owner OR valid scheduler secret
 *   - Entity automation must provide X-LVC-Internal-Automation-Secret header
 *   - Direct callers must provide scheduler_secret
 *
 * Allowed invocation types:
 *   - Entity automation with scheduler secret (primary path)
 *   - Authenticated admin/owner (manual retry from admin UI)
 */
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const { event, data: finding } = body;

    // ── Authentication: X-LVC-Internal-Automation-Secret header required ──
    // This function is triggered by Base44 entity automation (InspectionFinding created).
    // PLATFORM LIMITATION: Base44 automations pass function_args as the request body
    // and do NOT currently support setting custom HTTP headers. This means the
    // X-LVC-Internal-Automation-Secret header cannot be supplied by the platform's
    // entity-automation trigger. The automation will be rejected until the platform
    // supports custom headers or an alternative secure channel is established.
    const authResult = requireInternalAutomationSecret(req);
    if (authResult.error) {
      console.log('[ON_DEFICIENCY_CREATED] Rejected: authentication failed');
      return authResult.error;
    }

    // Entity automation payload: { event: { type, entity_name, entity_id }, data: {...} }
    if (!finding || !finding.id) {
      return Response.json({ error: 'No finding data in payload' }, { status: 400 });
    }

    const trace = [];
    const jobId = finding.job_id || '';
    const inspectionId = finding.inspection_id || '';

    // Skip non-deficiency findings
    if (finding.is_deficiency === false) {
      return Response.json({ status: 'skipped', reason: 'Finding is not a deficiency', finding_id: finding.id });
    }
    if (finding.include_in_estimate === false) {
      return Response.json({ status: 'skipped', reason: 'Finding excluded from estimate', finding_id: finding.id });
    }
    if (finding.internal_only === true) {
      return Response.json({ status: 'skipped', reason: 'Finding is internal-only', finding_id: finding.id });
    }

    // ─────────────────────────────────────────────
    // 0. If finding has a repair_template_id, load the template and inherit all values
    // ─────────────────────────────────────────────
    let repairTemplate = null;
    if (finding.repair_template_id) {
      try {
        repairTemplate = await base44.asServiceRole.entities.RepairRecommendationTemplate
          .get(finding.repair_template_id)
          .catch(() => null);

        if (repairTemplate) {
          const inheritedData = {};
          if (!finding.deficiency_type && repairTemplate.deficiency_type) {
            inheritedData.deficiency_type = repairTemplate.deficiency_type;
          }
          if (!finding.severity && repairTemplate.severity) {
            inheritedData.severity = repairTemplate.severity;
          }
          if (!finding.customer_facing_explanation) {
            inheritedData.customer_facing_explanation = repairTemplate.customer_facing_recommendation || repairTemplate.customer_summary || '';
          }
          if (!finding.recommended_repair) {
            inheritedData.recommended_repair = repairTemplate.recommended_solution || '';
          }
          if (!finding.internal_notes && repairTemplate.internal_notes) {
            inheritedData.internal_notes = repairTemplate.internal_notes;
          }
          if (repairTemplate.safety_notes && !finding.safety_concern) {
            inheritedData.safety_concern = true;
          }

          if (Object.keys(inheritedData).length > 0) {
            await base44.asServiceRole.entities.InspectionFinding.update(finding.id, inheritedData);
            Object.assign(finding, inheritedData);
          }
        }
      } catch (err) {
        // Non-blocking — continue pipeline even if template loading fails
      }
    }

    const deficiencyType = finding.deficiency_type || repairTemplate?.deficiency_type || '';
    const severity = finding.severity || repairTemplate?.severity || 'moderate';

    if (!deficiencyType) {
      return Response.json({ status: 'skipped', reason: 'No deficiency type (no template and no manual type)', finding_id: finding.id });
    }

    // ─────────────────────────────────────────────
    // 1. Match Repair Recommendation Templates
    // ─────────────────────────────────────────────
    let matchedTemplate = null;
    try {
      const templates = await base44.asServiceRole.entities.RepairRecommendationTemplate.filter({
        template_status: 'active',
        is_active: true,
      });

      matchedTemplate = templates.find(t => {
        if (t.deficiency_type && t.deficiency_type === deficiencyType) return true;
        if (t.finding_keywords) {
          const keywords = t.finding_keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
          const searchText = `${deficiencyType} ${finding.finding_location || ''} ${finding.customer_facing_explanation || ''} ${finding.recommended_repair || ''}`.toLowerCase();
          return keywords.some(k => searchText.includes(k));
        }
        return false;
      });

      trace.push({
        step: 'template_match',
        status: matchedTemplate ? 'matched' : 'no_match',
        template_id: matchedTemplate?.id || null,
        template_name: matchedTemplate?.template_name || null,
      });
    } catch (err) {
      trace.push({ step: 'template_match', status: 'error', error: err.message });
    }

    // ─────────────────────────────────────────────
    // 2. Generate Repair System Recommendations
    // ─────────────────────────────────────────────
    let repairSystemsCreated = 0;
    try {
      const repairResult = await base44.asServiceRole.functions.invoke('generateRepairSystemRecommendations', {
        inspection_id: inspectionId,
        job_id: jobId,
      });
      repairSystemsCreated = repairResult?.repair_systems_created || 0;
      trace.push({ step: 'repair_system_recommendations', status: 'success', count: repairSystemsCreated });
    } catch (err) {
      trace.push({ step: 'repair_system_recommendations', status: 'error', error: err.message });
    }

    // ─────────────────────────────────────────────
    // 3. Generate Estimate Recommendations
    // ─────────────────────────────────────────────
    let estimateRecsCreated = 0;
    try {
      const estResult = await base44.asServiceRole.functions.invoke('generateEstimateRecommendations', {
        inspection_id: inspectionId,
        job_id: jobId,
      });
      estimateRecsCreated = estResult?.recommendations_created || 0;
      trace.push({ step: 'estimate_recommendations', status: 'success', count: estimateRecsCreated });
    } catch (err) {
      trace.push({ step: 'estimate_recommendations', status: 'error', error: err.message });
    }

    // ─────────────────────────────────────────────
    // 4. Mark finding as recommendations_generated
    // ─────────────────────────────────────────────
    try {
      await base44.asServiceRole.entities.InspectionFinding.update(finding.id, {
        recommendations_generated: true,
      });
      trace.push({ step: 'mark_finding', status: 'success' });
    } catch (err) {
      trace.push({ step: 'mark_finding', status: 'error', error: err.message });
    }

    // ─────────────────────────────────────────────
    // 5. Create timeline entry
    // ─────────────────────────────────────────────
    try {
      await base44.asServiceRole.entities.JobActivityLog.create({
        job_id: jobId,
        event_type: 'estimate_created',
        event_label: `Deficiency Created: ${deficiencyType}`,
        event_details: JSON.stringify({
          finding_id: finding.id,
          deficiency_type: deficiencyType,
          severity: severity,
          repair_system: finding.repair_system_type || '',
          source: 'repair_recommendation_engine',
          pipeline: {
            repair_systems_created: repairSystemsCreated,
            estimate_recommendations_created: estimateRecsCreated,
            template_matched: matchedTemplate?.template_name || null,
          },
        }),
        performed_by: 'Repair Recommendation Engine',
        timestamp: new Date().toISOString(),
      });
      trace.push({ step: 'timeline_entry', status: 'success' });
    } catch (err) {
      trace.push({ step: 'timeline_entry', status: 'error', error: err.message });
    }

    // ─────────────────────────────────────────────
    // 6. Notify AI Sales Coach / Operations Manager
    // ─────────────────────────────────────────────
    try {
      const isCritical = severity === 'critical' || severity === 'major';
      const notifId = `NTF-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      await base44.asServiceRole.entities.EnterpriseNotification.create({
        notification_id: notifId,
        title: `New Deficiency: ${deficiencyType}`,
        message: `A new ${severity} deficiency finding has been created for job ${jobId}. The Repair Recommendation Engine has automatically generated ${repairSystemsCreated} repair system recommendation(s) and ${estimateRecsCreated} estimate recommendation(s).${matchedTemplate ? ` Matched template: ${matchedTemplate.template_name}.` : ''}`,
        priority: isCritical ? 'Critical' : 'Medium',
        notification_type: 'System',
        recipient_role: 'Operations Manager',
        source_module: 'repair_recommendation_engine',
        source_record_id: finding.id,
        status: 'Pending',
        delivery_methods: ['In-App'],
      });
      trace.push({ step: 'notification', status: 'success' });
    } catch (err) {
      trace.push({ step: 'notification', status: 'error', error: err.message });
    }

    return Response.json({
      status: 'success',
      finding_id: finding.id,
      deficiency_type: deficiencyType,
      severity: severity,
      matched_template: matchedTemplate?.template_name || null,
      repair_systems_created: repairSystemsCreated,
      estimate_recommendations_created: estimateRecsCreated,
      trace,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}