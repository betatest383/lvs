import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PackageX, Wrench, AlertTriangle, Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import MaterialReturnStatusBadge from "@/components/warehouse/MaterialReturnStatusBadge";
import moment from "moment";

export function TruckReturnsTab({ truck }) {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const all = await base44.entities.MaterialReturn.list('-created_date', 100);
        setReturns(all.filter(r => r.truck_number === truck.truck_number));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [truck]);

  if (loading) return <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  const outstanding = returns.filter(r => r.status !== "Closed" && r.status !== "Verified" && !r.manager_override_applied);

  const totalEquipReturned = returns.reduce((s, r) => s + (r.total_equipment_returned || 0), 0);
  const totalEquipDamaged = returns.reduce((s, r) => s + (r.total_equipment_damaged || 0), 0);
  const totalEquipMissing = returns.reduce((s, r) => s + (r.total_equipment_missing || 0), 0);
  const totalMaterialsReturned = returns.reduce((s, r) => s + (r.total_items_returned || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <PackageX className="h-5 w-5 mx-auto text-blue-600" />
            <p className="text-xs text-muted-foreground mt-1">Outstanding Returns</p>
            <p className="text-lg font-bold">{outstanding.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <PackageX className="h-5 w-5 mx-auto text-green-600" />
            <p className="text-xs text-muted-foreground mt-1">Materials Returned</p>
            <p className="text-lg font-bold">{totalMaterialsReturned}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Wrench className="h-5 w-5 mx-auto text-indigo-600" />
            <p className="text-xs text-muted-foreground mt-1">Equipment Returned</p>
            <p className="text-lg font-bold">{totalEquipReturned}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto text-red-600" />
            <p className="text-xs text-muted-foreground mt-1">Damaged / Missing</p>
            <p className="text-lg font-bold">{totalEquipDamaged + totalEquipMissing}</p>
          </CardContent>
        </Card>
      </div>

      {outstanding.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> Outstanding Returns</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {outstanding.map(r => (
              <Link key={r.id} to={`/warehouse/material-returns/${r.id}`}>
                <div className="flex items-center justify-between p-3 rounded-lg bg-white border hover:bg-amber-50 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{r.return_id}</p>
                      <MaterialReturnStatusBadge status={r.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{r.technician} · {r.transfer_sheet_number || 'No TS'}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs">
                      {(r.total_items_returned || 0) > 0 && <span className="text-green-600">{r.total_items_returned} materials</span>}
                      {(r.total_equipment_returned || 0) > 0 && <span className="text-blue-600">{r.total_equipment_returned} equipment</span>}
                      {(r.total_rental_returned || 0) > 0 && <span className="text-purple-600">{r.total_rental_returned} rentals</span>}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground flex-shrink-0">{moment(r.created_date).format('MMM D')}</p>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Return History</CardTitle>
            <Link to="/warehouse/material-returns/new">
              <Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1" /> New Return</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {returns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No returns recorded for this truck</p>
          ) : (
            <div className="space-y-2">
              {returns.map(r => (
                <Link key={r.id} to={`/warehouse/material-returns/${r.id}`} className="block p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{r.return_id}</p>
                        <MaterialReturnStatusBadge status={r.status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{r.technician} · {r.transfer_sheet_number || 'No TS'}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="flex items-center gap-2 justify-end">
                        {(r.total_items_returned || 0) > 0 && <span className="text-xs text-green-600">{r.total_items_returned} mat.</span>}
                        {(r.total_equipment_returned || 0) > 0 && <span className="text-xs text-blue-600">{r.total_equipment_returned} equip.</span>}
                        {(r.total_rental_returned || 0) > 0 && <span className="text-xs text-purple-600">{r.total_rental_returned} rentals</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{moment(r.created_date).format('MMM D, YYYY')}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}