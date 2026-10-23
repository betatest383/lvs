import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import {
  Shield, ShieldCheck, ShieldAlert, AlertTriangle, Search,
  Download, Play, Loader2, ChevronDown, ChevronRight,
  AlertCircle, Info, FileWarning, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

const SEVERITY_CONFIG = {
  critical: { color: "bg-red-600 text-white", icon: AlertCircle, label: "Critical" },
  high: { color: "bg-orange-500 text-white", icon: AlertTriangle, label: "High" },
  medium: { color: "bg-yellow-500 text-white", icon: AlertTriangle, label: "Medium" },
  low: { color: "bg-blue-500 text-white", icon: Info, label: "Low" },
  informational: { color: "bg-slate-500 text-white", icon: Info, label: "Info" },
};

const DOMAIN_OPTIONS = [
  { value: "all", label: "All Domains" },
  { value: "customer", label: "Customer" },
  { value: "job", label: "Job" },
  { value: "appointment", label: "Appointment" },
  { value: "technician", label: "Technician / Employee" },
  { value: "webhook_event", label: "Webhook Event" },
  { value: "timeline", label: "Timeline" },
  { value: "replay", label: "Replay" },
  { value: "cross-domain", label: "Cross-Domain" },
];

export default function ServiceTitanIntegrityAudit() {
  const { toast } = useToast();
  const [auditMode, setAuditMode] = useState("summary");
  const [loading, setLoading] = useState(false);
  const [auditResult, setAuditResult] = useState(null);

  // Record mode filters
  const [recordDomain, setRecordDomain] = useState("customer");
  const [recordLocalId, setRecordLocalId] = useState("");
  const [recordStId, setRecordStId] = useState("");

  // Issue filters
  const [domainFilter, setDomainFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIssues, setExpandedIssues] = useState(new Set());
  const [categoryFilter, setCategoryFilter] = useState("all");

  const runAudit = async () => {
    setLoading(true);
    setAuditResult(null);
    try {
      const payload = { mode: auditMode };
      if (auditMode === "record") {
        payload.domain = recordDomain;
        payload.local_record_id = recordLocalId || undefined;
        payload.servicetitan_id = recordStId || undefined;
      }
      const response = await base44.functions.invoke("runServiceTitanIntegrityAudit", payload);
      setAuditResult(response.data);
      toast({
        title: "Audit Complete",
        description: `Found ${response.data.issue_counts.critical} critical, ${response.data.issue_counts.high} high issues`,
      });
    } catch (error) {
      toast({
        title: "Audit Failed",
        description: error.message || "Failed to run integrity audit",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const exportResults = () => {
    if (!auditResult) return;
    const blob = new Blob([JSON.stringify(auditResult, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `st-integrity-audit-${auditResult.audit_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleIssue = (fingerprint) => {
    setExpandedIssues(prev => {
      const next = new Set(prev);
      if (next.has(fingerprint)) next.delete(fingerprint);
      else next.add(fingerprint);
      return next;
    });
  };

  const filteredIssues = useMemo(() => {
    if (!auditResult?.issues) return [];
    return auditResult.issues.filter(issue => {
      if (categoryFilter !== "all" && (issue.category || "synchronization") !== categoryFilter) return false;
      if (domainFilter !== "all" && issue.domain !== domainFilter) return false;
      if (severityFilter !== "all" && issue.severity !== severityFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matches = issue.fingerprint.toLowerCase().includes(q) ||
          issue.check_name.toLowerCase().includes(q) ||
          issue.local_record_id.toLowerCase().includes(q) ||
          issue.servicetitan_id.toLowerCase().includes(q) ||
          issue.current_state.toLowerCase().includes(q) ||
          issue.relationship.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [auditResult, domainFilter, severityFilter, searchQuery, categoryFilter]);

  const syncIssues = useMemo(() => filteredIssues.filter(i => (i.category || "synchronization") === "synchronization"), [filteredIssues]);
  const legacyIssues = useMemo(() => filteredIssues.filter(i => (i.category || "synchronization") === "legacy_migration"), [filteredIssues]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Shield className="w-7 h-7 text-blue-600" />
              ServiceTitan Integrity Audit
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Read-only cross-domain synchronization integrity verification
            </p>
          </div>
          <div className="flex items-center gap-2">
            {auditResult && (
              <Button variant="outline" size="sm" onClick={exportResults}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            )}
            <Button
              onClick={runAudit}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              Run Audit
            </Button>
          </div>
        </div>

        {/* Audit Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Audit Configuration</CardTitle>
            <CardDescription>Select the audit mode and scope</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Audit Mode</Label>
                <Select value={auditMode} onValueChange={setAuditMode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="summary">Summary (Critical + High only)</SelectItem>
                    <SelectItem value="full">Full (All severities)</SelectItem>
                    <SelectItem value="record">Record (Targeted single record)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {auditMode === "record" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4">
                <div className="space-y-2">
                  <Label>Domain</Label>
                  <Select value={recordDomain} onValueChange={setRecordDomain}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="job">Job</SelectItem>
                      <SelectItem value="appointment">Appointment</SelectItem>
                      <SelectItem value="technician">Technician / Employee</SelectItem>
                      <SelectItem value="webhook_event">Webhook Event</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Local Record ID</Label>
                  <Input
                    placeholder="e.g. 6a5eca80..."
                    value={recordLocalId}
                    onChange={(e) => setRecordLocalId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>ServiceTitan ID</Label>
                  <Input
                    placeholder="e.g. ST-CUST-001"
                    value={recordStId}
                    onChange={(e) => setRecordStId(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Read-only audit — no records will be created, updated, deleted, or relinked.</span>
            </div>
          </CardContent>
        </Card>

        {/* Audit Results */}
        {auditResult && (
          <>
            {/* Status Banners */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StatusBanner
                title="Integrity Status"
                status={auditResult.integrity_status}
                counts={auditResult.sync_issue_counts}
              />
              <StatusBanner
                title="Migration Status"
                status={auditResult.migration_status}
                migrationSummary={auditResult.migration_summary}
              />
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <SummaryCard
                icon={ShieldCheck}
                label="Checks Passed"
                value={auditResult.checks.filter(c => c.passed).length}
                total={auditResult.checks.length}
                color="text-green-600"
              />
              <SummaryCard
                icon={AlertCircle}
                label="Sync Critical"
                value={auditResult.sync_issue_counts?.critical ?? 0}
                color="text-red-600"
              />
              <SummaryCard
                icon={AlertTriangle}
                label="Sync High"
                value={auditResult.sync_issue_counts?.high ?? 0}
                color="text-orange-600"
              />
              <SummaryCard
                icon={AlertTriangle}
                label="Sync Medium"
                value={auditResult.sync_issue_counts?.medium ?? 0}
                color="text-yellow-600"
              />
              <SummaryCard
                icon={Info}
                label="Legacy Records"
                value={auditResult.migration_summary?.total_migration_opportunities ?? 0}
                color="text-blue-600"
              />
              <SummaryCard
                icon={Info}
                label="Total Issues"
                value={auditResult.issue_counts.critical + auditResult.issue_counts.high + auditResult.issue_counts.medium + auditResult.issue_counts.low + auditResult.issue_counts.informational}
                color="text-slate-600"
              />
            </div>

            {/* Records Scanned */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Records Scanned</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-sm">
                  <RecordStat label="Customers" value={auditResult.records_scanned.customers} />
                  <RecordStat label="Jobs" value={auditResult.records_scanned.jobs} />
                  <RecordStat label="Appointments" value={auditResult.records_scanned.appointments} />
                  <RecordStat label="Employees" value={auditResult.records_scanned.employees} />
                  <RecordStat label="Webhook Events" value={auditResult.records_scanned.webhook_events} />
                  <RecordStat label="Timelines" value={auditResult.records_scanned.timelines} />
                  <RecordStat label="Replays" value={auditResult.records_scanned.replays} />
                </div>
                {auditResult.partial_failures?.length > 0 && (
                  <div className="mt-4 text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
                    <div className="font-semibold mb-1">Partial Failures ({auditResult.partial_failures.length})</div>
                    <ul className="list-disc list-inside space-y-1">
                      {auditResult.partial_failures.map((pf, i) => (
                        <li key={i}>{pf}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Check Results */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Check Results</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {auditResult.checks.map((check, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3",
                        check.passed ? "border-green-200 bg-green-50/50" :
                          check.error ? "border-red-200 bg-red-50/50" :
                            "border-amber-200 bg-amber-50/50"
                      )}
                    >
                      {check.passed ? (
                        <ShieldCheck className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      ) : check.error ? (
                        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{check.name}</span>
                          <Badge variant="outline" className="text-xs">{check.domain}</Badge>
                          <Badge variant="secondary" className="text-xs">{check.records_scanned} scanned</Badge>
                          {check.issues_found > 0 && (
                            <Badge variant="destructive" className="text-xs">{check.issues_found} issues</Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{check.description}</p>
                        {check.error && (
                          <p className="text-xs text-red-600 mt-1">Error: {check.error}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recommendations */}
            {auditResult.recommendations?.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recommendations</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {auditResult.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <FileWarning className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Issue Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Issue Filters</CardTitle>
                <div className="flex flex-col md:flex-row gap-2 mt-3">
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-full md:w-48">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="synchronization">Synchronization</SelectItem>
                      <SelectItem value="legacy_migration">Legacy Migration</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={domainFilter} onValueChange={setDomainFilter}>
                    <SelectTrigger className="w-full md:w-48">
                      <SelectValue placeholder="Domain" />
                    </SelectTrigger>
                    <SelectContent>
                      {DOMAIN_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={severityFilter} onValueChange={setSeverityFilter}>
                    <SelectTrigger className="w-full md:w-40">
                      <SelectValue placeholder="Severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Severities</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="informational">Informational</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Search by ID, check name, or description..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* SECTION 1: Synchronization Integrity */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-orange-600" />
                  <CardTitle className="text-base">Section 1: Synchronization Integrity</CardTitle>
                  <Badge variant="destructive" className="text-xs">{syncIssues.length}</Badge>
                </div>
                <CardDescription>
                  Active synchronization defects — duplicate identities, broken relationships, corrupt mappings,
                  replay/retry failures, stale overwrites, timeline/conflict corruption, field ownership violations.
                  These affect the PASS / FAIL result.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {syncIssues.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <ShieldCheck className="w-12 h-12 mx-auto mb-2 text-green-400" />
                    <p>No synchronization integrity issues found</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {syncIssues.slice(0, 200).map((issue) => (
                      <IssueRow key={issue.fingerprint} issue={issue} expanded={expandedIssues.has(issue.fingerprint)} onToggle={toggleIssue} />
                    ))}
                    {syncIssues.length > 200 && (
                      <div className="text-center text-sm text-slate-500 py-2">
                        Showing 200 of {syncIssues.length} issues. Refine filters to see more.
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* SECTION 2: Legacy Migration Opportunities */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Info className="w-5 h-5 text-blue-500" />
                  <CardTitle className="text-base">Section 2: Legacy Migration Opportunities</CardTitle>
                  <Badge variant="secondary" className="text-xs">{legacyIssues.length}</Badge>
                </div>
                <CardDescription>
                  Historical records created before ServiceTitan synchronization existed — missing ServiceTitan IDs,
                  legacy records with valid local relationships, historical records needing migration.
                  These do NOT affect the PASS / FAIL result.
                </CardDescription>
                {auditResult.migration_summary && auditResult.migration_summary.total_migration_opportunities > 0 && (
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="p-2 rounded-lg bg-blue-50 text-center">
                      <div className="text-lg font-bold text-blue-700">{auditResult.migration_summary.legacy_customers}</div>
                      <div className="text-xs text-slate-500">Legacy Customers</div>
                    </div>
                    <div className="p-2 rounded-lg bg-blue-50 text-center">
                      <div className="text-lg font-bold text-blue-700">{auditResult.migration_summary.legacy_jobs}</div>
                      <div className="text-xs text-slate-500">Legacy Jobs</div>
                    </div>
                    <div className="p-2 rounded-lg bg-blue-50 text-center">
                      <div className="text-lg font-bold text-blue-700">{auditResult.migration_summary.legacy_appointments}</div>
                      <div className="text-xs text-slate-500">Legacy Appointments</div>
                    </div>
                    <div className="p-2 rounded-lg bg-blue-50 text-center">
                      <div className="text-xs font-medium text-slate-600">{auditResult.migration_summary.estimated_effort}</div>
                      <div className="text-xs text-slate-500 mt-1">Estimated Effort</div>
                    </div>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {legacyIssues.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <ShieldCheck className="w-12 h-12 mx-auto mb-2 text-green-400" />
                    <p>No legacy migration opportunities found</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {legacyIssues.slice(0, 200).map((issue) => (
                      <IssueRow key={issue.fingerprint} issue={issue} expanded={expandedIssues.has(issue.fingerprint)} onToggle={toggleIssue} />
                    ))}
                    {legacyIssues.length > 200 && (
                      <div className="text-center text-sm text-slate-500 py-2">
                        Showing 200 of {legacyIssues.length} issues. Refine filters to see more.
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {!auditResult && !loading && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Shield className="w-16 h-16 text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-600">No audit run yet</h3>
              <p className="text-sm text-slate-400 mt-1 max-w-md">
                Click "Run Audit" to perform a read-only cross-domain integrity check
                across Customer, Job, Appointment, Technician, and webhook infrastructure.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, total, color }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={cn("w-4 h-4", color)} />
          <span className="text-xs text-slate-500">{label}</span>
        </div>
        <div className="text-2xl font-bold text-slate-900">
          {value}
          {total !== undefined && (
            <span className="text-sm text-slate-400 font-normal"> / {total}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RecordStat({ label, value }) {
  return (
    <div className="text-center p-2 rounded-lg bg-slate-50">
      <div className="text-xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function IssueDetail({ label, value, mono }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <span className="text-xs font-medium text-slate-500 col-span-1">{label}</span>
      <span className={cn("text-xs text-slate-700 col-span-2 break-all", mono && "font-mono")}>
        {value}
      </span>
    </div>
  );
}

function IssueRow({ issue, expanded, onToggle }) {
  const sevConfig = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.low;
  const Icon = sevConfig.icon;
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => onToggle(issue.fingerprint)}
        className="w-full flex items-start gap-3 p-3 hover:bg-slate-50 text-left"
      >
        <div className={cn("w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5", sevConfig.color)}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{issue.check_name}</span>
            <Badge variant="outline" className="text-xs">{issue.domain}</Badge>
            <Badge className={cn("text-xs", sevConfig.color)}>{sevConfig.label}</Badge>
            {issue.category === "legacy_migration" && (
              <Badge variant="secondary" className="text-xs text-blue-700">Legacy</Badge>
            )}
            {issue.safe_to_auto_fix && (
              <Badge variant="secondary" className="text-xs text-green-700">Auto-fixable</Badge>
            )}
          </div>
          <p className="text-xs text-slate-600 mt-1">{issue.current_state}</p>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" />
        )}
      </button>
      {expanded && (
        <div className="border-t bg-slate-50/50 p-3 space-y-2 text-sm">
          <IssueDetail label="Category" value={issue.category || "synchronization"} />
          <IssueDetail label="Check" value={issue.check_name} />
          <IssueDetail label="Domain" value={issue.domain} />
          <IssueDetail label="Record Type" value={issue.record_type} />
          <IssueDetail label="Local Record ID" value={issue.local_record_id || "—"} />
          <IssueDetail label="ServiceTitan ID" value={issue.servicetitan_id || "—"} />
          <IssueDetail label="Relationship" value={issue.relationship} />
          <IssueDetail label="Current State" value={issue.current_state} />
          <IssueDetail label="Expected State" value={issue.expected_state} />
          <IssueDetail label="Recommended Correction" value={issue.recommended_correction} />
          <IssueDetail label="Safe to Auto-Fix" value={issue.safe_to_auto_fix ? "Yes" : "No"} />
          <IssueDetail label="Fingerprint" value={issue.fingerprint} mono />
        </div>
      )}
    </div>
  );
}

function StatusBanner({ title, status, counts, migrationSummary }) {
  const config = {
    PASS: { color: "bg-green-600", icon: ShieldCheck, label: "PASS" },
    PASS_WITH_WARNINGS: { color: "bg-yellow-500", icon: AlertTriangle, label: "PASS WITH WARNINGS" },
    FAIL: { color: "bg-red-600", icon: AlertCircle, label: "FAIL" },
    NO_MIGRATION_NEEDED: { color: "bg-green-600", icon: ShieldCheck, label: "NO MIGRATION NEEDED" },
    MIGRATION_RECOMMENDED: { color: "bg-blue-500", icon: Info, label: "MIGRATION RECOMMENDED" },
    MIGRATION_REQUIRED: { color: "bg-orange-500", icon: AlertTriangle, label: "MIGRATION REQUIRED" },
  };
  const cfg = config[status] || config.PASS;
  const Icon = cfg.icon;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", cfg.color)}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-slate-500">{title}</div>
            <div className="text-lg font-bold text-slate-900">{cfg.label}</div>
          </div>
          {counts && (
            <div className="flex gap-3 text-xs">
              {counts.critical > 0 && <span className="text-red-600 font-medium">{counts.critical} critical</span>}
              {counts.high > 0 && <span className="text-orange-600 font-medium">{counts.high} high</span>}
              {counts.medium > 0 && <span className="text-yellow-600 font-medium">{counts.medium} medium</span>}
              {counts.critical === 0 && counts.high === 0 && counts.medium === 0 && (
                <span className="text-green-600 font-medium">No sync defects</span>
              )}
            </div>
          )}
          {migrationSummary && migrationSummary.total_migration_opportunities > 0 && (
            <div className="text-xs text-right">
              <div className="font-bold text-blue-700">{migrationSummary.total_migration_opportunities}</div>
              <div className="text-slate-500">legacy records</div>
            </div>
          )}
          {migrationSummary && migrationSummary.total_migration_opportunities === 0 && (
            <div className="text-xs text-green-600 font-medium">All records synced</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}