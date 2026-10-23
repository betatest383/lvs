import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Wrench, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { CONDITION_LABELS, CONDITION_COLORS } from '@/lib/equipmentConstants';

export default function EquipmentRepairs() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [repairDialog, setRepairDialog] = useState(null);
  const [repairNotes, setRepairNotes] = useState('');

  const load = () => {
    setLoading(true);
    base44.entities.TechEquipment.list('-updated_date', 500)
      .then(all => setItems(all.filter(i => i.status === 'out_for_repair' || i.assignment_type === 'repair' || i.condition === 'poor' || i.condition === 'damaged')))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSendToRepair = async () => {
    if (!repairDialog) return;
    try {
      await base44.entities.TechEquipment.update(repairDialog.id, {
        status: 'out_for_repair',
        assignment_type: 'repair',
        condition: 'out_for_repair',
        notes: (repairDialog.notes || '') + (repairNotes ? `\n[Repair] ${repairNotes}` : ''),
      });
      toast.success('Equipment sent for repair');
      setRepairDialog(null);
      setRepairNotes('');
      load();
    } catch { toast.error('Failed to update'); }
  };

  const handleMarkRepaired = async (item) => {
    try {
      await base44.entities.TechEquipment.update(item.id, {
        status: 'active',
        assignment_type: 'warehouse_stock',
        condition: 'good',
        storage_location: 'Warehouse',
      });
      toast.success('Marked as repaired');
      load();
    } catch { toast.error('Failed to update'); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const inRepair = items.filter(i => i.status === 'out_for_repair' || i.assignment_type === 'repair');
  const needsRepair = items.filter(i => i.status !== 'out_for_repair' && i.assignment_type !== 'repair');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Equipment Repairs</h1>
        <p className="text-sm text-muted-foreground">{inRepair.length} in repair · {needsRepair.length} needing repair</p>
      </div>

      {inRepair.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Out for Repair ({inRepair.length})</p>
          {inRepair.map(item => (
            <Card key={item.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <Wrench className="w-5 h-5 text-orange-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.item_name}</p>
                  <div className="flex gap-2 mt-0.5">
                    {item.equipment_id && <span className="text-xs text-muted-foreground">{item.equipment_id}</span>}
                    {item.assigned_employee && <span className="text-xs text-muted-foreground">{item.assigned_employee}</span>}
                    {item.serial_number && <span className="text-xs text-muted-foreground">S/N: {item.serial_number}</span>}
                  </div>
                  {item.notes && <p className="text-xs text-muted-foreground mt-1 truncate">{item.notes}</p>}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs ${CONDITION_COLORS[item.condition] || ''}`}>{CONDITION_LABELS[item.condition]}</span>
                <Button size="sm" variant="outline" onClick={() => handleMarkRepaired(item)} className="shrink-0">
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Mark Repaired
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {needsRepair.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Needs Repair ({needsRepair.length})</p>
          {needsRepair.map(item => (
            <Card key={item.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.item_name}</p>
                  <div className="flex gap-2 mt-0.5">
                    {item.equipment_id && <span className="text-xs text-muted-foreground">{item.equipment_id}</span>}
                    {item.assigned_employee && <span className="text-xs text-muted-foreground">{item.assigned_employee}</span>}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs ${CONDITION_COLORS[item.condition] || ''}`}>{CONDITION_LABELS[item.condition]}</span>
                <Button size="sm" variant="outline" onClick={() => { setRepairDialog(item); setRepairNotes(''); }} className="shrink-0">
                  <Wrench className="w-3.5 h-3.5 mr-1" /> Send to Repair
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {items.length === 0 && (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-xl">
          <Wrench className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No equipment needs repair.</p>
        </div>
      )}

      <Dialog open={!!repairDialog} onOpenChange={v => !v && setRepairDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Send to Repair</DialogTitle></DialogHeader>
          {repairDialog && (
            <div className="space-y-3 py-2">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">{repairDialog.item_name}</p>
                {repairDialog.equipment_id && <p className="text-xs text-muted-foreground">{repairDialog.equipment_id}</p>}
              </div>
              <div>
                <Label>Repair Notes</Label>
                <Textarea className="mt-1" rows={3} value={repairNotes} onChange={e => setRepairNotes(e.target.value)} placeholder="Describe the issue..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRepairDialog(null)}>Cancel</Button>
            <Button onClick={handleSendToRepair} className="bg-accent text-accent-foreground hover:bg-accent/90">Send to Repair</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}