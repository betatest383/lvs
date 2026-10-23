import { Card, CardContent } from '@/components/ui/card';
import {
  Clock, Truck, Package, CheckSquare,
  AlertTriangle, Forklift, UserCheck,
} from 'lucide-react';

/**
 * WF-WH-001 Dashboard Widgets — KPI cards for the Morning Material Request workflow.
 * @param {Object} stats - { waiting, loading, staged, released, avgLoadTime, missingTransferSheets, forkliftPending, longestWaitingTech }
 */
export default function WfWh001DashboardWidgets({ stats }) {
  const cards = [
    { label: 'Trucks Waiting', value: stats.waiting ?? 0, icon: Clock, color: 'bg-amber-100 text-amber-600' },
    { label: 'Trucks Loading', value: stats.loading ?? 0, icon: Package, color: 'bg-blue-100 text-blue-600' },
    { label: 'Trucks Staged', value: stats.staged ?? 0, icon: CheckSquare, color: 'bg-indigo-100 text-indigo-600' },
    { label: 'Trucks Released', value: stats.released ?? 0, icon: Truck, color: 'bg-green-100 text-green-600' },
    { label: 'Avg Loading Time', value: stats.avgLoadTime != null ? `${stats.avgLoadTime}m` : '—', icon: Clock, color: 'bg-purple-100 text-purple-600' },
    { label: 'Missing Transfer Sheets', value: stats.missingTransferSheets ?? 0, icon: AlertTriangle, color: 'bg-red-100 text-red-600' },
    { label: 'Forklift Loads Pending', value: stats.forkliftPending ?? 0, icon: Forklift, color: 'bg-orange-100 text-orange-600' },
    { label: 'Longest Waiting', value: stats.longestWaitingTech || '—', icon: UserCheck, color: 'bg-teal-100 text-teal-600' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((card, i) => {
        const Icon = card.icon;
        return (
          <Card key={i} className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">{card.label}</p>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${card.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold truncate">{card.value}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}