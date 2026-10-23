import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ─── Capability-based permissions ───
const WAREHOUSE_CAPABILITIES = {
  admin: '*',
  owner: '*',
  director_of_operations: '*',
  operations_manager: '*',
  warehouse_manager: '*',
  inventory_specialist: '*',
  warehouse_associate: ['warehouse.setup.view', 'warehouse.material.assign', 'warehouse.inventory.count', 'warehouse.ai.use'],
};
const DRAFT_PREVIEW_ROLES = ['admin', 'owner', 'director_of_operations', 'operations_manager'];
const COST_VISIBLE_ROLES = ['admin', 'owner', 'director_of_operations', 'operations_manager'];
const OPENING_BALANCE_APPROVAL_ROLE_KEYS = new Set(['owner', 'director_of_operations']);
function canApproveOpeningBalance(roleKey) {
  return OPENING_BALANCE_APPROVAL_ROLE_KEYS.has(roleKey);
}

function hasCapability(roleKey, capability) {
  const caps = WAREHOUSE_CAPABILITIES[roleKey];
  if (!caps) return false;
  if (caps === '*') return true;
  return caps.includes(capability);
}

const VALID_ACTIONS = [
  'explain_step', 'review_work', 'suggest_bin',
  'explain_discrepancy', 'what_am_i_missing', 'ask_question',
];

const STEP_KEYS = ['select_warehouse', 'select_or_add_bins', 'stock_and_count', 'review_exceptions', 'review', 'activate'];

