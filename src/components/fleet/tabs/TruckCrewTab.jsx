import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";

export function TruckCrewTab({ truck }) {
  const crew = [
    { label: "Lead Technician", name: truck.assigned_lead_technician },
    { label: "Apprentice", name: truck.assigned_apprentice },
    { label: "Default Crew", name: truck.default_crew },
    { label: "Current Driver", name: truck.current_driver },
  ];

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Assigned Crew</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {crew.map(c => (
          <div key={c.label} className="flex items-center gap-3 p-3 rounded-lg border">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="font-medium">{c.name || "Not assigned"}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}