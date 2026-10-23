import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, History } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ASSIGNMENT_TYPE_LABELS, ASSIGNMENT_TYPE_COLORS, CONDITION_LABELS, CONDITION_COLORS } from '@/lib/equipmentConstants';

export default function AssetHistory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    base44.entities.TechEquipment.list('-updated_date', 500)
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = items.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    return ['item_name', 'equipment_id', 'serial_number', 'assigned_employee', 'assigned_truck_number', 'assigned_by']
      .some(f => item[f] && String(item[f]).toLowerCase().includes(q));
  });

  const historyItems = filtered.filter(i => i.assigned_by || i.assignment_date).sort((a, b) => new Date(b.assignment_date || b.updated_date) - new Date(a.assignment_date || a.updated_date));

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Asset History</h1>
        <p className="text-sm text-muted-foreground">Assignment and transfer history for all equipment</p>
      </div>

      <Input placeholder="Search by name, employee, truck..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />

      {historyItems.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-xl">
          <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No assignment history yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {historyItems.slice(0, 50).map(item => (
            <Card key={item.id}>
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.item_name}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {item.equipment_id && <span className="text-xs text-muted-foreground">{item.equipment_id}</span>}
                      <span className={`px-2 py-0.5 rounded-full text-xs ${ASSIGNMENT_TYPE_COLORS[item.assignment_type] || ''}`}>{ASSIGNMENT_TYPE_LABELS[item.assignment_type]}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${CONDITION_COLORS[item.condition] || ''}`}>{CONDITION_LABELS[item.condition]}</span>
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground shrink-0">
                    {item.assigned_by && <p>By: {item.assigned_by}</p>}
                    {item.assigned_employee && <p>To: {item.assigned_employee}</p>}
                    {item.assigned_truck_number && <p>Truck: {item.assigned_truck_number}</p>}
                    {item.assignment_date && <p>{new Date(item.assignment_date).toLocaleDateString()}</p>}
                  </div>
                </div>
                {item.notes && <p className="text-xs text-muted-foreground mt-2">{item.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}