function normalizeRole(raw) {
  if (!raw) return '';
  return String(raw).trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

async function resolveUserRole(base44, user) {
  if (user.role === 'admin') return 'admin';
  const employees = await base44.asServiceRole.entities.EmployeeRegistry.filter({
    $or: [{ email: user.email }, { login_email: user.email }],
  });
  const employee = employees[0];
  if (!employee) return normalizeRole(user.role) || 'user';
  const rawRole = normalizeRole(employee.primary_role || '');
  if (!WAREHOUSE_CAPABILITIES[rawRole] && employee.primary_role) {
    try {
      const roles = await base44.asServiceRole.entities.RoleRegistry.filter({
        $or: [{ role_key: rawRole }, { role_name: employee.primary_role }, { role_id: employee.primary_role }],
      });
      if (roles[0]?.role_key) return normalizeRole(roles[0].role_key);
    } catch {}
  }
  return rawRole;
}

function sanitizeInput(str) {
  if (!str) return '';
  return String(str).replace(/```/g, '').replace(/<[^>]*>/g, '').substring(0, 500);
}

// ═════════════════════════════════════════════════════════════════
// SESSION-SCOPED DATA LOADING — server-side, never trusts browser
// ═════════════════════════════════════════════════════════════════
async function loadSessionContext(base44, session, roleKey) {
  const assignedIds = session.assigned_item_ids || [];
  const noMaterials = session.no_materials_confirmed;
  const whId = session.warehouse_location_id;

  // ── Load only session-assigned materials ──
  const assignedItems = assignedIds.length > 0
    ? await base44.asServiceRole.entities.InventoryMaster.filter({ id: { $in: assignedIds } }, null, 200)
    : [];

  // ── Load only bins belonging to the session warehouse ──
  const sessionBins = whId
    ? await base44.asServiceRole.entities.BinLocation.filter({ warehouse_location_id: whId, is_active: { $ne: false } }, null, 500)
    : [];

  // ── Parse counts from session ──
  let counts = {};
  try { counts = session.count_data_json ? JSON.parse(session.count_data_json) : {}; } catch {}

  const countedEntries = Object.entries(counts).filter(([, v]) =>
    v?.count !== undefined && v?.count !== '' && v?.count !== null
  );
  const countedIds = new Set(countedEntries.map(([id]) => id));

  // ── Compute metrics ──
  const missingCountIds = assignedIds.filter(id => !countedIds.has(id));
  const zeroCountItems = countedEntries.filter(([, v]) => Number(v.count) === 0).map(([id]) => {
    const item = assignedItems.find(i => i.id === id);
    return { id, name: item?.item_name || 'Unknown', sku: item?.sku || '' };
  });

  const binsById = new Map(sessionBins.map(b => [b.id, b]));
  const missingBinItems = [];
  const crossWarehouseItems = [];
  const notStockedItems = [];

  for (const item of assignedItems) {
    if (!item.bin_location_id) {
      missingBinItems.push({ id: item.id, name: item.item_name, sku: item.sku || '', reason: 'No bin assigned' });
    } else {
      const bin = binsById.get(item.bin_location_id);
      if (!bin) {
        missingBinItems.push({ id: item.id, name: item.item_name, sku: item.sku || '', reason: 'Referenced bin no longer exists' });
      } else if (whId && bin.warehouse_location_id !== whId) {
        crossWarehouseItems.push({ id: item.id, name: item.item_name, sku: item.sku || '', bin_code: bin.bin_code, bin_warehouse: bin.warehouse_location_name || '' });
      }
    }
    if (!item.is_stocked_inventory_item && !noMaterials) {
      notStockedItems.push({ id: item.id, name: item.item_name, sku: item.sku || '' });
    }
  }

  const totalQty = countedEntries.reduce((sum, [, v]) => sum + Number(v.count || 0), 0);
  const canSeeCosts = COST_VISIBLE_ROLES.includes(roleKey);
  let totalValue = 0;

  // ── Build safe item summaries (cost only for oversight roles) ──
  const itemSummaries = assignedItems.map(item => {
    const count = counts[item.id];
    const countVal = count?.count !== undefined && count?.count !== '' && count?.count !== null ? Number(count.count) : null;
    if (canSeeCosts && countVal !== null) totalValue += countVal * (item.unit_cost || 0);
    return {
      id: item.id,
      name: item.item_name,
      sku: item.sku || '',
      type: item.inventory_type,
      category: item.category || '',
      manufacturer: item.manufacturer || '',
      vendor: item.vendor || '',
      bin_location: item.bin_location || '',
      bin_location_id: item.bin_location_id || '',
      has_bin: !!item.bin_location_id,
      counted: countedIds.has(item.id),
      count_value: countVal,
      is_zero_count: countVal === 0,
      is_stocked_inventory_item: item.is_stocked_inventory_item,
      ...(canSeeCosts ? { unit_cost: item.unit_cost || 0 } : {}),
    };
  });

  // ── Counted-but-unassigned items (count exists for an item not in assigned_item_ids) ──
  const assignedIdSet = new Set(assignedIds);
  const orphanCounts = countedEntries.filter(([id]) => !assignedIdSet.has(id)).map(([id]) => {
    const item = assignedItems.find(i => i.id === id);
    return { id, name: item?.item_name || 'Unknown item' };
  });

  return {
    metrics: {
      session_id: session.session_id,
      session_status: session.status,
      warehouse_name: session.warehouse_location_name || 'Not selected',
      warehouse_id: whId || null,
      assigned_count: noMaterials ? 0 : assignedIds.length,
      counted_count: countedEntries.length,
      missing_count_count: missingCountIds.length,
      missing_count_ids: missingCountIds,
      zero_count_count: zeroCountItems.length,
      zero_count_items: zeroCountItems,
      missing_bin_count: missingBinItems.length,
      missing_bin_items: missingBinItems,
      cross_warehouse_count: crossWarehouseItems.length,
      cross_warehouse_items: crossWarehouseItems,
      not_stocked_count: notStockedItems.length,
      not_stocked_items: notStockedItems,
      orphan_count_count: orphanCounts.length,
      orphan_count_items: orphanCounts,
      total_quantity: totalQty,
      total_value: canSeeCosts ? Math.round(totalValue * 100) / 100 : null,
      evidence_count: (session.evidence_urls || []).length,
      no_materials_confirmed: noMaterials,
      submitted_by: session.submitted_by || null,
      submitted_at: session.submitted_at || null,
      approved_by: session.approved_by || null,
      approved_at: session.approved_at || null,
      activated_by: session.activated_by || null,
      server_total_items: session.server_total_items ?? null,
      server_total_quantity: session.server_total_quantity ?? null,
      server_total_value: session.server_total_value ?? null,
      return_count: session.return_count || 0,
      current_step: session.current_step ?? null,
    },
    items: itemSummaries,
    bins: sessionBins.map(b => ({
      id: b.id,
      code: b.bin_code,
      warehouse_name: b.warehouse_location_name || '',
      designation: b.designation || null,
    })),
    counts: Object.fromEntries(countedEntries),
  };
}

// ═════════════════════════════════════════════════════════════════
// ACTION-SPECIFIC PROMPT BUILDERS
// ═════════════════════════════════════════════════════════════════
function buildActionPrompt(action, stepName, sessionCtx, targetItem, safeQuestion, guideMode) {
  const m = sessionCtx?.metrics || {};
  const fallbackNote = guideMode === 'general_fallback'
    ? '\n\nIMPORTANT: No approved company training guide exists. Provide general warehouse inventory best practices. Do not reference specific company procedures.'
    : '';

  const baseRules = `You are the AI Warehouse Assistant for Lehigh Valley Chimney. You provide guidance ONLY — you never take actions.

STRICT RULES — you must NEVER:
1. Enter or change quantities
2. Create locations or bins automatically
3. Approve or activate sessions
4. Grant permissions or reveal inaccessible Owner/Admin functions
5. Use bins from another warehouse
6. Use archived or prior-session data
7. Invent company policy when no approved guide exists

You MAY:
- Explain steps and procedures
- Identify missing information and blockers
- Recommend existing bins (only from the session warehouse's bin list)
- Flag discrepancies and cross-warehouse issues
- Suggest escalation when needed

All suggestions require explicit user confirmation. You do not perform any mutations.${fallbackNote}`;

  const ctxStr = sessionCtx ? `\n\nSESSION CONTEXT (server-loaded, session-scoped):\n${JSON.stringify(sessionCtx.metrics, null, 2)}\n\nASSIGNED ITEMS (${sessionCtx.items.length}):\n${JSON.stringify(sessionCtx.items.slice(0, 30), null, 2)}\n\nAVAILABLE BINS (session warehouse only, ${sessionCtx.bins.length}):\n${JSON.stringify(sessionCtx.bins.slice(0, 30), null, 2)}` : '\n\nSESSION CONTEXT: No session loaded.';

  switch (action) {
    case 'explain_step':
      return `${baseRules}\n\nSTEP: ${stepName}\n${ctxStr}\n\nACTION: Explain this wizard step. Cover: what to accomplish, why it matters, what physical warehouse work should occur, which fields are required, what must be completed before continuing, common mistakes to avoid, and what happens after saving. Use short, operational instructions.`;

    case 'review_work':
      return `${baseRules}\n\nSTEP: ${stepName}\n${ctxStr}\n\nACTION: Review the work completed in this session. Report: completed work, remaining work, invalid assignments, missing bin locations, missing physical counts, zero-count items, missing photos when evidence is required, items not marked as stocked inventory, and anything blocking Review or Activation. Categorize each issue as severity "info", "required", or "blocker". For each issue, provide a fix_action. Remember: quantity 0 is a valid completed count and must NOT be treated as missing.`;

    case 'suggest_bin':
      return `${baseRules}\n\nSTEP: ${stepName}\n${ctxStr}\n\n${targetItem ? `TARGET ITEM:\n${JSON.stringify({ id: targetItem.id, name: targetItem.item_name, type: targetItem.inventory_type, category: targetItem.category, manufacturer: targetItem.manufacturer, vendor: targetItem.vendor, sku: targetItem.sku }, null, 2)}` : 'TARGET ITEM: None specified — suggest bins for all items missing bin assignments.'}\n\nACTION: Recommend the most appropriate existing bin from the session warehouse only. Never suggest a bin from another warehouse. Provide: recommended_bin (bin code), reason, alternatives (array of {bin_code, reason}), and any capacity or compatibility warnings. You must NOT assign or move the item — only recommend.`;

    case 'explain_discrepancy':
      return `${baseRules}\n\nSTEP: ${stepName}\n${ctxStr}\n\nACTION: Explain any discrepancies in this session. For each: system quantity (if known), physical quantity (counted), variance, current warehouse, current bin, expected warehouse/bin, possible causes, required next action, and whether Owner or Operations approval is required. Do NOT change any quantities to eliminate a discrepancy.`;

    case 'what_am_i_missing':
      return `${baseRules}\n\nSTEP: ${stepName}\n${ctxStr}\n\nACTION: Return a session-specific checklist. Check for: warehouse not selected, no active bin exists, item missing valid session bin, count not entered, count exists for an unassigned item, item assigned to another warehouse, required photo missing, duplicate count entry, exception unresolved, employee confirmation missing, Owner approval pending. Do NOT return global catalog counts. For each checklist item, set status to "complete", "incomplete", or "warning".`;

    case 'ask_question':
      return `${baseRules}\n\nSTEP: ${stepName}\n${ctxStr}\n\nACTION: Answer this question: "${safeQuestion}". Base your answer on the current session data and approved warehouse procedures. If no approved instruction exists, say so explicitly and suggest requesting help. Do not invent company policy.`;

    default:
      return `${baseRules}\n\nSTEP: ${stepName}\n${ctxStr}\n\nACTION: Provide guidance for this step.`;
  }
}

const FLEXIBLE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    explanation: { type: 'string', description: 'Clear explanation or answer' },
    suggestions: { type: 'array', items: { type: 'string' }, description: 'Actionable suggestions requiring user confirmation' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Potential issues or warnings' },
    nextAction: { type: 'string', description: 'Recommended next action' },
    escalation_needed: { type: 'boolean', description: 'True if employee should escalate to supervisor' },
    has_approved_guidance: { type: 'boolean', description: 'True if approved company guidance was used' },
    completed_work: { type: 'array', items: { type: 'string' }, description: 'Work that has been completed' },
    remaining_work: { type: 'array', items: { type: 'string' }, description: 'Work that remains' },
    issues: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, severity: { type: 'string', description: 'info, required, or blocker' }, item: { type: 'string' }, detail: { type: 'string' }, fix_action: { type: 'string' } } }, description: 'Issues found during review' },
    blockers: { type: 'array', items: { type: 'string' }, description: 'Items that block review or activation' },
    recommended_bin: { type: 'string', description: 'Recommended bin code' },
    reason: { type: 'string', description: 'Reason for the bin recommendation' },
    alternatives: { type: 'array', items: { type: 'object', properties: { bin_code: { type: 'string' }, reason: { type: 'string' } } }, description: 'Alternative valid bins' },
    checklist: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, status: { type: 'string', description: 'complete, incomplete, or warning' }, detail: { type: 'string' } } }, description: 'Session-specific checklist' },
  },
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, session_id, step, step_index, step_name, inventory_master_id, question } = body;

    // ─── Reject caller-supplied identity fields ───
    const spoofedFields = ['email', 'role', 'user_email', 'user_role', 'employee_id', 'role_id', 'user', 'auth_email', 'auth_role'];
    const attemptedSpoof = spoofedFields.filter(f => body[f] !== undefined);
    if (attemptedSpoof.length > 0) {
      console.log(`[BYPASS AUDIT] user=${user.email} action=warehouse_ai_${action} IGNORED caller-supplied identity fields: ${attemptedSpoof.join(', ')}`);
    }

    const roleKey = await resolveUserRole(base44, user);

    // ─── Capability enforcement ───
    if (!hasCapability(roleKey, 'warehouse.ai.use')) {
      console.log(`[BYPASS AUDIT] DENIED user=${user.email} role=${roleKey} action=warehouse_ai_${action}`);
      return Response.json({ error: 'You do not have permission to use the Warehouse Setup Assistant.' }, { status: 403 });
    }

    if (!VALID_ACTIONS.includes(action)) {
      return Response.json({ error: 'Invalid action: ' + action }, { status: 400 });
    }

    // ─── Resolve step ───
    const stepIdx = step_index !== undefined ? step_index : STEP_KEYS.indexOf(step);
    const stepName = step_name || STEP_KEYS[stepIdx] || `Step ${stepIdx}`;

    // ─── Load session by ID + verify access ───
    // Try .get() for entity ID first, then fall back to filter by session_id string
    let session = null;
    let sessionCtx = null;
    if (session_id) {
      try {
        session = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
      } catch {
        const sessions = await base44.asServiceRole.entities.InventoryCountSession.filter(
          { session_id }, null, 1
        );
        session = sessions[0];
      }
      if (!session) return Response.json({ error: 'Session not found or access denied' }, { status: 404 });

      // ─── Access check: session owner, oversight role, or authorized
      // opening-balance approver (Owner/Director). This ensures approvers
      // can view and analyze an awaiting_review session via the AI assistant.
      // Does NOT rely on session.started_by alone — resolves the authenticated
      // user's role server-side through EmployeeRegistry → RoleRegistry. ───
      const isOwner = session.started_by === user.email || session.assigned_to === user.email;
      const isOversight = ['admin', 'owner', 'director_of_operations', 'operations_manager'].includes(roleKey);
      const isApprover = canApproveOpeningBalance(roleKey);
      if (!isOwner && !isOversight && !isApprover) {
        console.log(`[BYPASS AUDIT] DENIED user=${user.email} role=${roleKey} action=unauthorized_session_access session=${session_id}`);
        return Response.json({ error: 'Access denied. You do not have access to this session.' }, { status: 403 });
      }

      // ─── Load session-scoped context (server-side) ───
      sessionCtx = await loadSessionContext(base44, session, roleKey);
    }

    // ─── Load training guide TRN-000002 ───
    const guides = await base44.asServiceRole.entities.TrainingRegistry.filter({ training_number: 'TRN-000002' }, null, 1);
    const guide = guides[0];
    const isPublished = guide && guide.status === 'Published';
    const canUseDraftPreview = DRAFT_PREVIEW_ROLES.includes(roleKey);
    let guideMode;
    if (isPublished) guideMode = 'published';
    else if (canUseDraftPreview) guideMode = 'draft_preview';
    else guideMode = 'general_fallback';

    // ─── Load target item for suggest_bin ───
    let targetItem = null;
    if (inventory_master_id && action === 'suggest_bin') {
      const items = await base44.asServiceRole.entities.InventoryMaster.filter({ id: inventory_master_id }, null, 1);
      targetItem = items[0];
    }

    const safeQuestion = sanitizeInput(question);

    // ─── Build LLM prompt ───
    const systemPrompt = buildActionPrompt(action, stepName, sessionCtx, targetItem, safeQuestion, guideMode);

    // ─── Call the LLM ───
    const llmResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: systemPrompt,
      response_json_schema: FLEXIBLE_RESPONSE_SCHEMA,
    });

    // ─── Validate suggested bins (only from session warehouse) ───
    let binValidation = null;
    if (action === 'suggest_bin' && sessionCtx?.bins?.length > 0) {
      const binCodes = new Set(sessionCtx.bins.map(b => b.code).filter(Boolean));
      const allText = ((llmResponse.alternatives || []).map(a => a.bin_code || '').join(' ') + ' ' + (llmResponse.recommended_bin || '') + ' ' + (llmResponse.suggestions || []).join(' ')).toUpperCase();
      const mentioned = allText.match(/[A-Z0-9][-A-Z0-9:]{2,}/g) || [];
      const nonexistent = [...new Set(mentioned.filter(code => !binCodes.has(code) && code.length > 3))];
      if (nonexistent.length > 0) {
        binValidation = {
          warning: 'AI suggested a bin code that does not exist in the session warehouse. Please select from available bins only.',
          invalid_codes: nonexistent.slice(0, 5),
        };
        if (!llmResponse.warnings) llmResponse.warnings = [];
        llmResponse.warnings.push(binValidation.warning);
      }
    }

    // ─── Determine response category ───
    let responseCategory = 'guidance';
    if (action === 'suggest_bin') responseCategory = 'bin_recommendation';
    else if (action === 'explain_discrepancy') responseCategory = 'variance_explanation';
    else if (action === 'what_am_i_missing') responseCategory = 'gap_analysis';
    else if (action === 'review_work') responseCategory = 'review';
    else if (llmResponse.escalation_needed) responseCategory = 'escalation';

    // ─── Record AI interaction in session history ───
    if (session) {
      const auditEntry = `\n[AI ${action}] user=${user.email} step=${stepName} ts=${new Date().toISOString()} category=${responseCategory} escalation=${llmResponse.escalation_needed || false}${safeQuestion ? ` q="${safeQuestion.substring(0, 80)}"` : ''}${targetItem ? ` item=${targetItem.item_name}` : ''}`;
      try {
        await base44.asServiceRole.entities.InventoryCountSession.update(session.id, {
          notes: (session.notes || '') + auditEntry,
        });
      } catch (e) {
        console.error(`[AI AUDIT] Failed to record interaction: ${e.message}`);
      }
    }

    // ─── Log to AutomationRunLog ───
    await base44.asServiceRole.entities.AutomationRunLog.create({
      log_id: `LOG-AI-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      log_type: 'event',
      source_module: 'warehouse_setup_ai',
      source_module_name: 'Warehouse Setup AI Assistant',
      trigger_event: `ai_${action}`,
      trigger_event_name: `${action} — ${stepName}`,
      status: 'success',
      employee: user.email,
      related_record_id: session?.id || null,
      conditions_evaluated_json: JSON.stringify({
        role: roleKey,
        guide_mode: guideMode,
        guide_number: guideMode === 'general_fallback' ? null : (guide?.training_number || null),
        step: stepName,
        session_status: sessionCtx?.metrics?.session_status || null,
      }),
      actions_executed_json: JSON.stringify({
        action,
        response_category: responseCategory,
        escalation_needed: llmResponse.escalation_needed || false,
        bin_validation: binValidation,
        suggestion_count: (llmResponse.suggestions || []).length,
        warning_count: (llmResponse.warnings || []).length,
        issue_count: (llmResponse.issues || []).length,
        checklist_count: (llmResponse.checklist || []).length,
      }),
      triggered_by: user.email,
    });

    const guideStatusLabel = guideMode === 'published'
      ? 'Published (authoritative)'
      : guideMode === 'draft_preview'
      ? 'Draft Preview (testing only)'
      : 'No approved guide — general best practices';

    return Response.json({
      success: true,
      authoritative: isPublished,
      guide_mode: guideMode,
      guide_number: guideMode === 'general_fallback' ? null : (guide?.training_number || null),
      guide_version: guideMode === 'general_fallback' ? null : (guide?.version || null),
      guide_status: guide?.status || 'not_found',
      step_used: stepIdx,
      step_name: stepName,
      response: llmResponse,
      response_category: responseCategory,
      bin_validation: binValidation,
      session_context_summary: sessionCtx?.metrics || null,
      escalation_available: true,
      confirmation_required: true,
      draft_preview_notice: guideMode === 'draft_preview'
        ? 'Draft Guide Preview — guidance is for testing only and not authoritative.'
        : null,
      fallback_notice: guideMode === 'general_fallback'
        ? 'No approved company guide exists yet. Showing general warehouse best practices.'
        : null,
      guide_status_label: guideStatusLabel,
      ai_safety_notice: 'AI guidance only. All actions require your explicit confirmation. The AI cannot create, edit, approve, or activate anything on your behalf.',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});