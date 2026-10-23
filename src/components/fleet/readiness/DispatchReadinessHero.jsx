import { Card, CardContent } from "@/components/ui/card";
import { Truck, AlertTriangle, XCircle, Wrench, CheckCircle2 } from "lucide-react";

export default function DispatchReadinessHero({ readiness }) {
  const { dispatchReadiness, fleetHealth } = readiness;
  const score = dispatchReadiness.score;
  const scoreColor = score >= 80 ? "text-green-600" : score >= 50 ? "text-amber-600" : "text-red-600";
  const scoreBg = score >= 80 ? "bg-green-100" : score >= 50 ? "bg-amber-100" : "bg-red-100";

  const stats = [
    { label: "Trucks Ready", value: dispatchReadiness.trucksReady, color: "text-green-600", icon: CheckCircle2 },
    { label: "Ready w/ Warnings", value: dispatchReadiness.trucksReadyWithWarnings, color: "text-amber-600", icon: AlertTriangle },
    { label: "Trucks Blocked", value: dispatchReadiness.trucksBlocked, color: "text-red-600", icon: XCircle },
    { label: "Jobs Ready", value: dispatchReadiness.jobsReady, color: "text-green-600", icon: CheckCircle2 },
    { label: "Jobs Blocked (Fleet)", value: dispatchReadiness.jobsBlockedByFleet, color: "text-red-600", icon: Truck },
    { label: "Jobs Blocked (Material)", value: dispatchReadiness.jobsBlockedByMaterial, color: "text-amber-600", icon: AlertTriangle },
    { label: "Jobs Blocked (Equipment)", value: dispatchReadiness.jobsBlockedByEquipment, color: "text-red-600", icon: XCircle },
    { label: "Jobs Awaiting WH Action", value: dispatchReadiness.jobsAwaitingWarehouse, color: "text-amber-600", icon: Wrench },
  ];

  return (
    <Card className="border-2 border-primary/20">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className={`w-24 h-24 rounded-full ${scoreBg} flex items-center justify-center shrink-0`}>
              <span className={`text-3xl font-bold ${scoreColor}`}>{score}%</span>
            </div>
            <div>
              <h2 className="text-xl font-bold">Dispatch Readiness</h2>
              <p className={`font-medium ${scoreColor}`}>
                {score >= 80 ? "Fleet ready for dispatch" : score >= 50 ? "Fleet partially ready" : "Fleet not ready for dispatch"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Fleet Health: <span className="font-medium">{fleetHealth.score}%</span>
              </p>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
            {stats.map(s => (
              <div key={s.label} className="text-center p-2 rounded-lg bg-muted/50">
                <s.icon className={`w-4 h-4 ${s.color} mx-auto mb-1`} />
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}