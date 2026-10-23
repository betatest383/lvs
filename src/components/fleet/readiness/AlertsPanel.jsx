import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AlertTriangle, AlertCircle } from "lucide-react";

export default function AlertsPanel({ alerts }) {
  const critical = alerts.filter(a => a.severity === "critical");
  const warnings = alerts.filter(a => a.severity === "warning");

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" /> Alerts
          {alerts.length > 0 && <span className="text-sm text-muted-foreground">({alerts.length})</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-96 overflow-y-auto">
        {alerts.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No active alerts.</p>
        )}
        {critical.map((a, i) => (
          <div key={"c" + i} className="flex items-start gap-2 p-2 rounded-lg bg-red-50 border border-red-200">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{a.message}</p>
          </div>
        ))}
        {warnings.map((a, i) => (
          <div key={"w" + i} className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">{a.message}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}