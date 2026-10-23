export const REPAIR_SYSTEMS = {
  crown: {
    type: 'crown',
    label: 'Crown System',
    title: 'Cast-in-Place Concrete Crown Replacement',
    deficiencyTypes: [
      'cracked_crown',
      'spalling_crown',
      'crown_wash_failure',
      'missing_drip_edge',
      'water_entry_crown',
      'deteriorated_crown',
    ],
    requiredMeasurements: ['crown_area', 'crown_diameter'],
    codeReferences: 'NFPA 211 §14.2 — Crown weather protection',
    summary:
      'The chimney crown is cracked, deteriorated, or missing key weather-shedding features, allowing water infiltration into the chimney structure.',
    explanation:
      'The chimney crown is the concrete or mortar cap that seals the top of the chimney and sheds water away from the flue. Cracks, spalling, or a deteriorated crown wash allow water to penetrate the chimney, which can cause interior damage, spalling brick, and freeze-thaw damage. Multiple deficiencies have been identified across the crown system that should be addressed as a unified repair.',
    defaultOptions: [
      {
        tier: 'good',
        label: 'Crown Sealant Application',
        pricebook_item_name: 'Crown Sealant Application',
        unit_price: 350,
        unit: 'ea',
        customer_description:
          'Apply high-temperature crown sealant to fill cracks in the existing chimney crown, preventing water infiltration.',
      },
      {
        tier: 'better',
        label: 'Crown Wash Repair & Waterproof Seal',
        pricebook_item_name: 'Crown Wash Repair & Seal',
        unit_price: 850,
        unit: 'ea',
        customer_description:
          'Repair deteriorated crown wash mortar and apply waterproof sealant with drip edge installation.',
      },
      {
        tier: 'best',
        label: 'Cast-in-Place Concrete Crown Replacement',
        pricebook_item_name: 'Cast-in-Place Concrete Crown Replacement',
        unit_price: 1850,
        unit: 'ea',
        customer_description:
          'Remove the existing deteriorated crown and pour a new reinforced cast-in-place concrete crown with proper drip edge and weatherproofing.',
      },
    ],
  },
  masonry: {
    type: 'masonry',
    label: 'Masonry System',
    title: 'Chimney Masonry Restoration',
    deficiencyTypes: [
      'missing_mortar_joints',
      'spalling_brick',
      'loose_brick',
      'leaning_chimney',
      'water_intrusion',
      'cracked_bricks',
      'deteriorated_mortar',
    ],
    requiredMeasurements: ['linear_feet', 'brick_count', 'chimney_height'],
    codeReferences: 'NFPA 211 §14.4 — Masonry requirements',
    summary:
      'The chimney masonry is deteriorated with missing mortar, spalling or loose brick, or structural concerns requiring restoration.',
    explanation:
      'The brick and mortar of your chimney are exposed to harsh weather conditions year-round. Over time, mortar joints erode, bricks spall or loosen, and water intrusion can compromise the structural integrity. The identified deficiencies indicate that masonry restoration is needed to prevent further deterioration and potential safety hazards.',
    defaultOptions: [
      {
        tier: 'good',
        label: 'Tuckpointing — Mortar Joint Repair',
        pricebook_item_name: 'Tuckpointing (per linear foot)',
        unit_price: 25,
        unit: 'lf',
        customer_description:
          'Grind out deteriorated mortar joints and repoint with new Type N mortar to restore structural integrity.',
      },
      {
        tier: 'better',
        label: 'Partial Chimney Rebuild',
        pricebook_item_name: 'Partial Chimney Rebuild',
        unit_price: 2800,
        unit: 'ea',
        customer_description:
          'Remove and replace deteriorated brick sections above the roofline, including tuckpointing of remaining joints.',
      },
      {
        tier: 'best',
        label: 'Full Chimney Rebuild (Above Roofline)',
        pricebook_item_name: 'Full Chimney Rebuild',
        unit_price: 5500,
        unit: 'ea',
        customer_description:
          'Tear down and rebuild the entire chimney above the roofline with new brick, mortar, and crown.',
      },
    ],
  },
  liner: {
    type: 'liner',
    label: 'Liner System',
    title: 'Stainless Steel Liner System',
    deficiencyTypes: [
      'cracked_clay_liner',
      'missing_flue_mortar',
      'improper_sizing',
      'unsafe_venting',
      'damaged_liner',
      'gaps_flue_tiles',
      'deteriorated_flue',
    ],
    requiredMeasurements: ['flue_height', 'flue_diameter', 'appliance_btu'],
    codeReferences: 'NFPA 211 §14.9 — Flue lining requirements',
    summary:
      'The flue liner is cracked, deteriorated, or improperly sized, creating unsafe venting conditions for combustion appliances.',
    explanation:
      'The flue liner protects the chimney structure from heat and combustion byproducts. Cracked tiles, missing mortar, or improper sizing can allow toxic gases including carbon monoxide to leak into the home. The identified deficiencies indicate that flue relining is necessary to ensure safe venting of your appliances per NFPA 211 standards.',
    defaultOptions: [
      {
        tier: 'good',
        label: 'Cast-in-Place Liner',
        pricebook_item_name: 'Cast-in-Place Flue Liner',
        unit_price: 2200,
        unit: 'ea',
        customer_description:
          'Install a cast-in-place refractory liner to restore the flue passage and improve insulation.',
      },
      {
        tier: 'better',
        label: 'Stainless Steel Liner System',
        pricebook_item_name: 'Stainless Steel Liner System',
        unit_price: 2950,
        unit: 'ea',
        customer_description:
          'Install a UL-listed 316Ti stainless steel flexible liner with insulation blanket to properly vent the appliance.',
      },
      {
        tier: 'best',
        label: 'Heavy-Duty Stainless Liner with Insulation & Warranty',
        pricebook_item_name: 'Heavy-Duty Stainless Liner (Lifetime Warranty)',
        unit_price: 3800,
        unit: 'ea',
        customer_description:
          'Install a lifetime-warranty heavy-wall stainless steel liner with full insulation and top/bottom termination kits.',
      },
    ],
  },
  smoke_chamber: {
    type: 'smoke_chamber',
    label: 'Smoke Chamber System',
    title: 'Smoke Chamber Resurfacing',
    deficiencyTypes: [
      'smoke_chamber_gaps',
      'smoke_chamber_cracking',
      'corbeling_issues',
      'creosote_buildup',
      'rough_smoke_chamber',
      'smoke_chamber_deterioration',
    ],
    requiredMeasurements: ['smoke_chamber_height', 'smoke_chamber_depth'],
    codeReferences: 'NFPA 211 §14.11 — Smoke chamber requirements',
    summary:
      'The smoke chamber has gaps, cracking, corbeling irregularities, or creosote buildup that affects draft and safety.',
    explanation:
      'The smoke chamber transitions smoke from the fireplace opening to the flue. Gaps, cracks, and rough corbeled surfaces create turbulence and creosote accumulation. Resurfacing the smoke chamber smooths the interior, improves draft, and reduces fire risk per code requirements.',
    defaultOptions: [
      {
        tier: 'good',
        label: 'Smoke Chamber Parging',
        pricebook_item_name: 'Smoke Chamber Parging',
        unit_price: 650,
        unit: 'ea',
        customer_description:
          'Apply high-temperature refractory parging compound to smooth rough smoke chamber walls.',
      },
      {
        tier: 'better',
        label: 'Smoke Chamber Resurfacing & Joint Repair',
        pricebook_item_name: 'Smoke Chamber Resurfacing',
        unit_price: 1100,
        unit: 'ea',
        customer_description:
          'Repair cracked joints, fill gaps, and resurface the smoke chamber with insulating refractory material.',
      },
      {
        tier: 'best',
        label: 'Smoke Chamber Rebuild & Insulation',
        pricebook_item_name: 'Smoke Chamber Rebuild',
        unit_price: 2400,
        unit: 'ea',
        customer_description:
          'Rebuild corbeled walls to code-compliant geometry and insulate with refractory panels.',
      },
    ],
  },
  cap_chase: {
    type: 'cap_chase',
    label: 'Cap / Chase Cover System',
    title: 'Chimney Cap / Chase Cover Replacement',
    deficiencyTypes: [
      'missing_cap',
      'rusted_chase_cover',
      'water_stains_cap',
      'animal_entry',
      'damaged_cap',
      'deteriorated_chase_cover',
    ],
    requiredMeasurements: ['flue_diameter', 'chase_width', 'chase_depth'],
    codeReferences: 'NFPA 211 §14.2.1 — Spark arrestor / rain cap',
    summary:
      'The chimney cap or chase cover is missing, rusted, or damaged, allowing water and animal entry into the chimney.',
    explanation:
      'The chimney cap or chase cover prevents rain, snow, debris, and animals from entering the flue. A missing or rusted cover allows water to damage the flue liner and interior components, and animals can nest in the chimney creating blockages. The identified deficiencies indicate cap or chase cover replacement is needed.',
    defaultOptions: [
      {
        tier: 'good',
        label: 'Stainless Steel Chimney Cap',
        pricebook_item_name: 'Stainless Steel Chimney Cap',
        unit_price: 285,
        unit: 'ea',
        customer_description:
          'Install a stainless steel rain cap with spark arrestor on the flue termination.',
      },
      {
        tier: 'better',
        label: 'Chase Cover Replacement (Stainless)',
        pricebook_item_name: 'Stainless Chase Cover Replacement',
        unit_price: 650,
        unit: 'ea',
        customer_description:
          'Fabricate and install a custom stainless steel chase cover with drip edges and proper cross-ventilation.',
      },
      {
        tier: 'best',
        label: 'Full Chase Top Rebuild with Cap',
        pricebook_item_name: 'Chase Top Rebuild with Cap',
        unit_price: 1200,
        unit: 'ea',
        customer_description:
          'Rebuild the chase top framing, install a stainless chase cover, and add a top-mount chimney cap.',
      },
    ],
  },
};

export const REPAIR_SYSTEM_LIST = Object.values(REPAIR_SYSTEMS);

export function getRepairSystemByType(type) {
  return REPAIR_SYSTEMS[type] || null;
}

export function getRepairSystemForDeficiency(deficiencyType) {
  for (const sys of REPAIR_SYSTEM_LIST) {
    if (sys.deficiencyTypes.includes(deficiencyType)) {
      return sys;
    }
  }
  return null;
}