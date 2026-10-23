import { Card, CardContent } from "@/components/ui/card";
import { Activity } from "lucide-react";

export default function FleetHealthScore({ fleetHealth }) {
  const factorLabels = {
    inspections: "Completed Inspections",
    defects: "Open Defects",
    equipment: "Equipment Completeness",
    consumables: "Consumable Completeness",
    availability: "Truck Availability",
  };
  const score = fleetHealth.score;
  const scoreColor = score >= 80 ? "text-green-600" : score >= 50 ? "text-amber-600" : "text-red-600";
  const scoreBg = score >= 80 ? "bg-green-100" : score >= 50 ? "bg-amber-100" : "bg-red-100";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className={`w-16 h-16 rounded-full ${scoreBg} flex items-center justify-center shrink-0`}>
            <span className={`text-xl font-bold ${scoreColor}`}>{score}%</span>
          </div>
          <div className="flex-1">
            <p className="font-medium flex items-center gap-2"><Activity className="w-4 h-4" /> Fleet Health</p>
            <div className="space-y-1 mt-2">
              {Object.entries(fleetHealth.factors).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground w-36 shrink-0">{factorLabels[key] || key}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: val + "%" }} />
                  </div>
                  <span className="font-medium w-8 text-right">{val}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}