/**
 * Chimney Stucco Measurement Tool — Diagram Configuration
 * FRM-STUCCO-001
 *
 * Defines SVG polygon coordinates for each chimney section (A–O),
 * template definitions, default location zones, surface types,
 * and validation/calculation helpers.
 */

// SVG viewBox: 0 0 400 660 (full chimney) or 0 0 400 160 (top only)
export const SECTION_COORDS = {
  A: { points: "145,575 255,575 260,640 140,640", label: { x: 200, y: 612 } },
  B: { points: "152,530 248,530 255,575 145,575", label: { x: 200, y: 555 } },
  C: { points: "160,485 240,485 248,530 152,530", label: { x: 200, y: 510 } },
  D: { points: "165,440 235,440 235,485 165,485", label: { x: 200, y: 465 } },
  E: { points: "165,395 235,395 235,440 165,440", label: { x: 200, y: 420 } },
  F: { points: "165,350 235,350 235,395 165,395", label: { x: 200, y: 375 } },
  G: { points: "165,305 235,305 235,350 165,350", label: { x: 200, y: 330 } },
  H: { points: "160,265 240,265 240,305 160,305", label: { x: 200, y: 287 } },
  I: { points: "155,225 245,225 245,265 155,265", label: { x: 200, y: 247 } },
  J: { points: "150,185 250,185 250,225 150,225", label: { x: 200, y: 207 } },
  K: { points: "140,145 260,145 260,185 140,185", label: { x: 200, y: 167 } },
  L: { points: "165,105 235,105 225,145 175,145", label: { x: 200, y: 127 } },
  M: { points: "180,75 220,75 220,105 180,105", label: { x: 200, y: 92 } },
  N: { points: "185,45 215,45 215,75 185,75", label: { x: 200, y: 62 } },
  O: { points: "180,15 220,15 215,45 185,45", label: { x: 200, y: 32 } },
};

export const SECTION_DEFAULTS = {
  A: { location_zone: "Below Roof", surface_type: "Stucco" },
  B: { location_zone: "Roofline", surface_type: "Stucco" },
  C: { location_zone: "Roofline", surface_type: "Stucco" },
  D: { location_zone: "Above Roof", surface_type: "Stucco" },
  E: { location_zone: "Above Roof", surface_type: "Stucco" },
  F: { location_zone: "Above Roof", surface_type: "Stucco" },
  G: { location_zone: "Above Roof", surface_type: "Stucco" },
  H: { location_zone: "Shoulder", surface_type: "Stucco" },
  I: { location_zone: "Shoulder", surface_type: "Stucco" },
  J: { location_zone: "Shoulder", surface_type: "Stucco" },
  K: { location_zone: "Shoulder", surface_type: "Stucco" },
  L: { location_zone: "Top", surface_type: "Stucco" },
  M: { location_zone: "Top", surface_type: "Stucco" },
  N: { location_zone: "Top", surface_type: "Stucco" },
  O: { location_zone: "Top", surface_type: "Stucco" },
};

export const CHIMNEY_TEMPLATES = {
  figure_1a: {
    key: "figure_1a",
    name: "Figure 1-a",
    subtitle: "Full Chimney — All Sections",
    description: "Complete chimney measurement with all 15 sections from below roof to top cap.",
    sections: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"],
    viewBox: "0 0 400 660",
    chaseEnclosure: false,
  },
  figure_1b: {
    key: "figure_1b",
    name: "Figure 1-b",
    subtitle: "Standard Chimney — No Transition",
    description: "Standard chimney with 12 sections, excluding transition areas C, F, and H.",
    sections: ["A", "B", "D", "E", "G", "I", "J", "K", "L", "M", "N", "O"],
    viewBox: "0 0 400 660",
    chaseEnclosure: false,
  },
  figure_1c: {
    key: "figure_1c",
    name: "Figure 1-c",
    subtitle: "Chase Enclosure — Standard",
    description: "Chase enclosure chimney with 12 sections, featuring a wooden frame outline.",
    sections: ["A", "B", "D", "E", "G", "I", "J", "K", "L", "M", "N", "O"],
    viewBox: "0 0 400 660",
    chaseEnclosure: true,
  },
  figure_1d: {
    key: "figure_1d",
    name: "Figure 1-d",
    subtitle: "Simple Chimney — Minimal Sections",
    description: "Simplified chimney measurement with 7 key sections.",
    sections: ["A", "B", "C", "D", "E", "F", "O"],
    viewBox: "0 0 400 660",
    chaseEnclosure: false,
  },
  figure_1e: {
    key: "figure_1e",
    name: "Figure 1-e",
    subtitle: "Chimney Top — Crown & Cap Only",
    description: "Top portion only — crown, cap, and spark arrestor. 4 sections.",
    sections: ["L", "M", "N", "O"],
    viewBox: "0 0 400 160",
    chaseEnclosure: false,
  },
};

export const SURFACE_TYPES = ["Stucco", "Brick", "Stone", "Chase", "Other"];
export const LOCATION_ZONES = ["Above Roof", "Below Roof", "Roofline", "Top", "Shoulder"];

/**
 * Area = Width × Height × Quantity
 * Inches are converted to feet before calculating square footage.
 */
export function calculateAreaSqFt(width, height, quantity, unit) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  const q = Number(quantity) || 1;
  if (!w || !h) return 0;
  if (unit === "inches") {
    return ((w / 12) * (h / 12)) * q;
  }
  return (w * h) * q;
}

/**
 * Validates a section's measurements and returns warning messages.
 */
export function validateSection(section) {
  const warnings = [];
  const { width, height, unit, area_sqft, photo_required, photo_url, status } = section;

  const widthInches = unit === "inches" ? Number(width) : Number(width) * 12;
  const heightInches = unit === "inches" ? Number(height) : Number(height) * 12;

  if (width && widthInches > 240) {
    warnings.push("Width exceeds 240 inches — please verify.");
  }
  if (height && heightInches > 600) {
    warnings.push("Height exceeds 600 inches — please verify.");
  }
  if (area_sqft > 200) {
    warnings.push("Area exceeds 200 sq ft for one section — please verify.");
  }
  if (!width) {
    warnings.push("Width is missing.");
  }
  if (!height) {
    warnings.push("Height is missing.");
  }
  if (photo_required && !photo_url) {
    warnings.push("Required photo is missing.");
  }
  if (status === "in_progress") {
    warnings.push("Section is marked as incomplete.");
  }

  return warnings;
}

/**
 * Computes aggregate totals from a list of section objects.
 */
export function computeTotals(sections) {
  let total = 0, above = 0, below = 0, roofline = 0, complete = 0;

  sections.forEach(s => {
    if (s.status === "complete") {
      complete++;
      if (s.include_in_total !== false) {
        const area = s.area_sqft || 0;
        total += area;
        if (s.location_zone === "Above Roof") above += area;
        else if (s.location_zone === "Below Roof") below += area;
        else if (s.location_zone === "Roofline" || s.location_zone === "Shoulder") roofline += area;
      }
    }
  });

  const totalSections = sections.length;
  const completion_percent = totalSections > 0 ? Math.round((complete / totalSections) * 100) : 0;

  return { total, above, below, roofline, complete, totalSections, completion_percent };
}

export function getSvgDimensions(viewBox, size) {
  const parts = viewBox.split(" ").map(Number);
  const vbW = parts[2] || 400;
  const vbH = parts[3] || 660;
  const targetWidth = size === "sm" ? 140 : 300;
  const targetHeight = Math.round((targetWidth * vbH) / vbW);
  return { width: targetWidth, height: targetHeight };
}