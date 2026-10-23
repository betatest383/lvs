import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Package, AlertTriangle, Undo2 } from 'lucide-react';
import UnassignEquipmentDialog from '@/components/equipment/UnassignEquipmentDialog';

export default function EmployeeEquipmentTab({ employee, onValueCalculated }) {
  const [equipment, setEquipment] = useState([]);
  const [acknowledgements, setAcknowledgements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [returnItem, setReturnItem] = useState(null);

  useEffect(() => {
    if (!employee.email && !employee.employee_id) { setLoading(false); return; }
    Promise.all([
      base44.entities.TechEquipment.filter({}, '-created_date', 200).catch(() => []),
      base44.entities.EquipmentAcknowledgement.filter({}, '-created_date', 200).catch(() => []),
    ]).then(([eq, acks]) => {
      const mine = eq.filter(e =>
        e.is_active !== false && (
          e.assigned_employee_email === employee.email ||
          `${employee.first_name} ${employee.last_name}` === e.assigned_employee
        )
      );
      setEquipment(mine);
      const myAcks = acks.filter(a =>
        a.employee_email === employee.email ||
        `${employee.first_name} ${employee.last_name}` === a.employee_name
      );
      setAcknowledgements(myAcks);
    }).finally(() => setLoading(false));
  }, [employee]);

  const refreshEquipment = () => {
    base44.entities.TechEquipment.filter({}, '-created_date', 200).then(eq => {
      const mine = eq.filter(e =>
        e.is_active !== false && (
          e.assigned_employee_email === employee.email ||
          `${employee.first_name} ${employee.last_name}` === e.assigned_employee
        )
      );
      setEquipment(mine);
    }).catch(() => {});
  };

  useEffect(() => {
    const totalValue = equipment.reduce((sum, e) => sum + (e.current_value || (e.replacement_cost || 0) * (e.quantity || 1)), 0);
    onValueCalculated?.(totalValue);
  }, [equipment, onValueCalculated]);

  if (loading) return <p className="text-sm text-muted-foreground text-center py-4">Loading equipment...</p>;

  const permanent = equipment.filter(e => e.assignment_type === 'permanent');
  const temporary = equipment.filter(e => e.assignment_type === 'temporary');
  const missing = equipment.filter(e => e.status === 'missing');
  const damaged = equipment.filter(e => e.status === 'damaged' || e.condition === 'damaged' || e.condition === 'poor');
  const openAcks = acknowledgements.filter(a => !a.signature_data_url);
  const totalValue = equipment.reduce((sum, e) => sum + (e.current_value || (e.replacement_cost || 0) * (e.quantity || 1)), 0);

  const stats = [
    { label: 'Permanent', value: permanent.length, icon: Package, color: 'bg-blue-100 text-blue-600' },
    { label: 'Temporary', value: temporary.length, icon: Package, color: 'bg-cyan-100 text-cyan-600' },
    { label: 'Total Value', value: `$${totalValue.toLocaleString()}`, icon: CheckCircle2, color: 'bg-green-100 text-green-600' },
    { label: 'Missing', value: missing.length, icon: XCircle, color: 'bg-red-100 text-red-600' },
    { label: 'Damaged', value: damaged.length, icon: AlertTriangle, color: 'bg-amber-100 text-amber-600' },
    { label: 'Open Ack', value: openAcks.length, icon: AlertTriangle, color: 'bg-orange-100 text-orange-600' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {stats.map((s, i) => (
          <Card key={i}><CardContent className="p-4">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${s.color}`}><s.icon className="w-4 h-4" /></div>
            <p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Assigned Equipment</CardTitle></CardHeader>
        <CardContent>
          {equipment.length === 0 ? (
            <p className="text-sm text-muted-foreground">No equipment assigned.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 font-medium hidden md:table-cell">Type</th>
                    <th className="px-3 py-2 font-medium">Qty</th>
                    <th className="px-3 py-2 font-medium hidden md:table-cell">Value</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {equipment.map(e => (
                    <tr key={e.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{e.item_name}</td>
                      <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{e.assignment_type}</td>
                      <td className="px-3 py-2">{e.quantity || 1}</td>
                      <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">${(e.current_value || (e.replacement_cost || 0) * (e.quantity || 1)).toLocaleString()}</td>
                      <td className="px-3 py-2"><span className="text-xs">{e.status}</span></td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReturnItem(e)}>
                          <Undo2 className="w-3 h-3 mr-1" /> Unassign
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <UnassignEquipmentDialog
        open={!!returnItem}
        onOpenChange={v => !v && setReturnItem(null)}
        assignment={returnItem}
        onReturned={refreshEquipment}
      />
    </div>
  );
}