import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ═══════════════════════════════════════════════════════════════════════════
// SUGGEST TASK SETUP — Advisory AI panel for task creation
//
// Accepts a natural-language description and returns suggested task
// configuration based on PUBLISHED templates only.
//
// SAFEGUARDS:
// - Does NOT save anything — advisory only
// - Only recommends Published/Approved templates
// - Never enables Assisted/Enforced orchestration mode
// - Never interrupts employees or grants permissions
// - Requires explicit "Apply Suggestions" to use any recommendation
// ═══════════════════════════════════════════════════════════════════════════

function normalizeRole(raw) {
  if (!raw) return '';
  return String(raw).trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

async function resolveEmployee(base44, user) {
  const employees = await base44.asServiceRole.entities.EmployeeRegistry.filter({
    $or: [{ email: user.email }, { login_email: user.email }, { linked_user_id: user.id }],
  }, null, 5);
  const emp = employees[0];
  let roleKey = normalizeRole(user.role);
  if (emp?.primary_role && emp.primary_role.startsWith('ROLE-')) {
    try {
      const roles = await base44.asServiceRole.entities.RoleRegistry.filter({ role_id: emp.primary_role }, null, 1);
      if (roles[0]) roleKey = roles[0].role_key || normalizeRole(roles[0].role_name || '');
    } catch {}
  }
  return { employee: emp, roleKey };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { description, department, customer_name, job_info } = body;

    if (!description || !description.trim()) {
      return Response.json({ error: 'description is required' }, { status: 400 });
    }

    const { roleKey } = await resolveEmployee(base44, user);

    // ─── Load PUBLISHED templates only ───
    const publishedTemplates = await base44.asServiceRole.entities.TaskTemplate.filter({
      status: { $in: ['Published', 'Approved'] },
      data_classification: { $ne: 'archived' },
    }, '-updated_date', 50);

    // If no published templates, load all non-archived for reference but flag them
    const allTemplates = publishedTemplates.length > 0 ? publishedTemplates : [];

    if (allTemplates.length === 0) {
      return Response.json({
        success: true,
        suggestions: {
          suggested_template: null,
          warning: 'No published templates available. Templates must be approved and published before AI can recommend them for production use.',
          work_category: 'routine',
          priority: 'Medium',
          assignment_mode: 'specific_employee',
          execution_mode: 'simple_action',
          confidence: 0,
          explanation: 'No published templates found. Please create and publish templates first.',
          missing_information: ['Published task templates'],
        },
        published_template_count: 0,
      });
    }

    // ─── Build template catalog for LLM context ───
    const templateCatalog = allTemplates.map(t => ({
      id: t.id,
      number: t.template_number,
      name: t.template_name,
      description: t.description || '',
      department: t.department_name_snapshot || '',
      work_category: t.work_category || 'routine',
      priority: t.default_priority || 'Medium',
      assignment_mode: t.assignment_mode || 'specific_employee',
      execution_mode: t.execution_mode || 'simple_action',
      keywords: t.template_key || '',
      trigger_type: t.trigger_type || 'manual',
    }));

    // ─── Call LLM for suggestion ───
    const llmResponse = await base44.integrations.Core.InvokeLLM({
      prompt: `You are an advisory task setup assistant for a chimney service company (Lehigh Valley Chimney).

Given a natural-language task description, analyze it and suggest the best task configuration.

AVAILABLE PUBLISHED TEMPLATES (only these may be recommended for production use):
${JSON.stringify(templateCatalog, null, 2)}

TASK DESCRIPTION: "${description}"
DEPARTMENT: ${department || 'Not specified'}
CUSTOMER: ${customer_name || 'Not specified'}
JOB INFO: ${job_info || 'Not specified'}

Return a JSON object with:
{
  "suggested_template_id": "ID from catalog above, or null if none fit",
  "suggested_template_name": "name or null",
  "work_category": "one of: critical, operational_interruption, high_priority, scheduled_primary, routine, busy_work",
  "priority": "one of: Critical, High, Medium, Low",
  "assignment_mode": "one of: specific_employee, multiple_employees, role_queue, department_queue, eligibility_engine, manager_selects",
  "execution_mode": "one of: simple_action, checklist, guided_task, form, workflow, wizard, automated, linked_module",
  "due_time_recommendation": "ISO duration or null (e.g. PT2H for 2 hours)",
  "acknowledgment_recommendation": boolean,
  "explanation": "plain-language explanation of the recommendation",
  "confidence": 0-100,
  "missing_information": ["list of missing details that would improve the suggestion"]
}

Rules:
- ONLY recommend templates from the published catalog above
- If no template fits, set suggested_template_id to null and explain why
- Never recommend Draft, In Review, or Archived templates
- Confidence should reflect how well the description matches a template
- This is advisory only — the user must explicitly apply suggestions`,
      response_json_schema: {
        type: 'object',
        properties: {
          suggested_template_id: { type: 'string' },
          suggested_template_name: { type: 'string' },
          work_category: { type: 'string' },
          priority: { type: 'string' },
          assignment_mode: { type: 'string' },
          execution_mode: { type: 'string' },
          due_time_recommendation: { type: 'string' },
          acknowledgment_recommendation: { type: 'boolean' },
          explanation: { type: 'string' },
          confidence: { type: 'number' },
          missing_information: { type: 'array', items: { type: 'string' } },
        },
      },
    });

    // ─── Validate LLM response against published templates ───
    const suggestedId = llmResponse.suggested_template_id;
    const validatedTemplate = suggestedId
      ? allTemplates.find(t => t.id === suggestedId)
      : null;

    if (suggestedId && !validatedTemplate) {
      // LLM hallucinated a template ID — reject it
      llmResponse.suggested_template_id = null;
      llmResponse.suggested_template_name = null;
      llmResponse.explanation = 'WARNING: AI suggested a template not in the published catalog. Suggestion rejected. ' + llmResponse.explanation;
      llmResponse.confidence = 0;
    }

    // ─── Record the suggestion (audit only, no save) ───
    try {
      await base44.asServiceRole.entities.AutomationRunLog.create({
        log_id: 'AI-SUG-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        log_type: 'event',
        source_module: 'suggest_task_setup',
        trigger_event: 'ai_suggestion_generated',
        status: 'received',
        conditions_met: true,
        event_payload_json: JSON.stringify({
          description: description.substring(0, 500),
          department,
          suggested_template_id: validatedTemplate?.id || null,
          suggested_template_name: validatedTemplate?.template_name || null,
          confidence: llmResponse.confidence,
          user: user.email,
        }),
        triggered_by: user.email,
      });
    } catch {}

    return Response.json({
      success: true,
      suggestions: {
        ...llmResponse,
        suggested_template: validatedTemplate ? {
          id: validatedTemplate.id,
          template_number: validatedTemplate.template_number,
          template_name: validatedTemplate.template_name,
          status: validatedTemplate.status,
          version: validatedTemplate.version,
        } : null,
      },
      published_template_count: allTemplates.length,
      advisory_only: true,
      requires_apply: true,
    });
  } catch (error) {
    console.error('[SUGGEST TASK SETUP ERROR]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});