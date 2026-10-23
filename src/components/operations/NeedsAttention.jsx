import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, ArrowRight, AlertCircle, Clock } from 'lucide-react';

const SEVERITY_ICON = {
  high: { icon: AlertTriangle, color: 'text-red-500' },
  medium: { icon: AlertCircle, color: 'text-yellow-500' },
  low: { icon: Clock, color: 'text-blue-500' },
};

export default function NeedsAttention({ data }) {
  const issues = (data.issues || []).slice(0, 10);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" /> Needs Executive Attention
        </CardTitle>
      </CardHeader>
      <CardContent>
        {issues.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No critical issues. All clear.</p>
        ) : (
          <div className="space-y-1">
            {issues.map((issue, i) => {
              const config = SEVERITY_ICON[issue.severity] || SEVERITY_ICON.low;
              return (
                <Link key={i} to={issue.link} className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/50 transition-colors group">
                  <config.icon className={`w-4 h-4 shrink-0 ${config.color}`} />
                  <span className="flex-1 text-sm min-w-0 truncate">{issue.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">{issue.type}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}