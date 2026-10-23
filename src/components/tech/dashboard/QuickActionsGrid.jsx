import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Package, Download, RotateCcw, AlertCircle, GraduationCap, Wrench } from 'lucide-react';

const actions = [
  { label: 'Forms Center', to: '/forms', icon: FileText, color: 'bg-green-100 text-green-600' },
  { label: 'Consumable Replenishment', to: '/consumables/new', icon: Package, color: 'bg-amber-100 text-amber-600' },
  { label: 'Receive Material Transfer', to: '/warehouse/material-returns/new', icon: Download, color: 'bg-indigo-100 text-indigo-600' },
  { label: 'Truck Returns', to: '/warehouse/material-returns', icon: RotateCcw, color: 'bg-purple-100 text-purple-600' },
  { label: 'My Equipment', to: '/tech/equipment', icon: Wrench, color: 'bg-blue-100 text-blue-600' },
  { label: 'Report Issue', to: '/ci/submit', icon: AlertCircle, color: 'bg-red-100 text-red-600' },
  { label: 'Training', to: '/tech/resources', icon: GraduationCap, color: 'bg-teal-100 text-teal-600' },
  { label: 'Job History', to: '/tech/reports', icon: FileText, color: 'bg-slate-100 text-slate-600' },
];

export default function QuickActionsGrid({ isApprentice }) {
  return (
    <Card className="border-0 shadow-sm h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Quick Actions
          {isApprentice && <span className="text-xs text-muted-foreground font-normal ml-1">(Apprentice)</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {actions.map((action, i) => (
            <Link key={i} to={action.to}>
              <div className="flex flex-col items-center gap-2 p-3 rounded-lg border hover:shadow-sm transition-all cursor-pointer">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${action.color}`}>
                  <action.icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-center">{action.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}