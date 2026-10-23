import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, List, Wand2, ScrollText, AlertTriangle, FlaskConical, BarChart3, Settings, Cog, Radio, GitBranch, Activity, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/rules-engine', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/rules-engine/registry', label: 'Rule Registry', icon: List },
  { to: '/rules-engine/builder', label: 'Rule Builder', icon: Wand2 },
  { to: '/rules-engine/simulator', label: 'Simulator', icon: FlaskConical },
  { to: '/rules-engine/dependencies', label: 'Dependencies', icon: GitBranch },
  { to: '/rules-engine/health', label: 'Health', icon: Activity },
  { to: '/rules-engine/rule-sets', label: 'Rule Sets', icon: Layers },
  { to: '/rules-engine/live-events', label: 'Live Events', icon: Radio },
  { to: '/rules-engine/run-logs', label: 'Run Logs', icon: ScrollText },
  { to: '/rules-engine/failed', label: 'Failed Automations', icon: AlertTriangle },
  { to: '/rules-engine/test-runner', label: 'Manual Test Runner', icon: FlaskConical },
  { to: '/rules-engine/reports', label: 'Reports', icon: BarChart3 },
  { to: '/rules-engine/settings', label: 'Settings', icon: Settings },
];

export default function RuleEngineNav() {
  const location = useLocation();
  return (
    <div className="border-b bg-card sticky top-0 z-30 pt-safe">
      <div className="flex items-center gap-1 px-3 md:px-6 overflow-x-auto pb-safe">
        <Link to="/rules-engine" className="flex items-center gap-2 py-3 pr-4 border-r mr-2 shrink-0">
          <Cog className="w-5 h-5 text-accent" />
          <span className="font-bold text-sm hidden sm:inline">Rules Engine</span>
        </Link>
        {NAV_ITEMS.map(item => {
          const isActive = item.end
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap select-none',
                isActive ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              <item.icon className="w-3.5 h-3.5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}