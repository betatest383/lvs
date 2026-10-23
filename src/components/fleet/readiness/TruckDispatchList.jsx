import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2, XCircle, AlertTriangle, User, Calendar,
  PackageX, ShieldAlert, Truck, ChevronRight, ShieldCheck, ClipboardCheck,
} from "lucide-react";

const STATUS_CONFIG = {
  ready: { label: "Ready to Dispatch", color: "text-green-600", bg: "bg-green-100", border: "border-green-200", icon: CheckCircle2, dot: "bg-green-500" },
  warning: { label: "Ready with Warnings", color: "text-amber-600", bg: "bg-amber-100", border: "border-amber-200", icon: AlertTriangle, dot: "bg-amber-500" },
  blocked: { label: "Dispatch Blocked", color: "text-red-600", bg: "bg-red-100", border: "border-red-200", icon: XCircle, dot: "bg-red-500" },
};

export default function TruckDispatchList({ trucks }) {
  const [selected, setSelected] = useState(null);

  if (trucks.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center">
          <Truck className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="font-medium">No trucks match this filter</p>
          <p className="text-sm text-muted-foreground mt-1">Try clearing the active filter.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {trucks.map(td => (
          <TruckCard key={td.truck.id} td={td} onClick={() => setSelected(td)} />
        ))}
      </div>
      {selected && <TruckDetailDialog td={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function TruckCard({ td, onClick }) {
  const cfg = STATUS_CONFIG[td.dispatchStatus] || STATUS_CONFIG.blocked;

  return (
    <Card className={`hover:shadow-md transition-shadow cursor-pointer border ${cfg.border}`} onClick={onClick}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
            <p className="font-bold">Truck {td.truck.truck_number}</p>
          </div>
          <div className={`w-11 h-11 rounded-full ${cfg.bg} flex items-center justify-center shrink-0`}>
            <span className={`text-sm font-bold ${cfg.color}`}>{td.score}%</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{td.truck.vehicle_name || td.truck.make} {td.truck.model}</p>

        <div className="flex items-center gap-2 text-xs">
          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          {td.isShared ? (
            <Badge variant="outline" className="text-blue-600 border-blue-300">Shared Vehicle</Badge>
          ) : td.assignedTech ? (
            <span className="font-medium">{td.assignedTech}</span>
          ) : (
            <Badge variant="outline" className="text-red-600 border-red-300">No technician</Badge>
          )}
        </div>

        {/* Top reason */}
        {td.blockingReasons.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-red-600">
            <XCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{td.blockingReasons[0]}</span>
            {td.blockingReasons.length > 1 && (
              <Badge variant="outline" className="text-red-600 border-red-300">+{td.blockingReasons.length - 1}</Badge>
            )}
          </div>
        )}
        {td.blockingReasons.length === 0 && td.warningReasons.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-amber-600">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{td.warningReasons[0]}</span>
            {td.warningReasons.length > 1 && (
              <Badge variant="outline" className="text-amber-600 border-amber-300">+{td.warningReasons.length - 1}</Badge>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-1 border-t">
          <Badge className={`${cfg.bg} ${cfg.color} hover:${cfg.bg}`}>{cfg.label}</Badge>
          <span className="text-xs text-muted-foreground flex items-center gap-1">Details <ChevronRight className="w-3 h-3" /></span>
        </div>
      </CardContent>
    </Card>
  );
}

function TruckDetailDialog({ td, onClose }) {
  const cfg = STATUS_CONFIG[td.dispatchStatus] || STATUS_CONFIG.blocked;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${cfg.dot}`} />
            Truck {td.truck.truck_number} — Readiness Checklist
            <Badge className={`${cfg.bg} ${cfg.color} hover:${cfg.bg}`}>{cfg.label}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Truck info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Vehicle:</span> {td.truck.vehicle_name || td.truck.make} {td.truck.model}</div>
            <div><span className="text-muted-foreground">Type:</span> {td.truck.vehicle_type}</div>
            <div><span className="text-muted-foreground">Technician:</span> {td.isShared ? "Shared Vehicle" : td.assignedTech || "Unassigned"}</div>
            <div><span className="text-muted-foreground">Status:</span> {td.truck.status}</div>
            <div className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-muted-foreground">Last Insp:</span> {td.lastInspection || "None"}</div>
            <div className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-muted-foreground">Next Insp:</span> {td.nextInspection || "None"}</div>
            <div className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-muted-foreground">Daily Safety:</span> {td.lastDailySafetyCheck || "None"}</div>
            <div className="flex items-center gap-1"><ClipboardCheck className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-muted-foreground">Weekly Insp:</span> {td.lastWeeklyInspection || "None"}</div>
          </div>

          {/* Score */}
          <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
            <div className={`w-16 h-16 rounded-full ${cfg.bg} flex items-center justify-center`}>
              <span className={`text-xl font-bold ${cfg.color}`}>{td.score}%</span>
            </div>
            <p className="text-sm">{td.checks.filter(c => c.ok).length} of {td.checks.length} checks passed</p>
          </div>

          {/* Checklist */}
          <div className="space-y-2">
            <p className="font-medium text-sm">Readiness Checklist</p>
            {td.checks.map(c => (
              <div key={c.label} className="flex items-center gap-3 p-2 rounded-lg border">
                {c.ok ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" /> : <XCircle className="w-5 h-5 text-red-500 shrink-0" />}
                <span className="text-sm">{c.label}</span>
              </div>
            ))}
          </div>

          {/* Blocking reasons */}
          {td.blockingReasons.length > 0 && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm font-medium text-red-800 flex items-center gap-2"><XCircle className="w-4 h-4" /> Blocking Issues</p>
              {td.blockingReasons.map((r, i) => <p key={i} className="text-xs text-red-700 mt-1">• {r}</p>)}
            </div>
          )}

          {/* Warnings */}
          {td.warningReasons.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-sm font-medium text-amber-800 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Warnings</p>
              {td.warningReasons.map((r, i) => <p key={i} className="text-xs text-amber-700 mt-1">• {r}</p>)}
            </div>
          )}

          {/* Open defects */}
          {td.openDefects.length > 0 && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm font-medium text-red-800 flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> Open Defects ({td.openDefects.length})</p>
            </div>
          )}

          {/* Outstanding returns */}
          {td.outstandingReturns.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-sm font-medium text-amber-800 flex items-center gap-2"><PackageX className="w-4 h-4" /> Outstanding Returns ({td.outstandingReturns.length})</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button size="sm" variant="outline" asChild>
              <Link to={`/fleet/trucks/${td.truck.id}`}>View Truck Profile</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/warehouse/morning-departure">WH-105 Departure</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/equipment/assign">Assign Equipment</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/warehouse/transfer-sheets">Material Transfers</Link>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}