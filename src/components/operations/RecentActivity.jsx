import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, GitBranch, Package, ShoppingCart, ClipboardCheck, GraduationCap, Clock } from 'lucide-react';

const ACTIVITY = [
  { icon: FileText, text: 'SOP WH-101 approved by Operations Manager', time: '2h ago', color: 'text-green-500' },
  { icon: GitBranch, text: 'Workflow WF-WH-001 released to Testing', time: '4h ago', color: 'text-blue-500' },
  { icon: Package, text: 'Inventory adjusted: 8" liner stock reduced by 12', time: '5h ago', color: 'text-yellow-500' },
  { icon: ShoppingCart, text: 'Purchase Order #1045 created', time: '6h ago', color: 'text-purple-500' },
  { icon: ClipboardCheck, text: 'Inspection completed for 123 Main St', time: '7h ago', color: 'text-teal-500' },
  { icon: GraduationCap, text: 'John D. completed Safety Training Module 3', time: '1d ago', color: 'text-pink-500' },
];

export default function RecentActivity() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {ACTIVITY.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <item.icon className={`w-4 h-4 mt-0.5 shrink-0 ${item.color}`} />
              <p className="text-sm flex-1 min-w-0">{item.text}</p>
              <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {item.time}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}