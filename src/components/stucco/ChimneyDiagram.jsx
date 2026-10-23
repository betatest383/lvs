import React from "react";
import { SECTION_COORDS, CHIMNEY_TEMPLATES, getSvgDimensions } from "@/lib/chimneyDiagramConfig";

const STATUS_COLORS = {
  not_started: { fill: "#e2e8f0", stroke: "#94a3b8", text: "#475569" },
  in_progress: { fill: "#fde68a", stroke: "#f59e0b", text: "#92400e" },
  complete: { fill: "#86efac", stroke: "#16a34a", text: "#14532d" },
  flagged: { fill: "#fca5a5", stroke: "#dc2626", text: "#7f1d1d" },
};

export default function ChimneyDiagram({
  template,
  sections = [],
  onSectionClick,
  interactive = true,
  size = "lg",
  showLabels = true,
}) {
  const tmpl = CHIMNEY_TEMPLATES[template];
  if (!tmpl) return null;

  const sectionMap = {};
  sections.forEach(s => {
    if (s.section_label) sectionMap[s.section_label] = s;
  });

  const getColors = (label) => {
    const sec = sectionMap[label];
    const status = sec?.status || "not_started";
    return STATUS_COLORS[status] || STATUS_COLORS.not_started;
  };

  const { width: svgW, height: svgH } = getSvgDimensions(tmpl.viewBox, size);
  const isTopOnly = tmpl.viewBox.includes("400 160");

  return (
    <svg viewBox={tmpl.viewBox} width={svgW} height={svgH} className="select-none">
      {tmpl.chaseEnclosure && (
        <rect x="130" y="10" width="140" height="640" fill="none" stroke="#a16207" strokeWidth="2" strokeDasharray="6,4" rx="4" />
      )}

      {!isTopOnly && (
        <g>
          <line x1="20" y1="530" x2="380" y2="530" stroke="#64748b" strokeWidth="1.5" strokeDasharray="4,4" />
          <text x="25" y="525" fontSize="11" fill="#64748b" fontStyle="italic">Roof Line</text>
        </g>
      )}

      {tmpl.sections.map(label => {
        const coord = SECTION_COORDS[label];
        if (!coord) return null;
        const c = getColors(label);
        return (
          <g key={label}>
            <polygon
              points={coord.points}
              fill={c.fill}
              stroke={c.stroke}
              strokeWidth="2"
              style={{ transition: "fill 0.3s ease, stroke 0.3s ease" }}
              className={interactive ? "cursor-pointer hover:opacity-80" : ""}
              onClick={interactive ? () => onSectionClick?.(label) : undefined}
            />
            {showLabels && (
              <text x={coord.label.x} y={coord.label.y} textAnchor="middle" fontSize={size === "sm" ? "11" : "14"} fontWeight="700" fill={c.text} className="pointer-events-none">
                {label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}