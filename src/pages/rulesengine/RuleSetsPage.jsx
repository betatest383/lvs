import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import DataTable from '@/components/shared/DataTable';
import { Layers, Plus, Trash2, Power } from 'lucide-react';
import { toast } from 'sonner';

const PRIORITY_PRESETS = [
  { label: 'Safety', value: 100 },
  { label: 'Code', value: 90 },
  { label: 'Compliance', value: 80 },
  { label: 'Recommendation', value: 70 },
  { label: 'Estimate', value: 60 },
  { label: 'Scope', value: 50 },
  { label: 'Inventory', value: 40 },
  { label: 'Presentation', value: 30 },
  { label: 'Analytics', value: 20 },
];

const COLOR_OPTIONS = [
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-amber-100 text-amber-700',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-cyan-100 text-cyan-700',
  'bg-indigo-100 text-indigo-700',
  'bg-emerald-100 text-emerald-700',
];

export default function RuleSetsPage() {
  const [ruleSets, setRuleSets] = useState([]);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: '', description: '', appliance_type: '', inspection_category: '',
    is_enabled: true, priority_override: false, base_priority: 0, color: COLOR_OPTIONS[0],
  });

  const loadData = () => {
    Promise.all([
      base44.entities.RuleSet.list('-sort_order'),
      base44.entities.LogicRule.filter({ rule_type: 'automation' }, '-priority', 500),
    ]).then(([sets, r]) => {
      setRuleSets(sets);
      setRules(r);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleSave = async () => {
    if (!form.name?.trim()) { toast.error('Name is required'); return; }
    try {
      if (editing?.id) {
        await base44.entities.RuleSet.update(editing.id, form);
      } else {
        const created = await base44.entities.RuleSet.create({
          ...form,
          set_code: `RS-${Date.now().toString().slice(-6)}`,
          rule_ids: [],
          rule_count: 0,
        });
      }
      toast.success(editing ? 'Rule set updated' : 'Rule set created');
      setDialogOpen(false);
      setEditing(null);
      loadData();
    } catch (err) {
      toast.error('Save error: ' + err.message);
    }
  };

  const handleToggle = async (set) => {
    await base44.entities.RuleSet.update(set.id, { is_enabled: !set.is_enabled });
    toast.success(`${set.name} ${set.is_enabled ? 'disabled' : 'enabled'}`);
    loadData();
  };

  const handleDelete = async (set) => {
    if (!confirm(`Delete rule set "${set.name}"? Rules will not be deleted.`)) return;
    await base44.entities.RuleSet.delete(set.id);
    toast.success('Rule set deleted');
    loadData();
  };

  const columns = [
    { key: 'name', label: 'Rule Set Name', render: r => (
      <span className="flex items-center gap-2">
        <span className={`w-3 h-3 rounded-full ${r.color || 'bg-gray-200'}`} />
        <span className="font-medium">{r.name}</span>
      </span>
    )},
    { key: 'description', label: 'Description', render: r => <span className="text-xs text-muted-foreground">{r.description || '—'}</span> },
    { key: 'rule_count', label: 'Rules', render: r => <Badge variant="outline" className="text-xs">{r.rule_count || (r.rule_ids?.length || 0)}</Badge> },
    { key: 'base_priority', label: 'Base Priority' },
    { key: 'is_enabled', label: 'Status', render: r => (
      <button onClick={(e) => { e.stopPropagation(); handleToggle(r); }}>
        <Badge className={`text-xs ${r.is_enabled !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
          {r.is_enabled !== false ? 'Enabled' : 'Disabled'}
        </Badge>
      </button>
    )},
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Layers className="w-6 h-6 text-accent" /> Rule Sets
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Group rules by inspection type or category. Sets can be enabled or disabled independently.</p>
      </div>

      {/* Priority Legend */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-semibold mb-2">Priority Scale (higher executes first)</p>
          <div className="flex flex-wrap gap-2">
            {PRIORITY_PRESETS.map(p => (
              <Badge key={p.value} variant="outline" className="text-xs">{p.value} — {p.label}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>
      ) : (
        <DataTable
          title="Rule Sets"
          subtitle={`${ruleSets.length} sets configured`}
          columns={columns}
          data={ruleSets}
          searchFields={['name', 'description', 'appliance_type']}
          onAdd={() => { setEditing(null); setForm({ name: '', description: '', appliance_type: '', inspection_category: '', is_enabled: true, priority_override: false, base_priority: 0, color: COLOR_OPTIONS[0] }); setDialogOpen(true); }}
          addLabel="Add Rule Set"
          onRowClick={(row) => {
            setEditing(row);
            setForm({
              name: row.name || '', description: row.description || '',
              appliance_type: row.appliance_type || '', inspection_category: row.inspection_category || '',
              is_enabled: row.is_enabled !== false, priority_override: row.priority_override || false,
              base_priority: row.base_priority || 0, color: row.color || COLOR_OPTIONS[0],
            });
            setDialogOpen(true);
          }}
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Rule Set' : 'New Rule Set'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Wood Fireplace Inspection" />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Appliance Type</Label>
                <Input value={form.appliance_type} onChange={e => setForm(f => ({ ...f, appliance_type: e.target.value }))} placeholder="e.g. wood_stove" />
              </div>
              <div className="space-y-1">
                <Label>Inspection Category</Label>
                <Input value={form.inspection_category} onChange={e => setForm(f => ({ ...f, inspection_category: e.target.value }))} placeholder="e.g. Chimney Crown" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Color</Label>
                <div className="flex flex-wrap gap-1.5">
                  {COLOR_OPTIONS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={`w-6 h-6 rounded-full ${c} ${form.color === c ? 'ring-2 ring-offset-2 ring-accent' : ''}`} />
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label>Base Priority</Label>
                <Input type="number" value={form.base_priority} onChange={e => setForm(f => ({ ...f, base_priority: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_enabled} onCheckedChange={v => setForm(f => ({ ...f, is_enabled: v }))} />
              <Label>Enabled</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.priority_override} onCheckedChange={v => setForm(f => ({ ...f, priority_override: v }))} />
              <Label>Priority Override (use base priority as floor)</Label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save Rule Set</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}