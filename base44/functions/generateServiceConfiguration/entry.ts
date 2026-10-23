import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { service_catalog_id, quantity = 1, job_id, measurements } = body;

    if (!service_catalog_id) {
      return Response.json({ error: 'service_catalog_id is required' }, { status: 400 });
    }

    const service = await base44.asServiceRole.entities.ServiceCatalog.get(service_catalog_id);
    if (!service) {
      return Response.json({ error: 'Service not found' }, { status: 404 });
    }

    const parseJSON = (str, fallback) => {
      if (!str) return fallback;
      if (typeof str === 'object') return str;
      try { return JSON.parse(str); } catch { return fallback; }
    };

    const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

    const qty = Math.max(1, Number(quantity) || 1);
    const defaultMaterials = parseJSON(service.default_materials, []);
    const laborPhases = parseJSON(service.labor_phases, []);
    const requiredEquipment = parseJSON(service.required_equipment, []);
    const optionalEquipment = parseJSON(service.optional_equipment, []);
    const scopeTemplate = parseJSON(service.scope_of_work_template, {});

    // --- Pricing ---
    const sellingPrice = (service.default_selling_price || 0) * qty;
    const internalCost = (service.internal_cost || 0) * qty;
    const grossProfit = sellingPrice - internalCost;
    const grossMargin = sellingPrice > 0 ? (grossProfit / sellingPrice) * 100 : 0;
    const membershipPrice = (service.membership_price || 0) * qty;

    // --- Labor ---
    const estimatedHours = (((service.estimated_time_hours || 0) * 60 + (service.estimated_time_minutes || 0)) / 60) * qty;
    const crewSize = service.crew_size_required || 1;

    // --- Materials ---
    const chargeableMaterials = defaultMaterials.filter(m => m.chargeable_to_customer !== false);
    const internalMaterials = defaultMaterials.filter(m => m.chargeable_to_customer === false);
    const chargeableMaterialsTotal = chargeableMaterials.reduce(
      (sum, m) => sum + (m.unit_price || 0) * (m.quantity || 1) * qty, 0
    );
    const internalMaterialsTotal = internalMaterials.reduce(
      (sum, m) => sum + (m.unit_price || 0) * (m.quantity || 1) * qty, 0
    );

    // --- Commissions ---
    let serviceCommission = 0;
    if (service.service_commission_type === 'percentage') {
      serviceCommission = (sellingPrice * (service.service_commission_value || 0)) / 100;
    } else if (service.service_commission_type === 'flat_dollar') {
      serviceCommission = (service.service_commission_value || 0) * qty;
    }

    let materialCommission = 0;
    if (service.material_commission_type === 'percentage') {
      materialCommission = (chargeableMaterialsTotal * (service.material_commission_value || 0)) / 100;
    } else if (service.material_commission_type === 'flat_dollar') {
      materialCommission = (service.material_commission_value || 0) * qty;
    }

    // --- Scope of Work ---
    const workPhases = (scopeTemplate.work_phases || laborPhases || []).map(phase => ({
      ...phase,
      estimated_hours: round2((phase.estimated_hours || 0) * qty),
      materials: (phase.materials || []).map(m => ({ ...m, quantity: (m.quantity || 1) * qty })),
    }));

    const scopeOfWork = {
      work_phases: workPhases,
      safety_notes: scopeTemplate.safety_notes || [],
      cleanup_tasks: scopeTemplate.cleanup_tasks || [],
      internal_notes: scopeTemplate.internal_notes || service.internal_notes || '',
    };

    // --- Proposal Data ---
    const proposalData = {
      tier: service.proposal_tier || 'standalone',
      customer_benefits: service.proposal_customer_benefits || '',
      warranty_messaging: service.proposal_warranty_messaging || '',
      estimated_duration: service.proposal_estimated_duration || '',
      financing_available: service.proposal_financing_available || false,
    };

    // --- Customer Description ---
    const customerDescription = service.customer_description || service.description || '';

    // --- Total Item Price ---
    const totalItemPrice = sellingPrice + chargeableMaterialsTotal;

    const configuration = {
      service_catalog_id: service.id,
      service_name: service.service_name,
      service_code: service.service_code,
      service_description: service.description || '',
      quantity: qty,
      pricing: {
        selling_price: round2(sellingPrice),
        internal_cost: round2(internalCost),
        gross_profit: round2(grossProfit),
        gross_margin: round2(grossMargin),
        membership_price: round2(membershipPrice),
        default_discount_percent: service.default_discount_percent || 0,
      },
      labor: {
        estimated_hours: round2(estimatedHours),
        estimated_time_hours: Math.floor(estimatedHours),
        estimated_time_minutes: Math.round((estimatedHours % 1) * 60),
        crew_size: crewSize,
        labor_phases: workPhases.length > 0 ? workPhases : [{
          phase_name: service.service_name,
          estimated_hours: round2(estimatedHours),
          tasks: [],
        }],
      },
      materials: {
        default: chargeableMaterials.map(m => ({ ...m, quantity: (m.quantity || 1) * qty })),
        optional: parseJSON(service.optional_materials, []),
        internal: internalMaterials.map(m => ({ ...m, quantity: (m.quantity || 1) * qty })),
        chargeable_total: round2(chargeableMaterialsTotal),
        internal_total: round2(internalMaterialsTotal),
      },
      equipment: {
        required: requiredEquipment.map(e => ({ ...e, quantity: (e.quantity || 1) * qty })),
        optional: optionalEquipment,
        truck_requirements: service.truck_requirements || '',
      },
      scope_of_work: scopeOfWork,
      proposal_data: proposalData,
      commissions: {
        service_commission: round2(serviceCommission),
        material_commission: round2(materialCommission),
        total_commission: round2(serviceCommission + materialCommission),
        service_commission_type: service.service_commission_type,
        service_commission_value: service.service_commission_value,
        material_commission_type: service.material_commission_type,
        material_commission_value: service.material_commission_value,
      },
      customer_description: customerDescription,
      total_item_price: round2(totalItemPrice),
    };

    return Response.json({ status: 'success', configuration });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});