import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertTriangle, PackageX, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";

export function TruckReadinessTab({ truck }) {
  const [data, setData] = useState({ consumables: [], transfers: [], equipment: [], assignments: [], audits: [], returns: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [reqs, trans, equip, assigns, audits, returns] = await Promise.all([
          base44.entities.ConsumableReplenishment.list('-created_date', 50),
          base44.entities.MaterialTransferSheet.list('-created_date', 50),
          base44.entities.TechEquipment.list('-created_date', 200),
          base44.entities.VehicleAssignment.list('-created_date', 50),
          base44.entities.ManagementAudit.list('-created_date', 50),
          base44.entities.MaterialReturn.list('-created_date', 100),
        ]);
        setData({
          consumables: reqs.filter(r => r.truck_number === truck.truck_number),
          transfers: trans.filter(t => t.truck_number === truck.truck_number),
          equipment: equip.filter(e => e.truck_number === truck.truck_number),
          assignments: assigns.filter(a => a.truck_number === truck.truck_number),
          audits: audits.filter(a => a.truck_number === truck.truck_number),
          returns: returns.filter(r => r.truck_number === truck.truck_number),
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [truck]);

  if (loading) return <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  const consumablesOk = data.consumables.length > 0 && data.consumables.every(r => r.status === "Completed");
  const consumablesPending = data.consumables.some(r => r.status !== "Completed");
  const materialOk = data.transfers.length > 0 && data.transfers.every(t => t.status === "Issued" || t.status === "Closed");
  const materialPending = data.transfers.some(t => t.status === "Draft" || t.status === "Submitted");
  const equipmentOk = data.equipment.length > 0;
  const assignmentOk = truck.current_assignment_status === "Available" || truck.current_assignment_status === "Assigned";
  const maintenanceOk = truck.status !== "Maintenance" && truck.status !== "Out of Service";
  const safetyOk = data.audits.length > 0 ? data.audits.every(a => (a.overall_score || 0) >= 80) : true;

  // Outstanding returns check — truck cannot reach 100% readiness until returns are processed or manager override applied
  const outstandingReturns = data.returns.filter(r => r.status !== "Closed" && r.status !== "Verified" && !r.manager_override_applied);
  const returnsOk = outstandingReturns.length === 0;
  const hasOverride = data.returns.some(r => r.manager_override_applied && r.status !== "Closed");

  const checks = [
    { label: "Consumables Request", ok: consumablesOk, pending: consumablesPending, detail: consumablesOk ? "All complete" : consumablesPending ? "Pending fulfillment" : "No requests" },
    { label: "Material Transfer", ok: materialOk, pending: materialPending, detail: materialOk ? "Issued" : materialPending ? "Pending" : "No transfers" },
    { label: "Equipment", ok: equipmentOk, detail: equipmentOk ? `${data.equipment.length} items assigned` : "No equipment" },
    { label: "Vehicle Assignment", ok: assignmentOk, detail: truck.current_assignment_status },
    { label: "Maintenance", ok: maintenanceOk, detail: truck.status === "Maintenance" ? "In Maintenance" : truck.status === "Out of Service" ? "Out of Service" : "Operational" },
    { label: "Safety Inspection", ok: safetyOk, detail: data.audits.length > 0 ? `${data.audits.length} audits` : "No audits" },
    { label: "Outstanding Returns", ok: returnsOk, detail: returnsOk ? (hasOverride ? "Override applied" : "All processed") : `${outstandingReturns.length} pending` },
  ];

  const passedCount = checks.filter(c => c.ok).length;
  const readinessScore = Math.round((passedCount / checks.length) * 100);

  const scoreColor = readinessScore >= 80 ? "text-green-600" : readinessScore >= 50 ? "text-amber-600" : "text-red-600";
  const scoreBg = readinessScore >= 80 ? "bg-green-100" : readinessScore >= 50 ? "bg-amber-100" : "bg-red-100";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Overall Readiness Score</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className={`w-20 h-20 rounded-full ${scoreBg} flex items-center justify-center`}>
              <span className={`text-2xl font-bold ${scoreColor}`}>{readinessScore}%</span>
            </div>
            <div>
              <p className={`font-medium ${scoreColor}`}>
                {readinessScore >= 80 ? "Ready for Deployment" : readinessScore >= 50 ? "Partially Ready" : "Not Ready"}
              </p>
              <p className="text-sm text-muted-foreground">{passedCount} of {checks.length} checks passed</p>
              {outstandingReturns.length > 0 && (
                <p className="text-xs text-amber-600 mt-1">Truck cannot reach 100% until {outstandingReturns.length} outstanding return(s) are processed or a manager override is applied.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Readiness Checklist</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {checks.map((c) => (
            <div key={c.label} className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                {c.ok ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : c.pending ? <AlertTriangle className="h-5 w-5 text-amber-600" /> : <XCircle className="h-5 w-5 text-red-500" />}
                <div>
                  <p className="font-medium text-sm">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Outstanding Returns Detail */}
      {outstandingReturns.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><PackageX className="h-4 w-4 text-amber-600" /> Outstanding Returns</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {outstandingReturns.map(r => (
              <Link key={r.id} to={`/warehouse/material-returns/${r.id}`}>
                <div className="flex items-center justify-between p-2 rounded-lg bg-white border hover:bg-amber-50 transition-colors">
                  <div>
                    <p className="text-sm font-medium">{r.return_id}</p>
                    <p className="text-xs text-muted-foreground">{r.technician} · {r.status}</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}