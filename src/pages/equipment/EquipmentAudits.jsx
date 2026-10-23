import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, ClipboardCheck, Calendar, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { STATUS_LABELS, STATUS_COLORS, CONDITION_LABELS, CONDITION_COLORS } from '@/lib/equipmentConstants';

export default function EquipmentAudits() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [auditDialog, setAuditDialog] = useState(null);
  const [auditForm, setAuditForm] = useState({ condition: 'good', notes: '' });

  const load = () => {
    setLoading(true);
    base44.entities.TechEquipment.list('-next_audit_date', 500)
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const today = new Date();
  const overdue = items.filter(i => i.next_audit_date && new Date(i.next_audit_date) < today);
  const upcoming = items.filter(i => i.next_audit_date && new Date(i.next_audit_date) >= today && new Date(i.next_audit_date) <= new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000));
  const noAudit = items.filter(i => !i.next_audit_date);

  const handleAudit = async () => {
    if (!auditDialog) return;
    try {
      const nextDate = new Date();
      nextDate.setMonth(nextDate.getMonth() + 6);
      await base44.entities.TechEquipment.update(auditDialog.id, {
        last_audit_date: today.toISOString().split('T')[0],
        next_audit_date: nextDate.toISOString().split('T')[0],
        condition: auditForm.condition,
        notes: auditForm.notes ? `[Audit ${today.toLocaleDateString()}] ${auditForm.notes}` + (auditDialog.notes ? `\n${auditDialog.notes}` : '') : auditDialog.notes,
      });
      toast.success('Audit recorded');
      setAuditDialog(null);
      setAuditForm({ condition: 'good', notes: '' });
      load();
    } catch { toast.error('Failed to save audit'); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Equipment Audits</h1>
        <p className="text-sm text-muted-foreground">{overdue.length} overdue · {upcoming.length} upcoming · {noAudit.length} unscheduled</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="border-red-200"><CardContent className="p-3 text-center"><AlertTriangle className="w-4 h-4 text-red-500 mx-auto mb-1" /><p className="text-xl font-bold text-red-600">{overdue.length}</p><p className="text-xs text-muted-foreground">Overdue</p></CardContent></Card>
        <Card className="border-yellow-200"><CardContent className="p-3 text-center"><Calendar className="w-4 h-4 text-yellow-500 mx-auto mb-1" /><p className="text-xl font-bold text-yellow-600">{upcoming.length}</p><p className="text-xs text-muted-foreground">Upcoming (30d)</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><ClipboardCheck className="w-4 h-4 text-muted-foreground mx-auto mb-1" /><p className="text-xl font-bold">{noAudit.length}</p><p className="text-xs text-muted-foreground">Not Scheduled</p></CardContent></Card>
      </div>

      {overdue.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-red-600">Overdue Audits</p>
          {overdue.slice(0, 10).map(item => (
            <Card key={item.id} className="border-red-200">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.item_name}</p>
                  <div className="flex gap-2 mt-0.5">
                    {item.assigned_employee && <span className="text-xs text-muted-foreground">{item.assigned_employee}</span>}
                    {item.assigned_truck_number && <span className="text-xs text-muted-foreground">Truck {item.assigned_truck_number}</span>}
                    <span className="text-xs text-red-600">Due: {new Date(item.next_audit_date).toLocaleDateString()}</span>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs ${CONDITION_COLORS[item.condition] || ''}`}>{CONDITION_LABELS[item.condition]}</span>
                <Button size="sm" variant="outline" onClick={() => { setAuditDialog(item); setAuditForm({ condition: item.condition || 'good', notes: '' }); }}>Audit Now</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">All Equipment</p>
        {items.slice(0, 20).map(item => (
          <Card key={item.id}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{item.item_name}</p>
                <div className="flex gap-2 mt-0.5">
                  {item.assigned_employee && <span className="text-xs text-muted-foreground">{item.assigned_employee}</span>}
                  {item.last_audit_date && <span className="text-xs text-muted-foreground">Last: {new Date(item.last_audit_date).toLocaleDateString()}</span>}
                  {item.next_audit_date && <span className="text-xs text-muted-foreground">Next: {new Date(item.next_audit_date).toLocaleDateString()}</span>}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => { setAuditDialog(item); setAuditForm({ condition: item.condition || 'good', notes: '' }); }}>Audit</Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!auditDialog} onOpenChange={v => !v && setAuditDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Audit</DialogTitle></DialogHeader>
          {auditDialog && (
            <div className="space-y-3 py-2">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">{auditDialog.item_name}</p>
                {auditDialog.equipment_id && <p className="text-xs text-muted-foreground">{auditDialog.equipment_id}</p>}
                {auditDialog.assigned_employee && <p className="text-xs text-muted-foreground">Assigned to: {auditDialog.assigned_employee}</p>}
              </div>
              <div>
                <Label>Condition Found</Label>
                <Select value={auditForm.condition} onValueChange={v => setAuditForm(p => ({ ...p, condition: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CONDITION_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Audit Notes</Label>
                <textarea className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" rows={3} value={auditForm.notes} onChange={e => setAuditForm(p => ({ ...p, notes: e.target.value }))} placeholder="Observations..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuditDialog(null)}>Cancel</Button>
            <Button onClick={handleAudit} className="bg-accent text-accent-foreground hover:bg-accent/90">Save Audit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}