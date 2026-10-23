import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Clock, Undo2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CONDITION_LABELS, CONDITION_COLORS } from '@/lib/equipmentConstants';
import { Link } from 'react-router-dom';
import UnassignEquipmentDialog from '@/components/equipment/UnassignEquipmentDialog';

export default function TemporaryCheckouts() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [returnItem, setReturnItem] = useState(null);

  const load = () => {
    setLoading(true);
    base44.entities.TechEquipment.filter({ assignment_type: 'temporary' }, '-assignment_date', 200)
      .then(all => setItems(all.filter(i => i.is_active !== false)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const overdue = items.filter(i => i.expected_return_datetime && new Date(i.expected_return_datetime) < new Date());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Temporary Checkouts</h1>
          <p className="text-sm text-muted-foreground">{items.length} items checked out · {overdue.length} overdue</p>
        </div>
        <Link to="/equipment/assign"><Button variant="outline" size="sm">New Checkout</Button></Link>
      </div>

      {overdue.length > 0 && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <p className="text-sm text-red-700">{overdue.length} item(s) are past their expected return date.</p>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-xl">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No temporary checkouts active.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const isOverdue = item.expected_return_datetime && new Date(item.expected_return_datetime) < new Date();
            return (
              <Card key={item.id}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.item_name}</p>
                      <div className="flex flex-wrap gap-2 mt-0.5">
                        {item.assigned_employee && <span className="text-xs text-muted-foreground">{item.assigned_employee}</span>}
                        {item.assigned_truck_number && <span className="text-xs text-muted-foreground">Truck {item.assigned_truck_number}</span>}
                        {item.assigned_job && <span className="text-xs text-muted-foreground">Job: {item.assigned_job}</span>}
                        {item.assigned_crew && <span className="text-xs text-muted-foreground">Crew: {item.assigned_crew}</span>}
                      </div>
                      <div className="flex gap-2 mt-1">
                        {item.assignment_date && <span className="text-xs text-muted-foreground">Out: {new Date(item.assignment_date).toLocaleDateString()}</span>}
                        {item.expected_return_datetime && (
                          <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                            Return by: {new Date(item.expected_return_datetime).toLocaleDateString()} {isOverdue && '⚠ OVERDUE'}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CONDITION_COLORS[item.condition] || ''}`}>{CONDITION_LABELS[item.condition]}</span>
                    <Button size="sm" variant="outline" onClick={() => setReturnItem(item)} className="shrink-0">
                      <Undo2 className="w-3.5 h-3.5 mr-1" /> Return
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <strong>WH-201 Integration:</strong> Temporary equipment appears in WH-201 Truck Returns until returned. Permanent equipment does not appear in daily returns.
          </p>
          <Link to="/warehouse/material-returns" className="text-sm text-accent underline mt-1 inline-block">Go to WH-201 Truck Returns →</Link>
        </CardContent>
      </Card>
      <UnassignEquipmentDialog open={!!returnItem} onOpenChange={v => !v && setReturnItem(null)} assignment={returnItem} onReturned={() => load()} />
    </div>
  );
}