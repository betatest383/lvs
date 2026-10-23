import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import DataTable from '@/components/shared/DataTable';
import EventRuleDialog from '@/components/admin/EventRuleDialog';
import { FlaskConical, GitBranch, Tags, Layers, Power, PowerOff, Plus, X, CheckSquare, Copy, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const moduleColor = (key) => {
  const map = {
    wh105: 'bg-amber-100 text-amber-700',
    enterprise_tasks: 'bg-blue-100 text-blue-700',
    equipment: 'bg-purple-100 text-purple-700',
    fleet: 'bg-cyan-100 text-cyan-700',
    notifications: 'bg-pink-100 text-pink-700',
    employees: 'bg-emerald-100 text-emerald-700',
    inspection_engine: 'bg-blue-100 text-blue-700',
  };
  return map[key] || 'bg-gray-100 text-gray-700';
};

export default function RuleRegistry() {
  const navigate = useNavigate();
  const [rules, setRules] = useState([]);
  const [repairs, setRepairs] = useState([]);
  const [ruleSets, setRuleSets] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkDialog, setBulkDialog] = useState(null); // 'assign' | 'remove' | 'priority' | null
  const [bulkRuleSetSelection, setBulkRuleSetSelection] = useState([]);
  const [bulkPriority, setBulkPriority] = useState(0);
  const [bulkSaving, setBulkSaving] = useState(false);

  const loadRules = () => base44.entities.LogicRule.filter({}, '-priority', 500).then(setRules).finally(() => setLoading(false));

  useEffect(() => {
    loadRules();
    base44.entities.Repair.list('-repair_name', 100).then(setRepairs);
    base44.entities.RuleSet.filter({}, '-sort_order', 100).then(setRuleSets);
  }, []);

  const ruleSetMap = useMemo(() => {
    const m = {};
    ruleSets.forEach(rs => { m[rs.id] = rs; });
    return m;
  }, [ruleSets]);

  const selectedRules = useMemo(() => rules.filter(r => selectedIds.includes(r.id)), [rules, selectedIds]);

  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = () => setSelectedIds(prev => prev.length === rules.length ? [] : rules.map(r => r.id));

  const handleBulkAssign = async () => {
    setBulkSaving(true);
    try {
      const updates = selectedRules.map(r => ({
        id: r.id,
        rule_sets: [...new Set([...(r.rule_sets || []), ...bulkRuleSetSelection])],
      }));
      await base44.entities.LogicRule.bulkUpdate(updates);
      toast.success(`Assigned ${selectedRules.length} rule${selectedRules.length !== 1 ? 's' : ''} to ${bulkRuleSetSelection.length} Rule Set${bulkRuleSetSelection.length !== 1 ? 's' : ''}`);
      setBulkDialog(null);
      setBulkRuleSetSelection([]);
      setSelectedIds([]);
      loadRules();
    } catch (err) {
      toast.error('Bulk assign failed: ' + err.message);
    } finally {
      setBulkSaving(false);
    }
  };

  const handleBulkRemove = async () => {
    setBulkSaving(true);
    try {
      const updates = selectedRules.map(r => ({
        id: r.id,
        rule_sets: (r.rule_sets || []).filter(id => !bulkRuleSetSelection.includes(id)),
      }));
      await base44.entities.LogicRule.bulkUpdate(updates);
      toast.success(`Removed ${selectedRules.length} rule${selectedRules.length !== 1 ? 's' : ''} from ${bulkRuleSetSelection.length} Rule Set${bulkRuleSetSelection.length !== 1 ? 's' : ''}`);
      setBulkDialog(null);
      setBulkRuleSetSelection([]);
      setSelectedIds([]);
      loadRules();
    } catch (err) {
      toast.error('Bulk remove failed: ' + err.message);
    } finally {
      setBulkSaving(false);
    }
  };

  const handleBulkToggle = async (active) => {
    setBulkSaving(true);
    try {
      const updates = selectedRules.map(r => ({ id: r.id, is_active: active }));
      await base44.entities.LogicRule.bulkUpdate(updates);
      toast.success(`${active ? 'Enabled' : 'Disabled'} ${selectedRules.length} rule${selectedRules.length !== 1 ? 's' : ''}`);
      setSelectedIds([]);
      loadRules();
    } catch (err) {
      toast.error('Bulk toggle failed: ' + err.message);
    } finally {
      setBulkSaving(false);
    }
  };

  const handleBulkPriority = async () => {
    setBulkSaving(true);
    try {
      const updates = selectedRules.map(r => ({ id: r.id, priority: bulkPriority }));
      await base44.entities.LogicRule.bulkUpdate(updates);
      toast.success(`Set priority ${bulkPriority} on ${selectedRules.length} rule${selectedRules.length !== 1 ? 's' : ''}`);
      setBulkDialog(null);
      setSelectedIds([]);
      loadRules();
    } catch (err) {
      toast.error('Bulk priority failed: ' + err.message);
    } finally {
      setBulkSaving(false);
    }
  };

  const columns = [
    {
      key: 'select', label: (
        <Checkbox
          checked={rules.length > 0 && selectedIds.length === rules.length}
          onCheckedChange={toggleSelectAll}
          className="border-muted-foreground"
        />
      ), render: r => (
        <div onClick={e => e.stopPropagation()}>
          <Checkbox checked={selectedIds.includes(r.id)} onCheckedChange={() => toggleSelect(r.id)} />
        </div>
      )
    },
    { key: 'rule_name', label: 'Rule Name', render: r => (
      <div>
        <span className="font-medium">{r.rule_name}</span>
        {r.tags?.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-0.5">
            {r.tags.slice(0, 3).map(t => <span key={t} className="text-[10px] px-1 py-0 rounded bg-muted text-muted-foreground">{t}</span>)}
            {r.tags.length > 3 && <span className="text-[10px] text-muted-foreground">+{r.tags.length - 3}</span>}
          </div>
        )}
      </div>
    )},
    { key: 'source_module_name', label: 'Source Module', render: r => r.source_module_name
      ? <span className={`text-xs px-2 py-0.5 rounded-full ${moduleColor(r.source_module)}`}>{r.source_module_name}</span>
      : <span className="text-muted-foreground text-xs">—</span> },
    { key: 'trigger_event_name', label: 'Trigger Event', render: r => r.trigger_event_name ? <span className="text-xs font-medium">{r.trigger_event_name}</span> : <span className="text-muted-foreground text-xs">—</span> },
    { key: 'rule_sets', label: 'Rule Sets', render: r => {
      const ids = r.rule_sets || [];
      if (ids.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
      return (
        <div className="flex flex-wrap gap-0.5 max-w-[180px]">
          {ids.slice(0, 2).map(id => {
            const rs = ruleSetMap[id];
            if (!rs) return null;
            return <span key={id} className={`text-[10px] px-1.5 py-0 rounded-full ${rs.color || 'bg-muted text-muted-foreground'}`}>{rs.name}</span>;
          })}
          {ids.length > 2 && <span className="text-[10px] text-muted-foreground">+{ids.length - 2}</span>}
        </div>
      );
    }},
    { key: 'actions', label: 'Actions', render: r => {
      let count = 0;
      try { count = JSON.parse(r.actions_json || '[]').length; } catch {}
      return <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium">{count} action{count !== 1 ? 's' : ''}</span>;
    }},
    { key: 'priority', label: 'Priority' },
    { key: 'simulation_status', label: 'Sim', render: r => {
      const s = r.simulation_status || 'never';
      const map = {
        never: { color: 'bg-gray-100 text-gray-500', label: 'Never' },
        passed: { color: 'bg-green-100 text-green-700', label: '✓' },
        failed: { color: 'bg-red-100 text-red-700', label: '✗' },
        warning: { color: 'bg-amber-100 text-amber-700', label: '!' },
        stale: { color: 'bg-orange-100 text-orange-700', label: '~' },
      };
      const cfg = map[s] || map.never;
      return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cfg.color}`} title={`Simulation: ${s}`}>{cfg.label}</span>;
    }},
    { key: 'is_active', label: 'Status', render: r => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
        {r.is_active !== false ? 'Active' : 'Inactive'}
      </span>
    )},
    { key: 'tools', label: 'Tools', render: r => (
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); setEditing(r); setDialogOpen(true); }}
          className="p-1.5 rounded hover:bg-accent/10 text-accent"
          title="Edit Rule"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/rules-engine/simulator/${r.id}`); }}
          className="p-1.5 rounded hover:bg-accent/10 text-accent"
          title="Test Rule"
        >
          <FlaskConical className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/rules-engine/dependencies/${r.id}`); }}
          className="p-1.5 rounded hover:bg-accent/10 text-accent"
          title="View Dependencies"
        >
          <GitBranch className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleDuplicate(r); }}
          className="p-1.5 rounded hover:bg-accent/10 text-accent"
          title="Duplicate Rule"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      </div>
    )},
  ];

  const handleSave = () => {
    toast.success('Rule saved');
    setEditing(null);
    loadRules();
  };

  const handleDuplicate = async (rule) => {
    try {
      const { id, created_date, updated_date, created_by_id, ...rest } = rule;
      await base44.entities.LogicRule.create({
        ...rest,
        rule_name: `${rule.rule_name} (Copy)`,
        is_active: false,
        simulation_status: 'never',
        last_simulated_at: null,
        last_simulated_by: null,
        last_simulation_result_json: null,
      });
      toast.success(`Duplicated "${rule.rule_name}"`);
      loadRules();
    } catch (err) {
      toast.error('Duplicate failed: ' + err.message);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rule Registry</h1>
        <p className="text-muted-foreground text-sm mt-0.5">All enterprise automation rules across LVC OS modules.</p>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-accent/5 border border-accent/30 rounded-lg">
          <span className="text-sm font-medium">{selectedIds.length} selected</span>
          <div className="h-4 w-px bg-border mx-1" />
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => { setBulkRuleSetSelection([]); setBulkDialog('assign'); }}>
            <Layers className="w-3.5 h-3.5" /> Assign to Set
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => { setBulkRuleSetSelection([]); setBulkDialog('remove'); }}>
            <X className="w-3.5 h-3.5" /> Remove from Set
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => handleBulkToggle(true)} disabled={bulkSaving}>
            <Power className="w-3.5 h-3.5" /> Enable
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => handleBulkToggle(false)} disabled={bulkSaving}>
            <PowerOff className="w-3.5 h-3.5" /> Disable
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => { setBulkPriority(selectedRules[0]?.priority || 0); setBulkDialog('priority'); }}>
            <CheckSquare className="w-3.5 h-3.5" /> Set Priority
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs ml-auto" onClick={() => setSelectedIds([])}>Clear</Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>
      ) : (
        <DataTable
          title="Automation Rules"
          subtitle={`${rules.length} rules configured`}
          columns={columns}
          data={rules}
          searchFields={['rule_name', 'source_module_name', 'trigger_event_name', 'category']}
          onAdd={() => { setEditing(null); setDialogOpen(true); }}
          addLabel="Add Rule"
          onRowClick={(row) => { setEditing(row); setDialogOpen(true); }}
        />
      )}

      <EventRuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        repairs={repairs}
        onSave={handleSave}
      />

      {/* Bulk Assign/Remove Dialog */}
      {bulkDialog === 'assign' || bulkDialog === 'remove' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setBulkDialog(null)}>
          <div className="bg-card rounded-lg shadow-xl max-w-md w-full mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">{bulkDialog === 'assign' ? 'Assign to Rule Sets' : 'Remove from Rule Sets'}</h2>
            <p className="text-sm text-muted-foreground">
              {bulkDialog === 'assign'
                ? `Select Rule Sets to assign ${selectedIds.length} selected rule(s) to.`
                : `Select Rule Sets to remove ${selectedIds.length} selected rule(s) from.`}
            </p>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {ruleSets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No Rule Sets defined. Create Rule Sets first.</p>
              ) : ruleSets.map(rs => {
                const sel = bulkRuleSetSelection.includes(rs.id);
                return (
                  <label key={rs.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer">
                    <Checkbox checked={sel} onCheckedChange={() => setBulkRuleSetSelection(prev => sel ? prev.filter(x => x !== rs.id) : [...prev, rs.id])} />
                    <span className="text-sm">{rs.name}</span>
                    {rs.rule_count != null && <span className="text-xs text-muted-foreground">({rs.rule_count} rules)</span>}
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBulkDialog(null)}>Cancel</Button>
              <Button
                onClick={bulkDialog === 'assign' ? handleBulkAssign : handleBulkRemove}
                disabled={bulkSaving || bulkRuleSetSelection.length === 0}
              >
                {bulkSaving ? 'Working...' : bulkDialog === 'assign' ? 'Assign' : 'Remove'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Bulk Priority Dialog */}
      {bulkDialog === 'priority' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setBulkDialog(null)}>
          <div className="bg-card rounded-lg shadow-xl max-w-sm w-full mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Set Priority</h2>
            <p className="text-sm text-muted-foreground">Set the same priority for {selectedIds.length} selected rule(s).</p>
            <div className="space-y-2">
              <Label className="text-xs">Priority Value</Label>
              <Input type="number" value={bulkPriority} onChange={e => setBulkPriority(Number(e.target.value))} />
              <div className="flex flex-wrap gap-1">
                {[{l:'Safety',v:100},{l:'Code',v:90},{l:'Compliance',v:80},{l:'Recommendation',v:70}].map(p => (
                  <button key={p.v} type="button" onClick={() => setBulkPriority(p.v)} className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent/10 text-muted-foreground">{p.l}</button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBulkDialog(null)}>Cancel</Button>
              <Button onClick={handleBulkPriority} disabled={bulkSaving}>{bulkSaving ? 'Working...' : 'Apply'}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}