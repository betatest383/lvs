import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export default function EmployeeCorrectiveActionsTab({ employee }) {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.CorrectiveAction.list('-created_date', 200)
      .then(all => {
        const mine = all.filter(a =>
          a.employee_name === `${employee.first_name} ${employee.last_name}` ||
          a.employee_email === employee.email
        );
        setActions(mine);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [employee]);

  if (loading) return <p className="text-sm text-muted-foreground text-center py-4">Loading corrective actions...</p>;

  const open = actions.filter(a => a.status !== 'Completed' && a.status !== 'Closed');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 bg-amber-100 text-amber-600"><AlertTriangle className="w-4 h-4" /></div>
          <p className="text-2xl font-bold">{open.length}</p><p className="text-xs text-muted-foreground">Open</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold">{actions.length}</p><p className="text-xs text-muted-foreground">Total</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Corrective Actions</CardTitle></CardHeader>
        <CardContent>
          {actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No corrective actions found.</p>
          ) : (
            <div className="space-y-1">
              {actions.map(a => (
                <div key={a.id} className="flex items-center justify-between text-sm border-b last:border-0 py-1.5">
                  <span className="truncate">{a.title || a.description || 'Corrective Action'}</span>
                  <span className="text-xs text-muted-foreground">{a.status}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}