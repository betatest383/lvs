import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bug, ChevronDown, ChevronRight } from "lucide-react";

export default function DeveloperDebugPanel({ stats, readiness }) {
  const [open, setOpen] = useState(false);
  const failedQueries = Object.entries(stats).filter(([, s]) => s && s.error);

  return (
    <Card className="border-slate-300">
      <CardHeader>
        <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full text-left">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <Bug className="w-4 h-4 text-slate-600" />
          <CardTitle className="text-base">Developer Mode</CardTitle>
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            {Object.entries(stats).filter(([, s]) => s && typeof s === "object" && "count" in s).map(([key, s]) => (
              <div key={key} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                <span className="text-muted-foreground text-xs">{key}</span>
                <div className="text-right">
                  <span className="font-medium text-sm">{s.count}</span>
                  {s.duration > 0 && <span className="text-xs text-muted-foreground ml-1">({s.duration}ms)</span>}
                  {s.error && <span className="text-xs text-red-500 ml-1">⚠</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 rounded-lg bg-muted/30 border">
            <p className="text-xs font-medium text-muted-foreground mb-1">Dispatch Readiness Calculation</p>
            <p className="text-xs">
              Score = (Trucks Ready / Total Trucks) × 100 = ({readiness.dispatchReadiness.trucksReady} / {readiness.summary.totalTrucks}) = {readiness.dispatchReadiness.score}%
            </p>
            <p className="text-xs mt-1">
              Fleet Health = avg(inspections {readiness.fleetHealth.factors.inspections}%, defects {readiness.fleetHealth.factors.defects}%, equipment {readiness.fleetHealth.factors.equipment}%, consumables {readiness.fleetHealth.factors.consumables}%, availability {readiness.fleetHealth.factors.availability}%) = {readiness.fleetHealth.score}%
            </p>
          </div>

          {failedQueries.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm font-medium text-red-800">Failed Lookups:</p>
              {failedQueries.map(([key, s]) => (
                <p key={key} className="text-xs text-red-600 mt-1">{key}: {s.error}</p>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}