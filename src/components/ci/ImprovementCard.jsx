import { PRIORITY_COLORS, STATUS_COLORS } from '@/lib/improvementConstants';

export default function ImprovementCard({ item, onClick }) {
  const pc = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.Medium;
  return (
    <div
      onClick={onClick}
      className="bg-card rounded-lg border border-border p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-mono text-muted-foreground">{item.improvement_id || '—'}</span>
        <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${pc.bg} ${pc.text}`}>
          {item.priority || 'Medium'}
        </span>
      </div>
      <p className="text-sm font-medium line-clamp-2 mb-2">{item.title}</p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {item.category && <span className="truncate">{item.category}</span>}
        {item.submitted_by && (
          <>
            <span>•</span>
            <span className="truncate">{item.submitted_by}</span>
          </>
        )}
      </div>
    </div>
  );
}