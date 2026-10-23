import { Badge } from '@/components/ui/badge';

export default function ConfidenceBadge({ score, reason }) {
  let level = 'low';
  let color = 'bg-red-100 text-red-700 border-red-200';
  let label = 'Low Confidence';

  if (score >= 80) {
    level = 'high';
    color = 'bg-green-100 text-green-700 border-green-200';
    label = 'High Confidence';
  } else if (score >= 50) {
    level = 'medium';
    color = 'bg-amber-100 text-amber-700 border-amber-200';
    label = 'Medium Confidence';
  }

  if (score < 50) {
    label = 'Low Confidence';
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge variant="outline" className={`gap-1 ${color}`}>
        <span className="font-bold">{score}%</span>
        <span className="opacity-70">·</span>
        {label}
      </Badge>
      {reason && (
        <span className="text-xs text-muted-foreground hidden sm:inline">{reason}</span>
      )}
    </div>
  );
}