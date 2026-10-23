import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap } from 'lucide-react';

/**
 * Quick Actions Widget — role-specific shortcut buttons.
 * @param {Array} actions - [{ label, icon, to, color }]
 */
export default function QuickActionsWidget({ title = 'Quick Actions', actions = [] }) {
  return (
    <Card className="border-0 shadow-sm h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No actions available</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {actions.map((action, i) => {
              const Icon = action.icon;
              return (
                <Link key={i} to={action.to}>
                  <div className="flex items-center gap-2.5 rounded-lg border border-border p-3 hover:shadow-sm transition-all cursor-pointer">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${action.color || 'bg-muted'}`}>
                      {Icon && <Icon className="w-4 h-4" />}
                    </div>
                    <span className="text-sm font-medium">{action.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}