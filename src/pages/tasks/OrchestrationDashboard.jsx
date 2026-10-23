import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Shield, Zap, AlertTriangle, Settings, Loader2, Power, PowerOff,
  Brain, Clock, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentRole } from '@/hooks/useCurrentRole';
import {
  ORCHESTRATION_MODES, ORCHESTRATION_MODE_LABELS, ORCHESTRATION_MODE_DESCRIPTIONS,
} from '@/lib/orchestrationConstants';

/**
 * OrchestrationDashboard — Owner/Admin settings page for the orchestration engine.
 * Controls mode (off/preview/assisted/enforced), emergency disable, and policy settings.
 *
 * UI hardening: Mode selection and emergency controls are hidden from unauthorized users.
 * Backend 403 enforcement remains the source of truth.
 */
export default function OrchestrationDashboard() {
  const [loading, setLoading] = useState(true);
  const [policy, setPolicy] = useState(null);
  const [saving, setSaving] = useState(false);
  const [emergencyDialog, setEmergencyDialog] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState('');
  const [decisions, setDecisions] = useState([]);
  const { role } = useCurrentRole();
  const canManage = ['admin', 'owner', 'director_of_operations'].includes(role);
  const canEmergency = ['admin', 'owner'].includes(role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('orchestrateWork', { action: 'get_policy' });
      if (res.data?.success) setPolicy(res.data.policy);
    } catch (err) {
      toast.error('Failed to load orchestration policy');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDecisions = useCallback(async () => {
    try {
      const res = await base44.functions.invoke('orchestrateWork', {
        action: 'get_decision_history', limit: 20,
      });
      if (res.data?.success) setDecisions(res.data.decisions || []);
    } catch {}
  }, []);

  useEffect(() => { load(); loadDecisions(); }, [load, loadDecisions]);

  const handleModeChange = async (newMode) => {
    if (newMode === 'enforced' && policy?.emergency_disabled) {
      toast.error('Cannot enable enforced mode while emergency disabled is active');
      return;
    }
    setSaving(true);
    try {
      const res = await base44.functions.invoke('orchestrateWork', {
        action: 'update_policy',
        orchestration_mode: newMode,
      });
      if (res.data?.success) {
        toast.success(`Orchestration mode set to ${newMode}`);
        load();
      } else {
        toast.error(res.data?.error || 'Failed to update mode');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update mode');
    } finally {
      setSaving(false);
    }
  };

  const handleEmergencyDisable = async () => {
    if (!emergencyReason.trim()) {
      toast.error('Reason is required for emergency disable');
      return;
    }
    setSaving(true);
    try {
      const res = await base44.functions.invoke('orchestrateWork', {
        action: 'emergency_disable',
        reason: emergencyReason,
      });
      if (res.data?.success) {
        toast.success('Orchestration engine emergency disabled. All enforced behavior suspended.');
        setEmergencyDialog(false);
        setEmergencyReason('');
        load();
      } else {
        toast.error(res.data?.error || 'Failed to disable');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to disable');
    } finally {
      setSaving(false);
    }
  };

  const handleEmergencyEnable = async () => {
    setSaving(true);
    try {
      const res = await base44.functions.invoke('orchestrateWork', {
        action: 'emergency_enable',
      });
      if (res.data?.success) {
        toast.success('Orchestration engine re-enabled');
        load();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to enable');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  const mode = policy?.orchestration_mode || 'preview';

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Brain className="w-6 h-6 text-accent" />
          Work Orchestration Engine
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure how LVC OS prioritizes and orchestrates work across the organization.
        </p>
      </div>

      {/* Emergency Status */}
      {policy?.emergency_disabled && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-700">Emergency Disabled</p>
              <p className="text-xs text-red-600">
                Disabled by {policy.emergency_disabled_by} at {policy.emergency_disabled_at ? new Date(policy.emergency_disabled_at).toLocaleString() : '—'}
              </p>
              {policy.emergency_disabled_reason && (
                <p className="text-xs text-red-600 mt-1">Reason: {policy.emergency_disabled_reason}</p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={handleEmergencyEnable} disabled={saving}>
              <Power className="w-3.5 h-3.5 mr-1" /> Re-enable
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Mode Selection — hidden from unauthorized users */}
      {canManage && (
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Settings className="w-4 h-4 text-accent" /> Orchestration Mode
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {ORCHESTRATION_MODES.map(m => (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                disabled={saving || (m === 'enforced' && policy?.emergency_disabled)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  mode === m
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:bg-muted/50'
                } ${(m === 'enforced' && policy?.emergency_disabled) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {m === 'off' && <PowerOff className="w-4 h-4" />}
                  {m === 'preview' && <Eye className="w-4 h-4" />}
                  {m === 'assisted' && <Zap className="w-4 h-4" />}
                  {m === 'enforced' && <Shield className="w-4 h-4" />}
                  <span className="font-medium text-sm">{ORCHESTRATION_MODE_LABELS[m]}</span>
                  {mode === m && <Badge className="text-xs ml-auto">Active</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{ORCHESTRATION_MODE_DESCRIPTIONS[m]}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
      )}

      {/* Emergency Control — hidden from unauthorized users */}
      {canEmergency && !policy?.emergency_disabled && (
        <Card className="border-red-200">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-4 h-4" /> Emergency Control
            </h3>
            <p className="text-xs text-muted-foreground">
              Immediately disable all enforced orchestration behavior. Task and workflow state is preserved.
              Owner and Director will be notified. This does not delete any data.
            </p>
            {!emergencyDialog ? (
              <Button variant="destructive" size="sm" onClick={() => setEmergencyDialog(true)}>
                <PowerOff className="w-3.5 h-3.5 mr-1" /> Emergency Disable Engine
              </Button>
            ) : (
              <div className="space-y-2 p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm font-medium text-red-700">Reason for emergency disable (required):</p>
                <Textarea
                  value={emergencyReason}
                  onChange={e => setEmergencyReason(e.target.value)}
                  placeholder="Describe why you are disabling the orchestration engine…"
                  rows={2}
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={handleEmergencyDisable} disabled={saving || !emergencyReason.trim()}>
                    {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <PowerOff className="w-3.5 h-3.5 mr-1" />}
                    Confirm Disable
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setEmergencyDialog(false); setEmergencyReason(''); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Policy Settings — read-only for unauthorized users */}
      {canManage && (
      <Card>
        <CardContent className="p-4 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-accent" /> Policy Settings
          </h3>
          <div className="flex justify-between text-sm py-1 border-b"><span className="text-muted-foreground">Acknowledgment Deadline</span><span className="font-medium">{policy?.acknowledgment_deadline_minutes || 15} minutes</span></div>
          <div className="flex justify-between text-sm py-1 border-b"><span className="text-muted-foreground">Critical Acknowledgment Deadline</span><span className="font-medium">{policy?.critical_acknowledgment_deadline_minutes || 5} minutes</span></div>
          <div className="flex justify-between text-sm py-1"><span className="text-muted-foreground">Overdue Escalation</span><span className="font-medium">{policy?.overdue_escalation_minutes || 60} minutes</span></div>
          <div className="flex justify-between text-sm py-1"><span className="text-muted-foreground">Manager Override Roles</span><span className="font-medium text-right">{(policy?.manager_override_roles || []).join(', ')}</span></div>
        </CardContent>
      </Card>
      )}

      {/* Release Gate Notice */}
      <Card className="border-amber-300 bg-amber-50">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Assisted Mode Release Gate</p>
            <p className="text-xs text-amber-700 mt-1">
              An atomic active-session concurrency backstop (database-level unique constraint on
              <code className="px-1 bg-amber-100 rounded">employee_id + is_primary + status:active</code>)
              is required before Assisted Mode can be enabled.
              Base44's supported uniqueness/transaction mechanisms should be confirmed before implementation.
              Orchestration remains in <strong>Preview</strong> mode — no automatic interruption or Focus Required locking.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Recent Decisions */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Brain className="w-4 h-4 text-accent" /> Recent Orchestration Decisions
            </h3>
            <Button variant="ghost" size="sm" onClick={loadDecisions} className="h-7 px-2">
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
          {decisions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No decisions recorded yet.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {decisions.map((d, i) => (
                <div key={i} className="p-2 rounded-lg bg-muted/30 border text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{d.decision_type.replace(/_/g, ' ')}</Badge>
                    {d.selected_task_number && <span className="font-mono">{d.selected_task_number}</span>}
                    {d.manager_override && <Badge className="text-xs bg-purple-100 text-purple-700">Override</Badge>}
                    <span className="ml-auto text-muted-foreground">{new Date(d.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-muted-foreground">{d.decision_reason}</p>
                  {d.employee_name && <p className="text-muted-foreground">Employee: {d.employee_name}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Eye(props) {
  return <Shield {...props} />;
}