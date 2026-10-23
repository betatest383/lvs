import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Download, RefreshCw, Settings, AlertTriangle, CheckCircle2, Clock, Package, Building2, Boxes, TrendingUp, Activity, ShieldCheck, RotateCcw, FileWarning } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'awaiting_review', label: 'Awaiting Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'partially_posted', label: 'Partially Posted' },
  { value: 'completed', label: 'Completed' },
  { value: 'abandoned', label: 'Abandoned' },
];

function KPICard({ icon: Icon, label, value, suffix, target, status }) {
  const isOnTarget = target != null && value >= target;
  const isOverThreshold = target != null && target === 0 && value > 0;
  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${isOverThreshold ? 'text-destructive' : isOnTarget ? 'text-green-600' : 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {value}{suffix}
        </div>
        {target != null && (
          <p className="text-xs text-muted-foreground mt-1">
            Target: {target}{suffix}
          </p>
        )}
        {status && <p className="text-xs text-muted-foreground mt-1">{status}</p>}
      </CardContent>
    </Card>
  );
}

export default function WarehouseSetupKPIs() {
  const { toast } = useToast();
  const [kpis, setKpis] = useState(null);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    status: '', employee: '', warehouse: '', date_from: '', date_to: '',
  });

  const fetchKPIs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = {};
      if (filters.status) payload.status = filters.status;
      if (filters.employee) payload.employee = filters.employee;
      if (filters.warehouse) payload.warehouse = filters.warehouse;
      if (filters.date_from) payload.date_from = filters.date_from;
      if (filters.date_to) payload.date_to = filters.date_to;
      const res = await base44.functions.invoke('getWarehouseSetupKPIs', payload);
      const data = res.data || res;
      if (data.error) throw new Error(data.error);
      setKpis(data.kpis);
      setSessionSummary(data.session_summary);
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Failed to load KPIs';
      setError(msg);
      toast({ title: 'KPI Load Error', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => { fetchKPIs(); }, []);

  const handleExport = () => {
    if (!kpis) return;
    const rows = [
      ['KPI', 'Value', 'Total', 'Percentage', 'Target'],
      ...Object.entries(kpis).map(([key, k]) => [
        key.replace(/_/g, ' '),
        k.value ?? '',
        k.total ?? k.counted ?? '',
        k.pct ?? '',
        k.target ?? '',
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `warehouse-setup-kpis-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exported', description: 'KPIs exported to CSV' });
  };

  const handleConfigureTarget = async (key) => {
    const target = prompt(`Set target for "${key.replace(/_/g, ' ')}":\n(Enter a number)`);
    if (target === null) return;
    const num = parseFloat(target);
    if (isNaN(num)) {
      toast({ title: 'Invalid target', variant: 'destructive' });
      return;
    }
    try {
      const res = await base44.functions.invoke('getWarehouseSetupKPIs', {
        action: 'configure_target',
        target_key: key,
        target_value: num,
      });
      const data = res.data || res;
      if (data.error) throw new Error(data.error);
      toast({ title: 'Target saved', description: `${key} target set to ${num}` });
      fetchKPIs();
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      toast({ title: 'Save failed', description: msg, variant: 'destructive' });
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <p>{error}</p>
            </div>
            <Button className="mt-4" onClick={fetchKPIs} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" /> Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Warehouse Setup KPIs</h1>
          <p className="text-sm text-muted-foreground">Server-calculated metrics — no direct entity access required</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchKPIs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!kpis}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={filters.status} onValueChange={v => setFilters(f => ({ ...f, status: v === 'all' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => <SelectItem key={o.value || 'all'} value={o.value || 'all'}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Employee Email</Label>
              <Input placeholder="e.g. Matt@..." value={filters.employee} onChange={e => setFilters(f => ({ ...f, employee: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Warehouse ID</Label>
              <Input placeholder="Warehouse ID" value={filters.warehouse} onChange={e => setFilters(f => ({ ...f, warehouse: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Date From</Label>
              <Input type="date" value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Date To</Label>
              <Input type="date" value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} />
            </div>
          </div>
          <Button className="mt-3" size="sm" onClick={fetchKPIs} disabled={loading}>Apply Filters</Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : kpis ? (
        <>
          {/* KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <KPICard icon={CheckCircle2} label="Overall Completion" value={kpis.overall_completion_pct?.value ?? 0} suffix="%" target={kpis.overall_completion_pct?.target} />
            <KPICard icon={Building2} label="Locations Created" value={kpis.locations_created?.value ?? 0} target={kpis.locations_created?.target} />
            <KPICard icon={Boxes} label="Bins Created" value={kpis.bins_created?.value ?? 0} target={kpis.bins_created?.target} />
            <KPICard icon={Package} label="Items Counted" value={kpis.items_counted?.value ?? 0} status={`of ${kpis.items_counted?.total ?? 0} (${kpis.items_counted?.pct ?? 0}%)`} target={kpis.items_counted?.target} />
            <KPICard icon={Boxes} label="Items Assigned to Bins" value={kpis.items_assigned_to_bins?.value ?? 0} status={`of ${kpis.items_assigned_to_bins?.total ?? 0} (${kpis.items_assigned_to_bins?.pct ?? 0}%)`} target={kpis.items_assigned_to_bins?.target} />
            <KPICard icon={CheckCircle2} label="Items Posted" value={kpis.items_posted?.value ?? 0} status={`of ${kpis.items_posted?.counted ?? 0} counted (${kpis.items_posted?.pct ?? 0}%)`} target={kpis.items_posted?.target} />
            <KPICard icon={Clock} label="Sessions Awaiting Approval" value={kpis.sessions_awaiting_approval?.value ?? 0} target={kpis.sessions_awaiting_approval?.target} />
            <KPICard icon={AlertTriangle} label="Partial / Failed Sessions" value={kpis.partial_and_failed_sessions?.value ?? 0} status={`${kpis.partial_and_failed_sessions?.failed_items ?? 0} failed items`} target={kpis.partial_and_failed_sessions?.target} />
            <KPICard icon={TrendingUp} label="Items / Hour" value={kpis.items_per_hour?.value ?? 0} target={kpis.items_per_hour?.target} />
            <KPICard icon={Clock} label="Avg Session Duration" value={kpis.avg_session_duration_minutes?.value ?? 0} suffix=" min" target={kpis.avg_session_duration_minutes?.target} />
            <KPICard icon={FileWarning} label="Quantity Variance Rate" value={kpis.quantity_variance_rate_pct?.value ?? 0} suffix="%" target={kpis.quantity_variance_rate_pct?.target} />
            <KPICard icon={AlertTriangle} label="Total Absolute Variance" value={kpis.total_absolute_variance?.value ?? 0} target={kpis.total_absolute_variance?.target} />
            <KPICard icon={FileWarning} label="Unresolved Discrepancies" value={kpis.unresolved_discrepancies?.value ?? 0} target={kpis.unresolved_discrepancies?.target} />
            <KPICard icon={ShieldCheck} label="Audit-Record Coverage" value={kpis.audit_record_coverage_pct?.value ?? 0} suffix="%" target={kpis.audit_record_coverage_pct?.target} />
            <KPICard icon={RotateCcw} label="Rework Rate" value={kpis.rework_rate_pct?.value ?? 0} suffix="%" target={kpis.rework_rate_pct?.target} />
          </div>

          {/* Session Summary */}
          {sessionSummary && (
            <Card>
              <CardHeader><CardTitle className="text-base">Session Summary</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Total: {sessionSummary.total}</Badge>
                  <Badge variant="outline">In Progress: {sessionSummary.in_progress}</Badge>
                  <Badge variant="outline">Awaiting Review: {sessionSummary.awaiting_review}</Badge>
                  <Badge variant="outline">Approved: {sessionSummary.approved}</Badge>
                  <Badge variant="outline">Partially Posted: {sessionSummary.partially_posted}</Badge>
                  <Badge variant="default">Completed: {sessionSummary.completed}</Badge>
                  <Badge variant="secondary">Abandoned: {sessionSummary.abandoned}</Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Configure Targets (Owner only) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4" /> KPI Target Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">Click a KPI to set its target value and alert threshold. Owner/Admin only.</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(kpis).map(([key, k]) => (
                  <Button key={key} variant="outline" size="sm" onClick={() => handleConfigureTarget(key)}>
                    {key.replace(/_/g, ' ')}: {k.target ?? '—'}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}