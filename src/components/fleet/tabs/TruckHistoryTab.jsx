import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Clock } from "lucide-react";

export function TruckHistoryTab({ truck }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Truck History</CardTitle></CardHeader>
      <CardContent>
        <div className="text-center py-8">
          <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">Full truck history timeline will populate from vehicle assignments, maintenance records, and audit data.</p>
          <div className="mt-4 text-left space-y-2 max-w-md mx-auto">
            <div className="flex gap-3 p-2 border-l-2 border-blue-300 pl-3">
              <div className="text-xs text-muted-foreground">Created</div>
              <div className="text-sm">{new Date(truck.created_date).toLocaleDateString()}</div>
            </div>
            <div className="flex gap-3 p-2 border-l-2 border-green-300 pl-3">
              <div className="text-xs text-muted-foreground">Last Updated</div>
              <div className="text-sm">{new Date(truck.updated_date).toLocaleDateString()}</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}