import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, ArrowRight, Trash2, Pencil, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { MAPPING_TYPES } from "@/lib/servicetitanConstants";

export default function MappingRules() {
  const [rules, setRules] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [businessProcesses, setBusinessProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    try {
      const [r, t, tech, bp] = await Promise.all([
        base44.entities.MappingRule.list('-created_date', 200),
        base44.entities.TruckProfile.list('-updated_date', 200),
        base44.entities.Technician.list('-updated_date', 200),
        base44.entities.BusinessProcess.list('-created_date', 200),
      ]);
      setRules(r); setTrucks(t); setTechnicians(tech); setBusinessProcesses(bp);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = rules.filter(r => {
    const matchSearch = !search || (r.external_id || "").toLowerCase().includes(search.toLowerCase()) || (r.external_name || "").toLowerCase().includes(search.toLowerCase()) || (r.lvc_os_name || "").toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || r.mapping_type === filterType;
    return matchSearch && matchType;
  });

  const getOptions = (mappingType) => {
    switch (mappingType) {
      case 'truck': return trucks.map(t => ({ id: t.truck_id, name: `Truck ${t.truck_number} — ${t.vehicle_name || t.make}` }));
      case 'technician': return technicians.map(t => ({ id: t.id, name: t.name }));
      case 'business_unit': return [
        { id: 'Warehouse', name: 'Warehouse' },
        { id: 'Field Operations', name: 'Field Operations' },
        { id: 'Customer Service', name: 'Customer Service' },
        { id: 'Sales', name: 'Sales' },
      ];
      case 'job_type': return businessProcesses.map(bp => ({ id: bp.process_id, name: `${bp.process_id} — ${bp.title}` }));
      default: return [];
    }
  };

  const handleDelete = async (rule) => {
    if (!confirm(`Delete mapping rule for ${rule.external_name}?`)) return;
    await base44.entities.MappingRule.delete(rule.id);
    load();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mapping Rules</h1>
          <p className="text-muted-foreground text-sm">Map ServiceTitan entities to LVC OS records</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4 mr-1" /> New Rule</Button>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search mappings..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="all">All Types</option>
          {MAPPING_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <ArrowRight className="h-10 w-10 mx-auto mb-2 opacity-40" />
          No mapping rules configured.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const typeLabel = MAPPING_TYPES.find(m => m.value === r.mapping_type)?.label || r.mapping_type;
            return (
              <Card key={r.id}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <div className="text-right">
                        <p className="font-medium">{r.external_name || r.external_id}</p>
                        <p className="text-xs text-muted-foreground">{typeLabel}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground mx-2 flex-shrink-0" />
                      <div>
                        <p className="font-medium">{r.lvc_os_name || r.lvc_os_id}</p>
                        <p className="text-xs text-muted-foreground">{r.lvc_os_entity}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Switch checked={r.is_active} onCheckedChange={async (v) => { await base44.entities.MappingRule.update(r.id, { is_active: v }); load(); }} />
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setShowForm(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(r)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showForm && (
        <MappingRuleForm
          rule={editing}
          trucks={trucks}
          technicians={technicians}
          businessProcesses={businessProcesses}
          getOptions={getOptions}
          onSave={async (data) => {
            if (editing) {
              await base44.entities.MappingRule.update(editing.id, data);
            } else {
              const count = await base44.entities.MappingRule.list('-created_date', 1);
              const seq = String(count.length + 1).padStart(6, '0');
              await base44.entities.MappingRule.create({ ...data, rule_id: `MAP-${seq}`, source_system: 'ServiceTitan' });
            }
            setShowForm(false); setEditing(null); load();
          }}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function MappingRuleForm({ rule, getOptions, onSave, onClose }) {
  const [form, setForm] = useState({
    mapping_type: rule?.mapping_type || 'truck',
    external_id: rule?.external_id || '',
    external_name: rule?.external_name || '',
    lvc_os_entity: rule?.lvc_os_entity || 'TruckProfile',
    lvc_os_id: rule?.lvc_os_id || '',
    lvc_os_name: rule?.lvc_os_name || '',
    is_active: rule?.is_active ?? true,
    notes: rule?.notes || '',
  });

  const options = getOptions(form.mapping_type);
  const typeLabel = MAPPING_TYPES.find(m => m.value === form.mapping_type);

  const handleTypeChange = (type) => {
    const m = MAPPING_TYPES.find(m => m.value === type);
    setForm(f => ({ ...f, mapping_type: type, lvc_os_entity: m?.entity || '', lvc_os_id: '', lvc_os_name: '' }));
  };

  const handleSelect = (id) => {
    const opt = options.find(o => o.id === id);
    setForm(f => ({ ...f, lvc_os_id: id, lvc_os_name: opt?.name || id }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-background w-full md:max-w-md md:rounded-xl rounded-t-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{rule ? 'Edit Mapping' : 'New Mapping Rule'}</h2>
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>
          <div>
            <Label className="text-xs">Mapping Type</Label>
            <Select value={form.mapping_type} onValueChange={handleTypeChange}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MAPPING_TYPES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">ServiceTitan External ID</Label>
            <Input value={form.external_id} onChange={(e) => setForm(f => ({ ...f, external_id: e.target.value }))} placeholder="e.g. ST-TRK-001" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">External Name (optional)</Label>
            <Input value={form.external_name} onChange={(e) => setForm(f => ({ ...f, external_name: e.target.value }))} placeholder="e.g. Truck 1" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">LVC OS Target ({typeLabel?.entity})</Label>
            <Select value={form.lvc_os_id} onValueChange={handleSelect}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {options.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm(f => ({ ...f, is_active: v }))} />
            <Label className="text-sm">Active</Label>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={!form.external_id || !form.lvc_os_id} onClick={() => onSave(form)}>Save</Button>
          </div>
        </div>
      </div>
    </div>
  );
}