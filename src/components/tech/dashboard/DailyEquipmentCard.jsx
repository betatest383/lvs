import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, Wrench } from 'lucide-react';

export default function DailyEquipmentCard({ equipment = [] }) {
  const dailyEquipment = equipment.filter(e => e.required_daily_operations && e.is_active !== false);
  const ready = dailyEquipment.filter(e => ['new', 'good'].includes(e.condition) && !['missing', 'damaged', 'out_for_repair', 'retired'].includes(e.status));
  const notReady = dailyEquipment.filter(e => !['new', 'good'].includes(e.condition) || ['missing', 'damaged', 'out_for_repair'].includes(e.status));

  const total = dailyEquipment.length;
  const readyCount = ready.length;
  const allReady = readyCount === total && total > 0;

  return (
    <Card className={allReady ? 'border-green-200' : notReady.length > 0 ? 'border-red-200' : ''}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Wrench className="w-4 h-4 text-primary" />
          Daily Equipment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">No daily equipment assigned.</p>
        ) : allReady ? (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium text-green-700">{readyCount} / {total} Ready</span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <span className="text-sm font-medium text-red-700">{readyCount} / {total} Ready</span>
            </div>
            <div className="space-y-1">
              {notReady.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded bg-red-50 border border-red-100">
                  <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />
                  <span className="font-medium">{item.item_name}</span>
                  <span className="text-muted-foreground ml-auto capitalize">
                    {item.status === 'missing' ? 'Missing' : item.status === 'damaged' ? 'Damaged' : item.status === 'out_for_repair' ? 'Out for Repair' : item.condition}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}