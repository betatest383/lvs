import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const ADMIN_ROLES = ['admin', 'owner'];
const UPLOAD_ROLES = [...ADMIN_ROLES, 'warehouse_manager', 'warehouse_associate'];
const CLASSIFY_ROLES = [...ADMIN_ROLES, 'warehouse_manager'];
const REVIEW_ROLES = [...ADMIN_ROLES];

const VALID_TRANSITIONS = {
  'Draft': ['Pending Classification', 'Pending Review', 'Archived'],
  'Pending Classification': ['Pending Review', 'Draft', 'Archived'],
  'Pending Review': ['Approved', 'Rejected', 'Draft'],
  'Approved': ['Published', 'Pending Review', 'Archived'],
  'Published': ['Archived'],
  'Rejected': ['Draft', 'Archived'],
  'Archived': ['Draft'],
};

function appendAudit(existing, action, userEmail, details) {
  let history = [];
  try { history = JSON.parse(existing || '[]'); } catch (e) { history = []; }
  history.push({ action, user: userEmail || 'system', timestamp: new Date().toISOString(), details: details || '' });
  return JSON.stringify(history);
}

async function generateResourceNumber(base44) {
  const latest = await base44.asServiceRole.entities.ProductResource.filter({}, '-resource_number', 1);
  let nextNum = 1;
  if (latest && latest.length > 0 && latest[0].resource_number) {
    const match = String(latest[0].resource_number).match(/RES-(\d+)/);
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }
  return 'RES-' + String(nextNum).padStart(6, '0');
}

