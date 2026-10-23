import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const DIAGRAMS = [
  { id: 'figure_1a', label: 'Figure 1-a', areas: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'] },
  { id: 'figure_1b', label: 'Figure 1-b', areas: ['A', 'B', 'D', 'E', 'G', 'I', 'J', 'K', 'L', 'M', 'N', 'O'] },
  { id: 'figure_1c', label: 'Figure 1-c', areas: ['A', 'B', 'D', 'E', 'G', 'I', 'J', 'K', 'L', 'M', 'N', 'O'] },
  { id: 'figure_1d', label: 'Figure 1-d', areas: ['A', 'B', 'C', 'D', 'E', 'F', 'O'] },
  { id: 'figure_1e', label: 'Figure 1-e', areas: ['L', 'M', 'N', 'O'] },
];

const LABEL_POSITIONS = {
  figure_1a: { A:[28,232], B:[119,245], C:[210,232], D:[60,170], E:[88,187], F:[155,187], G:[122,185], H:[185,160], I:[85,115], J:[122,115], K:[190,115], L:[85,65], M:[122,65], N:[190,65], O:[122,20] },
  figure_1b: { A:[45,235], B:[125,245], D:[78,175], E:[92,193], G:[127,192], I:[92,120], J:[127,120], K:[190,125], L:[92,68], M:[127,68], N:[190,68], O:[127,20] },
  figure_1c: { A:[190,235], B:[115,245], D:[173,175], E:[155,193], G:[120,192], I:[155,120], J:[120,120], K:[30,125], L:[155,68], M:[120,68], N:[30,68], O:[120,20] },
  figure_1d: { A:[90,200], B:[125,200], C:[200,200], D:[100,65], E:[125,65], F:[205,65], O:[125,20] },
  figure_1e: { L:[92,92], M:[125,92], N:[190,92], O:[125,30] },
};

function DiagramDrawing({ diagram, selected = false }) {
  const points = LABEL_POSITIONS[diagram.id];
  const compact = diagram.id === 'figure_1e';

  return (
    <svg viewBox="0 0 240 280" className="w-full h-44" aria-label={diagram.label}>
      <rect x={compact ? 70 : 55} y={compact ? 52 : 120} width={compact ? 100 : 130} height={compact ? 95 : 115} fill="white" stroke="currentColor" strokeWidth="2" />
      {!compact && (
        <>
          <rect x="80" y="30" width="80" height="130" fill="white" stroke="currentColor" strokeWidth="2" />
          {diagram.id !== 'figure_1d' && <path d={diagram.id === 'figure_1c' ? "M80 160 L160 160 L205 205 L55 205 Z" : "M80 160 L160 160 L185 205 L55 205 Z"} fill="white" stroke="currentColor" strokeWidth="2" />}
          <line x1="12" y1="108" x2="228" y2="108" stroke="#737373" strokeWidth="8" />
          <text x="148" y="102" fontSize="10" fill="#404040">Roofline</text>
        </>
      )}
      {Object.entries(points).map(([letter, [x, y]]) => (
        <g key={letter}>
          <rect x={x - 10} y={y - 12} width="20" height="20" rx="2" fill={selected ? '#eff6ff' : '#fafafa'} stroke="#94a3b8" strokeDasharray="2 2" />
          <text x={x} y={y + 2} textAnchor="middle" fontSize="12" fontWeight="600" fill="#0f172a">{letter}</text>
        </g>
      ))}
    </svg>
  );
}

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const summarize = (areas) => {
  const completed = Object.values(areas || {}).filter(({ length_in, height_in }) => toNumber(length_in) && toNumber(height_in));
  const totalSqIn = completed.reduce((sum, entry) => sum + (toNumber(entry.length_in) * toNumber(entry.height_in)), 0);
  return {
    completed_count: completed.length,
    total_sq_in: Number(totalSqIn.toFixed(2)),
    total_sq_ft: Number((totalSqIn / 144).toFixed(2)),
  };
};

export default function ChimneyMeasurementDiagram({ value, onChange, disabled = false }) {
  const selectedId = value && typeof value === 'object' ? value.diagram_id : '';
  const selected = DIAGRAMS.find((diagram) => diagram.id === selectedId);
  const storedAreas = value && typeof value === 'object' ? value.areas || {} : {};

  const selectDiagram = (diagram) => {
    const areas = Object.fromEntries(
      diagram.areas.map((letter) => [letter, storedAreas[letter] || { length_in: '', height_in: '' }])
    );
    onChange({ diagram_id: diagram.id, diagram_label: diagram.label, areas, ...summarize(areas) });
  };

  const updateArea = (letter, field, rawValue) => {
    const valueNumber = rawValue === '' ? '' : Number(rawValue);
    const areas = {
      ...storedAreas,
      [letter]: { ...(storedAreas[letter] || { length_in: '', height_in: '' }), [field]: valueNumber },
    };
    onChange({ diagram_id: selected.id, diagram_label: selected.label, areas, ...summarize(areas) });
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">Choose the chimney shape</p>
        <p className="text-xs text-slate-600">Each letter is a separate rectangular area. Enter its length and height in inches.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {DIAGRAMS.map((diagram) => {
          const isSelected = selectedId === diagram.id;
          return (
            <Button
              key={diagram.id}
              type="button"
              variant={isSelected ? 'default' : 'outline'}
              className="h-auto flex-col gap-1 px-1 py-2"
              onClick={() => selectDiagram(diagram)}
              disabled={disabled}
            >
              <DiagramDrawing diagram={diagram} selected={isSelected} />
              <span className="text-xs">{diagram.label}</span>
            </Button>
          );
        })}
      </div>

      {selected && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.65fr)_minmax(0,1fr)]">
          <div className="rounded-lg border bg-white p-3 text-slate-800">
            <DiagramDrawing diagram={selected} selected />
            <p className="mt-1 text-center text-sm font-semibold">{selected.label}</p>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-[42px_1fr_1fr_72px] items-end gap-2 border-b pb-2 text-xs font-medium text-slate-600">
              <span>Area</span><span>Length (in.)</span><span>Height (in.)</span><span>Sq. in.</span>
            </div>
            {selected.areas.map((letter) => {
              const area = storedAreas[letter] || {};
              const length = toNumber(area.length_in);
              const height = toNumber(area.height_in);
              const sqIn = length && height ? Number((length * height).toFixed(2)) : '—';
              return (
                <div key={letter} className="grid grid-cols-[42px_1fr_1fr_72px] items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded bg-blue-100 text-sm font-bold text-blue-800">{letter}</span>
                  <Input type="number" min="0" step="0.01" inputMode="decimal" value={area.length_in ?? ''} disabled={disabled} onChange={(event) => updateArea(letter, 'length_in', event.target.value)} />
                  <Input type="number" min="0" step="0.01" inputMode="decimal" value={area.height_in ?? ''} disabled={disabled} onChange={(event) => updateArea(letter, 'height_in', event.target.value)} />
                  <span className="text-right text-sm font-medium">{sqIn}</span>
                </div>
              );
            })}
            <div className="flex justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950">
              <span>{value?.completed_count || 0} of {selected.areas.length} areas calculated</span>
              <span className="font-semibold">Total: {value?.total_sq_ft || 0} sq. ft.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
