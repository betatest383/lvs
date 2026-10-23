import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Clock, Package, AlertTriangle, DollarSign, TrendingUp, CheckCircle2, ArrowLeftRight, Trash2, Wrench, Wrench as RepairIcon, PackageCheck } from 'lucide-react';
import MaterialReturnStatusBadge from '@/components/warehouse/MaterialReturnStatusBadge';

export default function MaterialReturnDashboard() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const data = await base44.entities.MaterialReturn.list('-created_date', 200);
      setReturns(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const parseItems = (val) => {
    if (!val) return [];
    try { return typeof val === 'string' ? JSON.parse(val) : val; } catch { return []; }
  };

  const stats = {
    pending: returns.filter(r => r.status === 'Pending Return').length,
    waitingVerification: returns.filter(r => r.status === 'Returned' || r.status === 'Warehouse Reviewing').length,
    verified: returns.filter(r => r.status === 'Verified').length,
    adjusted: returns.filter(r => r.status === 'Adjusted').length,
    closed: returns.filter(r => r.status === 'Closed').length,
    totalDamaged: returns.reduce((s, r) => s + (r.total_damaged || 0), 0),
    totalDisposed: returns.reduce((s, r) => s + (r.total_disposed || 0), 0),
    inventoryValueReturned: returns.reduce((s, r) => s + (r.inventory_value_returned || 0), 0),
    totalEquipReturned: returns.reduce((s, r) => s + (r.total_equipment_returned || 0), 0),
    totalEquipDamaged: returns.reduce((s, r) => s + (r.total_equipment_damaged || 0), 0),
    totalEquipMissing: returns.reduce((s, r) => s + (r.total_equipment_missing || 0), 0),
    repairTickets: returns.filter(r => r.manager_review_status === 'Equipment Repair Ticket Created').length,
    replacementRequests: returns.filter(r => r.manager_review_status === 'Replacement Request Created').length,
    overrides: returns.filter(r => r.manager_override_applied).length,
    avgProcessingTime: (() => {
      const completed = returns.filter(r => r.processing_time_minutes);
      if (completed.length === 0) return 0;
      return Math.round(completed.reduce((s, r) => s + r.processing_time_minutes, 0) / completed.length);
    })(),
  };

  const mostReturnedMaterials = (() => {
    const itemMap = {};
    returns.forEach(r => {
      parseItems(r.returned_items).forEach(item => {
        const name = item.item_name || 'Unknown';
        if (!itemMap[name]) itemMap[name] = { name, quantity: 0, damaged: 0 };
        itemMap[name].quantity += item.returned_quantity || 0;
        itemMap[name].damaged += item.damaged_quantity || 0;
      });
    });
    return Object.values(itemMap).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  })();

  const mostReturnedEquipment = (() => {
    const itemMap = {};
    returns.forEach(r => {
      parseItems(r.returned_equipment).forEach(item => {
        const name = item.item_name || 'Unknown';
        if (!itemMap[name]) itemMap[name] = { name, count: 0, damaged: 0 };
        itemMap[name].count += item.quantity || 1;
        if (item.status === 'Damaged' || item.status === 'Needs Repair') itemMap[name].damaged += item.quantity || 1;
      });
    });
    return Object.values(itemMap).sort((a, b) => b.count - a.count).slice(0, 5);
  })();

  const equipmentDamageRate = stats.totalEquipReturned > 0
    ? Math.round((stats.totalEquipDamaged / stats.totalEquipReturned) * 100)
    : 0;

  const recentReturns = returns.slice(0, 5);

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Truck Returns</h1>
          <p className="text-sm text-muted-foreground">WH-201 Truck Returns Process · BP-102 Warehouse Returns</p>
        </div>
        <div className="flex gap-2">
          <Link to="/warehouse/material-returns/new"><Button><Plus className="h-4 w-4 mr-1" /> New Return</Button></Link>
          <Link to="/warehouse/material-returns/history"><Button variant="outline"><Clock className="h-4 w-4 mr-1" /> History</Button></Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Package} label="Pending Returns" value={stats.pending} color="text-blue-600" bg="bg-blue-50" />
        <KpiCard icon={Clock} label="Warehouse Reviewing" value={stats.waitingVerification} color="text-amber-600" bg="bg-amber-50" />
        <KpiCard icon={CheckCircle2} label="Verified" value={stats.verified} color="text-purple-600" bg="bg-purple-50" />
        <KpiCard icon={TrendingUp} label="Adjusted" value={stats.adjusted} color="text-indigo-600" bg="bg-indigo-50" />
        <KpiCard icon={AlertTriangle} label="Damaged Materials" value={stats.totalDamaged} color="text-red-600" bg="bg-red-50" />
        <KpiCard icon={Wrench} label="Equipment Returned" value={stats.totalEquipReturned} color="text-blue-600" bg="bg-blue-50" />
        <KpiCard icon={AlertTriangle} label="Equipment Damage Rate" value={`${equipmentDamageRate}%`} color="text-orange-600" bg="bg-orange-50" />
        <KpiCard icon={AlertTriangle} label="Missing Equipment" value={stats.totalEquipMissing} color="text-red-600" bg="bg-red-50" />
        <KpiCard icon={RepairIcon} label="Repair Queue" value={stats.repairTickets} color="text-amber-600" bg="bg-amber-50" />
        <KpiCard icon={PackageCheck} label="Replacement Requests" value={stats.replacementRequests} color="text-teal-600" bg="bg-teal-50" />
        <KpiCard icon={DollarSign} label="Inventory Value Returned" value={`$${stats.inventoryValueReturned.toFixed(2)}`} color="text-green-600" bg="bg-green-50" />
        <KpiCard icon={Clock} label="Avg Processing Time" value={stats.avgProcessingTime > 0 ? `${stats.avgProcessingTime}m` : '—'} color="text-purple-600" bg="bg-purple-50" />
        <KpiCard icon={CheckCircle2} label="Closed Returns" value={stats.closed} color="text-green-600" bg="bg-green-50" />
        <KpiCard icon={Trash2} label="Total Disposed" value={stats.totalDisposed} color="text-gray-600" bg="bg-gray-50" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Most Returned Materials */}
        <Card>
          <CardHeader><CardTitle className="text-base">Most Returned Materials</CardTitle></CardHeader>
          <CardContent>
            {mostReturnedMaterials.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No returns recorded yet</p>
            ) : (
              <div className="space-y-2">
                {mostReturnedMaterials.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold flex-shrink-0">{i + 1}</span>
                      <span className="truncate">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {item.damaged > 0 && <span className="text-xs text-red-600">DMG: {item.damaged}</span>}
                      <span className="font-semibold">{item.quantity} returned</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Most Returned Equipment */}
        <Card>
          <CardHeader><CardTitle className="text-base">Most Returned Equipment</CardTitle></CardHeader>
          <CardContent>
            {mostReturnedEquipment.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No equipment returns recorded yet</p>
            ) : (
              <div className="space-y-2">
                {mostReturnedEquipment.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold flex-shrink-0">{i + 1}</span>
                      <span className="truncate">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {item.damaged > 0 && <span className="text-xs text-red-600">DMG: {item.damaged}</span>}
                      <span className="font-semibold">{item.count} returned</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Returns */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Recent Returns</CardTitle></CardHeader>
          <CardContent>
            {recentReturns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No returns yet</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {recentReturns.map(r => (
                  <Link key={r.id} to={`/warehouse/material-returns/${r.id}`} className="block p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{r.return_id} · {r.technician}</p>
                        <p className="text-xs text-muted-foreground">Truck {r.truck_number} · {r.transfer_sheet_number || 'No TS'}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs">
                          {(r.total_items_returned || 0) > 0 && <span className="text-green-600">{r.total_items_returned} mat.</span>}
                          {(r.total_equipment_returned || 0) > 0 && <span className="text-blue-600">{r.total_equipment_returned} equip.</span>}
                          {(r.total_rental_returned || 0) > 0 && <span className="text-purple-600">{r.total_rental_returned} rentals</span>}
                        </div>
                      </div>
                      <MaterialReturnStatusBadge status={r.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color, bg }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg}`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-lg font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}