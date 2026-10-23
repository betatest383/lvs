import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Search, Plus, Trash2, Loader2 } from 'lucide-react';

function getAvailability(eq) {
  if ((eq.quantity_out_for_repair || 0) > 0 && (eq.quantity_available || 0) === 0)
    return { label: 'Under Repair', cls: 'bg-orange-100 text-orange-700' };
  if ((eq.quantity_available || 0) > 0)
    return { label: 'Available', cls: 'bg-green-100 text-green-700' };
  if ((eq.quantity_assigned || 0) > 0)
    return { label: 'Assigned', cls: 'bg-blue-100 text-blue-700' };
  return { label: 'Out of Service', cls: 'bg-red-100 text-red-700' };
}

export default function EquipmentMultiSelect({ items, onChange, totalDays }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [customName, setCustomName] = useState('');
  const timer = useRef(null);
  const list = items || [];
  const dayCount = totalDays || 1;

  useEffect(() => {
    if (search.trim().length < 2) { setResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const all = await base44.entities.EquipmentMaster.list('item_name', 200);
        const q = search.toLowerCase();
        setResults(all.filter(e =>
          (e.item_name || '').toLowerCase().includes(q) ||
          (e.category || '').toLowerCase().includes(q) ||
          (e.equipment_id || '').toLowerCase().includes(q) ||
          (e.description || '').toLowerCase().includes(q)
        ).slice(0, 10));
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [search]);

  const selectItem = (eq) => {
    if (list.find(i => i.equipment_master_id === eq.id)) return;
    onChange([...list, {
      equipment_master_id: eq.id, item_name: eq.item_name,
      category: eq.category || '', sku: eq.equipment_id || '',
      required_days: [], critical: false, notes: '',
      _availability: getAvailability(eq),
    }]);
    setSearch(''); setShowResults(false);
  };

  const addCustom = () => {
    if (!customName.trim()) return;
    onChange([...list, {
      equipment_master_id: '', item_name: customName.trim(),
      category: 'Custom', sku: '', required_days: [],
      critical: false, notes: '', _availability: null,
    }]);
    setCustomName('');
  };

  const update = (idx, key, value) => {
    const next = [...list]; next[idx] = { ...next[idx], [key]: value }; onChange(next);
  };

  const remove = (idx) => onChange(list.filter((_, i) => i !== idx));

  const toggleDay = (idx, day) => {
    const current = list[idx]?.required_days || [];
    update(idx, 'required_days', current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day].sort((a, b) => a - b));
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setShowResults(true); }}
            onFocus={() => setShowResults(true)} onBlur={() => setTimeout(() => setShowResults(false), 200)}
            placeholder="Search by name, category, SKU..." className="pl-8" />
          {loading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin" />}
        </div>
        {showResults && search.length >= 2 && (
          <div className="absolute z-50 mt-1 w-full bg-popover border rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {results.length === 0 && !loading && (
              <p className="p-3 text-sm text-muted-foreground">No matches. Add as custom equipment below.</p>
            )}
            {results.map(eq => {
              const avail = getAvailability(eq);
              return (
                <button key={eq.id} type="button" onMouseDown={() => selectItem(eq)}
                  className="w-full flex items-center justify-between p-2 hover:bg-accent text-left border-b last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{eq.item_name}</p>
                    <p className="text-xs text-muted-foreground">{eq.category} · {eq.equipment_id}</p>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${avail.cls}`}>{avail.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Input value={customName} onChange={e => setCustomName(e.target.value)}
          placeholder="Add custom equipment (e.g. Mortar Mixer)..."
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} />
        <Button variant="outline" size="sm" onClick={addCustom}><Plus className="w-4 h-4" /></Button>
      </div>

      {list.map((item, idx) => (
        <div key={idx} className="border rounded-lg p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{item.item_name}</p>
              <p className="text-xs text-muted-foreground">{item.category}{item.sku ? ` · ${item.sku}` : ''}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {item._availability && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${item._availability.cls}`}>{item._availability.label}</span>
              )}
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => remove(idx)}>
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Required Days:</span>
            {Array.from({ length: dayCount }, (_, i) => i + 1).map(day => (
              <button key={day} type="button" onClick={() => toggleDay(idx, day)}
                className={`w-6 h-6 rounded-full text-[10px] font-medium transition-colors ${item.required_days?.includes(day) ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
                {day}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={item.critical || false} onCheckedChange={v => update(idx, 'critical', v)} />
            <Label className="text-xs">Critical for Work</Label>
          </div>
          <Textarea rows={1} value={item.notes || ''} onChange={e => update(idx, 'notes', e.target.value)}
            placeholder="Notes (size, specs, special requirements)..." className="text-xs" />
        </div>
      ))}
    </div>
  );
}