function checkRole(userRole, allowedRoles) {
  return allowedRoles.includes(userRole);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;
    const userEmail = user.email || user.id;
    const userRole = user.role || 'user';

    // ── CREATE ──
    if (action === 'create') {
      if (!checkRole(userRole, UPLOAD_ROLES)) {
        return Response.json({ error: 'Insufficient permissions to upload resources' }, { status: 403 });
      }
      const resource_number = await generateResourceNumber(base44);
      const { title, description, resource_type, file_url, file_name, file_type, file_size,
              manufacturer, manufacturer_id, product_line, product_model, appliance_type,
              fuel_type, category, tags, source_provider, source_metadata, notes } = body;

      const data = {
        resource_number,
        title: title || file_name || 'Untitled Resource',
        description: description || '',
        resource_type: resource_type || 'Manual',
        file_url: file_url || '',
        file_name: file_name || '',
        file_type: file_type || '',
        file_size: file_size || 0,
        manufacturer: manufacturer || '',
        manufacturer_id: manufacturer_id || '',
        product_line: product_line || '',
        product_model: product_model || '',
        appliance_type: appliance_type || '',
        fuel_type: fuel_type || '',
        category: category || '',
        tags: tags || [],
        source_provider: source_provider || 'manual_upload',
        source_metadata: source_metadata || '',
        status: 'Draft',
        is_active: true,
        version: 1,
        audit_history: appendAudit(null, 'created', userEmail, 'Resource created via ' + (source_provider || 'manual_upload')),
        notes: notes || '',
      };
      const resource = await base44.asServiceRole.entities.ProductResource.create(data);
      return Response.json({ success: true, resource });
    }

    // ── UPDATE ──
    if (action === 'update') {
      const { resource_id, fields } = body;
      const existing = await base44.asServiceRole.entities.ProductResource.get(resource_id);
      if (!existing) return Response.json({ error: 'Resource not found' }, { status: 404 });

      if (!checkRole(userRole, UPLOAD_ROLES)) {
        return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
      }

      const updateData = { ...fields };
      updateData.audit_history = appendAudit(existing.audit_history, 'updated', userEmail, 'Resource fields updated');

      const resource = await base44.asServiceRole.entities.ProductResource.update(resource_id, updateData);
      return Response.json({ success: true, resource });
    }

    // ── GET ──
    if (action === 'get') {
      const { resource_id } = body;
      const resource = await base44.asServiceRole.entities.ProductResource.get(resource_id);
      if (!resource) return Response.json({ error: 'Resource not found' }, { status: 404 });
      return Response.json({ success: true, resource });
    }

    // ── LIST ──
    if (action === 'list') {
      const { search, status, resource_type, manufacturer, source_provider, limit } = body;
      const query = {};
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { manufacturer: { $regex: search, $options: 'i' } },
          { product_model: { $regex: search, $options: 'i' } },
          { tags: { $regex: search, $options: 'i' } },
        ];
      }
      if (status) query.status = status;
      if (resource_type) query.resource_type = resource_type;
      if (manufacturer) query.manufacturer = manufacturer;
      if (source_provider) query.source_provider = source_provider;

      const resources = await base44.asServiceRole.entities.ProductResource.filter(query, '-created_date', limit || 200);
      return Response.json({ success: true, resources });
    }

    // ── STATS (dashboard) ──
    if (action === 'stats') {
      const all = await base44.asServiceRole.entities.ProductResource.filter({}, '-created_date', 500);
      const byStatus = {};
      const byType = {};
      const byManufacturer = {};
      for (const r of all) {
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        byType[r.resource_type] = (byType[r.resource_type] || 0) + 1;
        if (r.manufacturer) byManufacturer[r.manufacturer] = (byManufacturer[r.manufacturer] || 0) + 1;
      }
      return Response.json({
        success: true,
        stats: {
          total: all.length,
          byStatus,
          byType,
          byManufacturer,
          pendingReview: all.filter(r => r.status === 'Pending Review').length,
          pendingClassification: all.filter(r => r.status === 'Pending Classification').length,
          published: all.filter(r => r.status === 'Published').length,
          draft: all.filter(r => r.status === 'Draft').length,
          recentUploads: all.slice(0, 5),
        },
      });
    }

    // ── CLASSIFY (AI) ──
    if (action === 'classify') {
      const { resource_id } = body;
      if (!checkRole(userRole, CLASSIFY_ROLES)) {
        return Response.json({ error: 'Insufficient permissions to classify resources' }, { status: 403 });
      }
      const resource = await base44.asServiceRole.entities.ProductResource.get(resource_id);
      if (!resource) return Response.json({ error: 'Resource not found' }, { status: 404 });

      const fileUrls = resource.file_url ? [resource.file_url] : undefined;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a product resource classifier for a chimney and fireplace service company (Lehigh Valley Chimney).
Classify the following resource based on its metadata${fileUrls ? ' and the attached file content' : ''}.

Resource metadata:
- Title: ${resource.title}
- Description: ${resource.description || 'N/A'}
- File name: ${resource.file_name || 'N/A'}
- File type: ${resource.file_type || 'N/A'}
- Current manufacturer guess: ${resource.manufacturer || 'N/A'}
- Product line: ${resource.product_line || 'N/A'}
- Product model: ${resource.product_model || 'N/A'}

Provide your classification as JSON with these fields:
- resource_type: one of [Manual, Brochure, Image, Parts Diagram, Video, Spec Sheet, Warranty Document, Installation Guide, Service Guide, Other]
- manufacturer: the manufacturer name (refined if needed, or empty string if unknown)
- appliance_type: one of [Fireplace, Stove, Insert, Liner, Chimney Cap, Chimney System, Boiler, Furnace, Water Heater, Other, ""] or empty string if unknown
- fuel_type: one of [Gas, Wood, Pellet, Coal, Oil, Electric, Multi-Fuel, ""] or empty string if unknown
- tags: array of 3-8 relevant search tags
- confidence: your confidence score as a number 0-100
- notes: brief classification notes or reasoning`,
        response_json_schema: {
          type: 'object',
          properties: {
            resource_type: { type: 'string' },
            manufacturer: { type: 'string' },
            appliance_type: { type: 'string' },
            fuel_type: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            confidence: { type: 'number' },
            notes: { type: 'string' },
          },
        },
        ...(fileUrls ? { file_urls: fileUrls } : {}),
      });

      const classificationData = JSON.stringify(response);
      const updateData = {
        status: 'Pending Review',
        classification_data: classificationData,
        classification_confidence: response.confidence || 0,
        classified_by: userEmail,
        classified_at: new Date().toISOString(),
        resource_type: response.resource_type || resource.resource_type,
        manufacturer: response.manufacturer || resource.manufacturer,
        appliance_type: response.appliance_type || resource.appliance_type,
        fuel_type: response.fuel_type || resource.fuel_type,
        tags: response.tags || resource.tags,
        audit_history: appendAudit(resource.audit_history, 'classified', userEmail, 'AI classification: ' + (response.confidence || 0) + '% confidence'),
      };
      const updated = await base44.asServiceRole.entities.ProductResource.update(resource_id, updateData);
      return Response.json({ success: true, resource: updated, classification: response });
    }

    // ── AI ASSIST ──
    if (action === 'ai_assist') {
      const { question, resource_id } = body;
      let context = '';
      if (resource_id) {
        const resource = await base44.asServiceRole.entities.ProductResource.get(resource_id);
        if (resource) {
          context = `Current resource context:\n- Title: ${resource.title}\n- Description: ${resource.description || 'N/A'}\n- Manufacturer: ${resource.manufacturer || 'N/A'}\n- Resource Type: ${resource.resource_type}\n- Status: ${resource.status}\n- Appliance Type: ${resource.appliance_type || 'N/A'}\n- Fuel Type: ${resource.fuel_type || 'N/A'}\n- Tags: ${(resource.tags || []).join(', ')}`;
        }
      }
      const answer = await base44.integrations.Core.InvokeLLM({
        prompt: `You are an AI assistant for Lehigh Valley Chimney's Product Resource Management system. You help with resource classification, linking recommendations, and general product questions.

${context ? context + '\n\n' : ''}User question: ${question}

Provide a helpful, concise answer. If suggesting classifications or linkings, be specific about which entities to link (manufacturers, services, inventory items, repair templates, training guides, SOPs, inspection questions).`,
      });
      return Response.json({ success: true, answer });
    }

    // ── SUBMIT FOR REVIEW ──
    if (action === 'submit_for_review') {
      const { resource_id } = body;
      const resource = await base44.asServiceRole.entities.ProductResource.get(resource_id);
      if (!resource) return Response.json({ error: 'Resource not found' }, { status: 404 });
      if (!VALID_TRANSITIONS[resource.status]?.includes('Pending Review')) {
        return Response.json({ error: 'Cannot submit for review from status: ' + resource.status }, { status: 400 });
      }
      const updated = await base44.asServiceRole.entities.ProductResource.update(resource_id, {
        status: 'Pending Review',
        submitted_by: userEmail,
        submitted_at: new Date().toISOString(),
        audit_history: appendAudit(resource.audit_history, 'submitted_for_review', userEmail, 'Resource submitted for review'),
      });
      return Response.json({ success: true, resource: updated });
    }

    // ── APPROVE ──
    if (action === 'approve') {
      const { resource_id, review_notes } = body;
      if (!checkRole(userRole, REVIEW_ROLES)) {
        return Response.json({ error: 'Insufficient permissions to approve resources' }, { status: 403 });
      }
      const resource = await base44.asServiceRole.entities.ProductResource.get(resource_id);
      if (!resource) return Response.json({ error: 'Resource not found' }, { status: 404 });
      if (!VALID_TRANSITIONS[resource.status]?.includes('Approved')) {
        return Response.json({ error: 'Cannot approve from status: ' + resource.status }, { status: 400 });
      }
      const updated = await base44.asServiceRole.entities.ProductResource.update(resource_id, {
        status: 'Approved',
        reviewed_by: userEmail,
        reviewed_at: new Date().toISOString(),
        approved_by: userEmail,
        approved_at: new Date().toISOString(),
        review_notes: review_notes || resource.review_notes || '',
        audit_history: appendAudit(resource.audit_history, 'approved', userEmail, review_notes || 'Resource approved'),
      });
      return Response.json({ success: true, resource: updated });
    }

    // ── REJECT ──
    if (action === 'reject') {
      const { resource_id, rejection_reason } = body;
      if (!checkRole(userRole, REVIEW_ROLES)) {
        return Response.json({ error: 'Insufficient permissions to reject resources' }, { status: 403 });
      }
      const resource = await base44.asServiceRole.entities.ProductResource.get(resource_id);
      if (!resource) return Response.json({ error: 'Resource not found' }, { status: 404 });
      if (!VALID_TRANSITIONS[resource.status]?.includes('Rejected')) {
        return Response.json({ error: 'Cannot reject from status: ' + resource.status }, { status: 400 });
      }
      const updated = await base44.asServiceRole.entities.ProductResource.update(resource_id, {
        status: 'Rejected',
        reviewed_by: userEmail,
        reviewed_at: new Date().toISOString(),
        rejected_by: userEmail,
        rejected_at: new Date().toISOString(),
        rejection_reason: rejection_reason || '',
        audit_history: appendAudit(resource.audit_history, 'rejected', userEmail, rejection_reason || 'Resource rejected'),
      });
      return Response.json({ success: true, resource: updated });
    }

    // ── PUBLISH ──
    if (action === 'publish') {
      const { resource_id } = body;
      if (!checkRole(userRole, REVIEW_ROLES)) {
        return Response.json({ error: 'Insufficient permissions to publish resources' }, { status: 403 });
      }
      const resource = await base44.asServiceRole.entities.ProductResource.get(resource_id);
      if (!resource) return Response.json({ error: 'Resource not found' }, { status: 404 });
      if (!VALID_TRANSITIONS[resource.status]?.includes('Published')) {
        return Response.json({ error: 'Cannot publish from status: ' + resource.status }, { status: 400 });
      }
      const updated = await base44.asServiceRole.entities.ProductResource.update(resource_id, {
        status: 'Published',
        published_by: userEmail,
        published_at: new Date().toISOString(),
        audit_history: appendAudit(resource.audit_history, 'published', userEmail, 'Resource published to library'),
      });
      return Response.json({ success: true, resource: updated });
    }

    // ── ARCHIVE ──
    if (action === 'archive') {
      const { resource_id, archived_reason } = body;
      if (!checkRole(userRole, REVIEW_ROLES)) {
        return Response.json({ error: 'Insufficient permissions to archive resources' }, { status: 403 });
      }
      const resource = await base44.asServiceRole.entities.ProductResource.get(resource_id);
      if (!resource) return Response.json({ error: 'Resource not found' }, { status: 404 });
      if (!VALID_TRANSITIONS[resource.status]?.includes('Archived')) {
        return Response.json({ error: 'Cannot archive from status: ' + resource.status }, { status: 400 });
      }
      const updated = await base44.asServiceRole.entities.ProductResource.update(resource_id, {
        status: 'Archived',
        archived_by: userEmail,
        archived_at: new Date().toISOString(),
        archived_reason: archived_reason || '',
        audit_history: appendAudit(resource.audit_history, 'archived', userEmail, archived_reason || 'Resource archived'),
      });
      return Response.json({ success: true, resource: updated });
    }

    // ── ADD LINK (atomic: appends entity_id to correct relationship field) ──
    if (action === 'add_link') {
      const { resource_id, entity_type, entity_id } = body;
      if (!resource_id || !entity_type || !entity_id) {
        return Response.json({ error: 'resource_id, entity_type, and entity_id are required' }, { status: 400 });
      }
      if (!checkRole(userRole, UPLOAD_ROLES)) {
        return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
      const ADD_LINK_FIELD_MAP = {
        Manufacturer: { field: 'linked_manufacturer_id', isSingle: true },
        InventoryMaster: { field: 'linked_inventory_ids', isSingle: false },
        ServiceCatalog: { field: 'linked_service_ids', isSingle: false },
        RepairRecommendationTemplate: { field: 'linked_repair_template_ids', isSingle: false },
        TrainingRegistry: { field: 'linked_training_ids', isSingle: false },
        SopRegistry: { field: 'linked_sop_ids', isSingle: false },
        InspectionQuestion: { field: 'linked_inspection_question_ids', isSingle: false },
      };
      const config = ADD_LINK_FIELD_MAP[entity_type];
      if (!config) return Response.json({ error: 'Unknown entity type' }, { status: 400 });

      const resource = await base44.asServiceRole.entities.ProductResource.get(resource_id);
      if (!resource) return Response.json({ error: 'Resource not found' }, { status: 404 });

      const field = config.field;
      let alreadyLinked = false;
      const updateData = {};

      if (config.isSingle) {
        if (resource[field] === entity_id) {
          alreadyLinked = true;
        } else {
          updateData[field] = entity_id;
        }
      } else {
        const current = Array.isArray(resource[field]) ? [...resource[field]] : [];
        if (current.includes(entity_id)) {
          alreadyLinked = true;
        } else {
          current.push(entity_id);
          updateData[field] = current;
        }
      }

      if (alreadyLinked) {
        return Response.json({ success: true, linked: true, already_linked: true, resource });
      }

      updateData.audit_history = appendAudit(resource.audit_history, 'linked', userEmail,
        'Linked to ' + entity_type + ':' + entity_id);
      const updated = await base44.asServiceRole.entities.ProductResource.update(resource_id, updateData);
      return Response.json({ success: true, linked: true, already_linked: false, resource: updated });
    }

    // ── REMOVE LINK (atomic: removes entity_id from correct relationship field) ──
    if (action === 'remove_link') {
      const { resource_id, entity_type, entity_id } = body;
      if (!resource_id || !entity_type || !entity_id) {
        return Response.json({ error: 'resource_id, entity_type, and entity_id are required' }, { status: 400 });
      }
      if (!checkRole(userRole, UPLOAD_ROLES)) {
        return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
      const REMOVE_LINK_FIELD_MAP = {
        Manufacturer: { field: 'linked_manufacturer_id', isSingle: true },
        InventoryMaster: { field: 'linked_inventory_ids', isSingle: false },
        ServiceCatalog: { field: 'linked_service_ids', isSingle: false },
        RepairRecommendationTemplate: { field: 'linked_repair_template_ids', isSingle: false },
        TrainingRegistry: { field: 'linked_training_ids', isSingle: false },
        SopRegistry: { field: 'linked_sop_ids', isSingle: false },
        InspectionQuestion: { field: 'linked_inspection_question_ids', isSingle: false },
      };
      const config = REMOVE_LINK_FIELD_MAP[entity_type];
      if (!config) return Response.json({ error: 'Unknown entity type' }, { status: 400 });

      const resource = await base44.asServiceRole.entities.ProductResource.get(resource_id);
      if (!resource) return Response.json({ error: 'Resource not found' }, { status: 404 });

      const field = config.field;
      const updateData = {};
      let wasLinked = false;

      if (config.isSingle) {
        if (resource[field] === entity_id) {
          wasLinked = true;
          updateData[field] = '';
        }
      } else {
        const current = Array.isArray(resource[field]) ? [...resource[field]] : [];
        if (current.includes(entity_id)) {
          wasLinked = true;
          updateData[field] = current.filter((id) => id !== entity_id);
        }
      }

      if (!wasLinked) {
        return Response.json({ success: true, linked: false, already_linked: false, resource });
      }

      updateData.audit_history = appendAudit(resource.audit_history, 'unlinked', userEmail,
        'Unlinked from ' + entity_type + ':' + entity_id);
      const updated = await base44.asServiceRole.entities.ProductResource.update(resource_id, updateData);
      return Response.json({ success: true, linked: false, already_linked: false, resource: updated });
    }

    // ── LINK ──
    if (action === 'link') {
      const { resource_id, linked_manufacturer_id, linked_service_ids, linked_inventory_ids,
              linked_repair_template_ids, linked_training_ids, linked_sop_ids, linked_inspection_question_ids } = body;
      if (!checkRole(userRole, UPLOAD_ROLES)) {
        return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
      const resource = await base44.asServiceRole.entities.ProductResource.get(resource_id);
      if (!resource) return Response.json({ error: 'Resource not found' }, { status: 404 });

      const updateData = { audit_history: appendAudit(resource.audit_history, 'linked', userEmail, 'Resource links updated') };
      if (linked_manufacturer_id !== undefined) updateData.linked_manufacturer_id = linked_manufacturer_id;
      if (linked_service_ids !== undefined) updateData.linked_service_ids = linked_service_ids;
      if (linked_inventory_ids !== undefined) updateData.linked_inventory_ids = linked_inventory_ids;
      if (linked_repair_template_ids !== undefined) updateData.linked_repair_template_ids = linked_repair_template_ids;
      if (linked_training_ids !== undefined) updateData.linked_training_ids = linked_training_ids;
      if (linked_sop_ids !== undefined) updateData.linked_sop_ids = linked_sop_ids;
      if (linked_inspection_question_ids !== undefined) updateData.linked_inspection_question_ids = linked_inspection_question_ids;

      const updated = await base44.asServiceRole.entities.ProductResource.update(resource_id, updateData);
      return Response.json({ success: true, resource: updated });
    }

    // ── SEARCH ENTITIES (for relationship pickers) ──
    if (action === 'search_entities') {
      const { entity_type, search, limit } = body;
      const SEARCH_CONFIG = {
        Manufacturer: { nameKey: 'name', subKey: 'manufacturer_id', searchFields: ['name', 'manufacturer_id'] },
        InventoryMaster: { nameKey: 'item_name', subKey: 'sku', searchFields: ['item_name', 'sku', 'manufacturer', 'description'] },
        ServiceCatalog: { nameKey: 'service_name', subKey: 'service_code', searchFields: ['service_name', 'service_code', 'description'] },
        RepairRecommendationTemplate: { nameKey: 'template_name', subKey: 'deficiency_type', searchFields: ['template_name', 'deficiency_type', 'customer_facing_recommendation'] },
        TrainingRegistry: { nameKey: 'title', subKey: 'training_number', searchFields: ['title', 'training_name', 'description'] },
        SopRegistry: { nameKey: 'title', subKey: 'sop_id', searchFields: ['title', 'sop_id', 'description'] },
        InspectionQuestion: { nameKey: 'question_text', subKey: 'category', searchFields: ['question_text', 'category'] },
      };
      const config = SEARCH_CONFIG[entity_type];
      if (!config) return Response.json({ error: 'Unknown entity type' }, { status: 400 });

      const query = {};
      if (search && search.trim()) {
        query.$or = config.searchFields.map((field) => ({ [field]: { $regex: search.trim(), $options: 'i' } }));
      }

      const results = await base44.asServiceRole.entities[entity_type].filter(query, '-updated_date', limit || 20);
      const mapped = results.map((r) => ({
        id: r.id,
        name: r[config.nameKey] || 'Untitled',
        sub: r[config.subKey] || '',
      }));
      return Response.json({ success: true, results: mapped });
    }

    // ── RESOLVE LINKS (get display names for linked record IDs) ──
    if (action === 'resolve_links') {
      const { resource_id } = body;
      const resource = await base44.asServiceRole.entities.ProductResource.get(resource_id);
      if (!resource) return Response.json({ error: 'Resource not found' }, { status: 404 });

      const LINK_CONFIG = {
        linked_manufacturer_id: { entity: 'Manufacturer', nameKey: 'name', subKey: 'manufacturer_id', isSingle: true, key: 'manufacturer' },
        linked_inventory_ids: { entity: 'InventoryMaster', nameKey: 'item_name', subKey: 'sku', key: 'inventory' },
        linked_service_ids: { entity: 'ServiceCatalog', nameKey: 'service_name', subKey: 'service_code', key: 'service' },
        linked_repair_template_ids: { entity: 'RepairRecommendationTemplate', nameKey: 'template_name', subKey: '', key: 'repair_template' },
        linked_training_ids: { entity: 'TrainingRegistry', nameKey: 'title', subKey: 'training_number', key: 'training' },
        linked_sop_ids: { entity: 'SopRegistry', nameKey: 'title', subKey: 'sop_id', key: 'sop' },
        linked_inspection_question_ids: { entity: 'InspectionQuestion', nameKey: 'question_text', subKey: 'category', key: 'inspection_question' },
      };

      const resolved = {};
      for (const [field, config] of Object.entries(LINK_CONFIG)) {
        const ids = config.isSingle
          ? (resource[field] ? [resource[field]] : [])
          : (Array.isArray(resource[field]) ? resource[field] : []);
        if (ids.length === 0) continue;

        const records = await Promise.all(
          ids.map((id) => base44.asServiceRole.entities[config.entity].get(id).catch(() => null))
        );
        resolved[config.key] = records
          .filter((r) => r !== null)
          .map((r) => ({
            id: r.id,
            name: r[config.nameKey] || 'Untitled',
            sub: config.subKey ? (r[config.subKey] || '') : '',
          }));
      }
      return Response.json({ success: true, resolved });
    }

    // ── GET RELATED RESOURCES (bidirectional: find resources linked to an entity) ──
    if (action === 'get_related_resources') {
      const { entity_type, entity_id } = body;
      const LINK_FIELD_MAP = {
        Manufacturer: 'linked_manufacturer_id',
        InventoryMaster: 'linked_inventory_ids',
        ServiceCatalog: 'linked_service_ids',
        RepairRecommendationTemplate: 'linked_repair_template_ids',
        TrainingRegistry: 'linked_training_ids',
        SopRegistry: 'linked_sop_ids',
        InspectionQuestion: 'linked_inspection_question_ids',
      };
      const field = LINK_FIELD_MAP[entity_type];
      if (!field) return Response.json({ error: 'Unknown entity type' }, { status: 400 });

      const query = {};
      query[field] = entity_id;

      const resources = await base44.asServiceRole.entities.ProductResource.filter(query, '-updated_date', 200);
      const visible = ADMIN_ROLES.includes(userRole)
        ? resources.filter((r) => r.is_active !== false)
        : resources.filter((r) => r.is_active !== false && ['Published', 'Approved'].includes(r.status));
      return Response.json({ success: true, resources: visible });
    }

    return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});