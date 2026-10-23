import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import {
  ShieldCheck, ShieldAlert, Play, Download, UserPlus, Clock,
  Activity, Users, Bell, RefreshCw, Zap, AlertTriangle, CheckCircle2, Lock,
  AlertOctagon, CopyCheck, FileWarning, Link2, MailWarning,
} from "lucide-react";

export default function CustomerSyncControlPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [watermark, setWatermark] = useState(null);
  const [pendingMerges, setPendingMerges] = useState(0);
  const [customersTotal, setCustomersTotal] = useState(0);
  const [deferredCustomers, setDeferredCustomers] = useState(0);
  const [deferredDependents, setDeferredDependents] = useState(0);
  const [pendingContactRetries, setPendingContactRetries] = useState(0);
  const [hydrateInput, setHydrateInput] = useState("");
  const [lastResult, setLastResult] = useState(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/functions/runServiceTitanCustomerIncrementalSync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "watermark_status" }),
      });
      const data = await res.json();
      setWatermark(data.watermark);
      setPendingMerges(data.pending_merges_count || 0);
      setCustomersTotal(data.customers_total || 0);
      setDeferredCustomers(data.deferred_customers_count || 0);
      setDeferredDependents(data.deferred_dependents_count || 0);
      setPendingContactRetries(data.pending_contact_retries_count || 0);
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to load watermark status", description: err.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const callFunction = async (body) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/functions/runServiceTitanCustomerIncrementalSync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setLastResult(data);
      if (data.error) {
        toast({ variant: "destructive", title: "Action failed", description: data.error });
      } else {
        toast({ title: "Action completed", description: data.summary || data.message || "Success" });
      }
      await fetchStatus();
      return data;
    } catch (err) {
      toast({ variant: "destructive", title: "Action failed", description: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleActivate = () => callFunction({ mode: "activate" });
  const handleRecovery = () => callFunction({ mode: "recovery" });
  const handleHydrate = () => {
    if (!hydrateInput.trim()) return;
    callFunction({ mode: "hydrate", servicetitan_customer_id: hydrateInput.trim() });
  };
  const handleEstimateBackfill = () => callFunction({ mode: "estimate_backfill" });
  const handleVerifyApiCreated = () => callFunction({ mode: "verify_api_created_on" });
  const handleVerifyApiModified = () => callFunction({ mode: "verify_api_modified_on" });

  const strategyLabel = watermark?.sync_strategy === "new_customers_only"
    ? "New Customers Only"
    : watermark?.sync_strategy === "full_historical_backfill"
    ? "Full Historical Backfill"
    : "Not Configured";

  const statusBadge = watermark?.status === "active"
    ? <Badge className="bg-green-600 text-white">Active</Badge>
    : watermark?.status === "disabled"
    ? <Badge variant="destructive">Disabled</Badge>
    : <Badge variant="secondary">Not Activated</Badge>;

  const recoveryWindowBadge = watermark?.recovery_window_status === "completed"
    ? <Badge className="bg-green-600 text-white">Completed</Badge>
    : watermark?.recovery_window_status === "in_progress"
    ? <Badge className="bg-blue-600 text-white">In Progress</Badge>
    : watermark?.recovery_window_status === "failed"
    ? <Badge variant="destructive">Failed</Badge>
    : <Badge variant="secondary">Idle</Badge>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customer Sync Control Panel</h1>
          <p className="text-sm text-muted-foreground">ServiceTitan customer synchronization strategy & watermark</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStatus} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Strategy & Watermark */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Synchronization Strategy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Strategy</Label>
              <p className="font-semibold">{strategyLabel}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Status</Label>
              <div>{statusBadge}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Activation Timestamp</Label>
              <p className="font-semibold text-sm">
                {watermark?.activation_timestamp
                  ? new Date(watermark.activation_timestamp).toLocaleString()
                  : "—"}
              </p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Last Successful Sync</Label>
              <p className="font-semibold text-sm">
                {watermark?.last_successful_sync_at
                  ? new Date(watermark.last_successful_sync_at).toLocaleString()
                  : "—"}
              </p>
            </div>
          </div>

          {/* Recovery Window */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t">
            <div>
              <Label className="text-xs text-muted-foreground">Recovery Window Status</Label>
              <div className="pt-1">{recoveryWindowBadge}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Recovery Window Start</Label>
              <p className="font-semibold text-sm">
                {watermark?.recovery_window_start
                  ? new Date(watermark.recovery_window_start).toLocaleString()
                  : "—"}
              </p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Recovery Window End</Label>
              <p className="font-semibold text-sm">
                {watermark?.recovery_window_end
                  ? new Date(watermark.recovery_window_end).toLocaleString()
                  : "—"}
              </p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Recovery Window Errors</Label>
              <p className="font-semibold text-sm">{watermark?.recovery_window_errors || 0}</p>
            </div>
          </div>

          {!watermark && (
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                No watermark has been activated. Click "Activate Watermark" to establish the go-live timestamp.
                This will NOT import any customers.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleActivate} disabled={actionLoading || watermark?.status === "active"}>
              <ShieldCheck className="h-4 w-4 mr-2" />
              {watermark?.status === "active" ? "Watermark Active" : "Activate Watermark"}
            </Button>
            <Button variant="outline" onClick={handleRecovery} disabled={actionLoading || !watermark || watermark.status !== "active"}>
              <Play className="h-4 w-4 mr-2" />
              Run Recovery Scan
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Webhook Counters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Webhook Event Counters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={CheckCircle2} label="Creates Completed" value={watermark?.webhook_creates_completed || 0} color="text-green-600" />
            <StatCard icon={CopyCheck} label="Updates Completed" value={watermark?.webhook_updates_completed || 0} color="text-blue-600" />
            <StatCard icon={Clock} label="Skipped (Pre-Activation)" value={watermark?.webhook_events_skipped_pre_activation || 0} color="text-gray-600" />
            <StatCard icon={AlertOctagon} label="Deferred" value={watermark?.webhook_events_deferred || 0} color="text-yellow-600" />
            <StatCard icon={AlertTriangle} label="Failed" value={watermark?.webhook_events_failed || 0} color="text-red-600" />
            <StatCard icon={CopyCheck} label="Duplicates Ignored" value={watermark?.webhook_duplicate_events_ignored || 0} color="text-gray-600" />
            <StatCard icon={Activity} label="Total Processed" value={watermark?.webhook_events_processed || 0} color="text-green-600" />
            <StatCard icon={Activity} label="Recovery Processed" value={watermark?.recovery_events_processed || 0} color="text-orange-600" />
          </div>
        </CardContent>
      </Card>

      {/* Import & Deferral Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Imported Since Activation" value={watermark?.customers_imported_since_activation || 0} color="text-blue-600" />
        <StatCard icon={UserPlus} label="Imported On Demand" value={watermark?.customers_imported_on_demand || 0} color="text-purple-600" />
        <StatCard icon={Users} label="Total Local Customers" value={customersTotal} color="text-gray-600" />
        <StatCard icon={Link2} label="Pending Merges" value={pendingMerges} color="text-yellow-600" />
        <StatCard icon={FileWarning} label="Pending Customer Deferrals" value={deferredCustomers} color="text-orange-600" />
        <StatCard icon={FileWarning} label="Pending Dependent Deferrals" value={deferredDependents} color="text-orange-600" />
        <StatCard icon={MailWarning} label="Pending Contact Retries" value={pendingContactRetries} color="text-yellow-600" />
        <StatCard icon={Clock} label="Last New Customer Scan" value={watermark?.last_new_customer_scan_at ? new Date(watermark.last_new_customer_scan_at).toLocaleDateString() : "Never"} color="text-gray-600" />
      </div>

      {/* API Verification */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Live No-Write API Verification
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Verify the transactional customer API response shape without any writes. Zero Customer writes, zero Contact writes, zero watermark advancement.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleVerifyApiCreated} disabled={actionLoading}>
              <Zap className="h-4 w-4 mr-2" />
              Verify createdOnOrAfter
            </Button>
            <Button variant="outline" onClick={handleVerifyApiModified} disabled={actionLoading}>
              <Zap className="h-4 w-4 mr-2" />
              Verify modifiedOnOrAfter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* On-Demand Hydration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            On-Demand Customer Hydration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Fetch a specific ServiceTitan customer by ID and create it locally with contacts.
            Used when a job, appointment, estimate, invoice, or membership references a customer that doesn't exist locally.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="ServiceTitan Customer ID (e.g. 1000123)"
              value={hydrateInput}
              onChange={(e) => setHydrateInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleHydrate()}
            />
            <Button onClick={handleHydrate} disabled={actionLoading || !hydrateInput.trim()}>
              <Download className="h-4 w-4 mr-2" />
              Hydrate
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Historical Backfill (DISABLED) */}
      <Card className="border-muted">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Historical Backfill — Disabled
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              The historical backfill is intentionally disabled. It requires Owner confirmation and
              must not start automatically. The readiness report must be reviewed before enabling.
            </AlertDescription>
          </Alert>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleEstimateBackfill} disabled={actionLoading}>
              <Zap className="h-4 w-4 mr-2" />
              Estimate Scope
            </Button>
            <Button variant="secondary" disabled className="opacity-50 cursor-not-allowed">
              <Lock className="h-4 w-4 mr-2" />
              Start Historical Backfill (Disabled)
            </Button>
          </div>
          {watermark?.backfill_scope_estimate != null && watermark.backfill_scope_estimate >= 0 && (
            <p className="text-sm text-muted-foreground">
              Estimated scope: {watermark.backfill_scope_estimate} customers
            </p>
          )}
          <div>
            <Label className="text-xs text-muted-foreground">Backfill Status</Label>
            <p className="font-semibold text-sm capitalize">{(watermark?.backfill_status || "never_started").replace(/_/g, " ")}</p>
          </div>
        </CardContent>
      </Card>

      {/* Last Action Result */}
      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Last Action Result</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-64">
              {JSON.stringify(lastResult, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`h-4 w-4 ${color || "text-gray-600"}`} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className={`text-xl font-bold ${color || "text-gray-900"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}