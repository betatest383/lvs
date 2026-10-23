import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Package, AlertTriangle } from 'lucide-react';

export default function EquipmentAccountability() {
  const [employees, setEmployees] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [acknowledgements, setAcknowledgements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.EmployeeRegistry.list('-created_date', 500),
      base44.entities.TechEquipment.list('-created_date', 500),
      base44.entities.EquipmentAcknowledgement.list('-created_date', 500),
    ]).then(([emps, eq, acks]) => { setEmployees(emps); setEquipment(eq); setAcknowledgements(acks); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const activeEmployees = employees.filter(e => e.employment_status === 'Active');

  const getEmpEquipment = (emp) => {
    const mine = equipment.filter(eq =>
      eq.assigned_employee_email === emp.email ||
      `${emp.first_name} ${emp.last_name}` === eq.assigned_employee
    );
    const permanent = mine.filter(e => e.assignment_type === 'permanent');
    const temporary = mine.filter(e => e.assignment_type === 'temporary');
    const missing = mine.filter(e => e.status === 'missing');
    const damaged = mine.filter(e => e.status === 'damaged' || e.condition === 'damaged' || e.condition === 'poor');
    const myAcks = acknowledgements.filter(a =>
      a.employee_email === emp.email ||
      `${emp.first_name} ${emp.last_name}` === a.employee_name
    );
    const openAcks = myAcks.filter(a => !a.signature_data_url);
    const totalValue = mine.reduce((sum, e) => sum + (e.current_value || (e.replacement_cost || 0) * (e.quantity || 1)), 0);
    return { permanent: permanent.length, temporary: temporary.length, missing: missing.length, damaged: damaged.length, openAcks: openAcks.length, totalValue, count: mine.length };
  };

  const totalValueAll = activeEmployees.reduce((sum, e) => sum + getEmpEquipment(e).totalValue, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Equipment Accountability</h1>
        <p className="text-muted-foreground text-sm">Equipment assigned, asset value, and status by employee</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-green-100 text-green-600"><Package className="w-4 h-4" /></div><p className="text-2xl font-bold">${totalValueAll.toLocaleString()}</p><p className="text-xs text-muted-foreground">Total Asset Value</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold">{equipment.length}</p><p className="text-xs text-muted-foreground">Total Items</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-red-100 text-red-600"><AlertTriangle className="w-4 h-4" /></div><p className="text-2xl font-bold">{equipment.filter(e => e.status === 'missing').length}</p><p className="text-xs text-muted-foreground">Missing</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-amber-100 text-amber-600"><AlertTriangle className="w-4 h-4" /></div><p className="text-2xl font-bold">{equipment.filter(e => e.status === 'damaged' || e.condition === 'damaged' || e.condition === 'poor').length}</p><p className="text-xs text-muted-foreground">Damaged</p></CardContent></Card>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Employee</th>
              <th className="px-3 py-2 font-medium text-center hidden md:table-cell">Permanent</th>
              <th className="px-3 py-2 font-medium text-center hidden md:table-cell">Temporary</th>
              <th className="px-3 py-2 font-medium text-center">Total Value</th>
              <th className="px-3 py-2 font-medium text-center text-red-600">Missing</th>
              <th className="px-3 py-2 font-medium text-center text-amber-600 hidden lg:table-cell">Damaged</th>
              <th className="px-3 py-2 font-medium text-center hidden lg:table-cell">Open Ack</th>
            </tr>
          </thead>
          <tbody>
            {activeEmployees.map(e => {
              const s = getEmpEquipment(e);
              return (
                <tr key={e.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Link to={`/lvcos/employees/detail/${e.id}`} className="font-medium hover:text-accent">{e.first_name} {e.last_name}</Link>
                  </td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">{s.permanent}</td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">{s.temporary}</td>
                  <td className="px-3 py-2 text-center font-medium">${s.totalValue.toLocaleString()}</td>
                  <td className="px-3 py-2 text-center text-red-600 font-medium">{s.missing || '—'}</td>
                  <td className="px-3 py-2 text-center text-amber-600 hidden lg:table-cell">{s.damaged || '—'}</td>
                  <td className="px-3 py-2 text-center hidden lg:table-cell">{s.openAcks || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}