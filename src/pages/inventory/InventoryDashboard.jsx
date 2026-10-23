import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, DollarSign, Package, AlertTriangle, TrendingUp, TrendingDown, Wrench, Archive, Boxes, Bookmark, Truck, ShoppingCart } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TRANSACTION_TYPES, getTransactionTypeLabel } from '@/lib/inventoryConstants';

const PIE_COLORS = ['#22c55e', '#3b82f6', '#f97316', '#9ca3af'];

export default function InventoryDashboard() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.EquipmentMaster.filter({ is_active: true }, 'item_name', 500),
      base44.functions.invoke('inventorySummary', { type: 'all' }).then(r => r.data).catch(() => null),
      base44.entities.InventoryTransaction.list('-created_date', 200)
    ]).then(([m, s, t]) => {
      setItems(m);
      setSummary(s);
      setTransactions(t);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const st = summary?.totals || {};
  const cost = (i) => i.replacement_cost_per_unit || 0;
  const totalValue = items.reduce((s, i) => s + cost(i) * (i.quantity_owned || 0), 0);
  const availableValue = items.reduce((s, i) => s + cost(i) * (i.quantity_available || 0), 0);
  const assignedValue = items.reduce((s, i) => s + cost(i) * (i.quantity_assigned || 0), 0);
  const repairValue = items.reduce((s, i) => s + cost(i) * (i.quantity_out_for_repair || 0), 0);
  const retiredValue = items.reduce((s, i) => s + cost(i) * (i.quantity_retired || 0), 0);

  const lowStock = items.filter(i => (i.quantity_available || 0) <= 2 && (i.quantity_available || 0) > 0);
  const outOfStock = items.filter(i => (i.quantity_available || 0) === 0 && (i.quantity_owned || 0) > 0);

  // InventoryMaster-based warehouse widget metrics (from backend summary — full dataset)
  const totalAvailable = st.totalAvailable || 0;
  const totalReserved = st.totalReserved || 0;
  const totalAssigned = st.totalAssigned || 0;
  const totalOnOrder = st.totalOnOrder || 0;
  const totalDamaged = st.totalDamaged || 0;
  const masterTotalValue = st.totalValue || 0;
  const masterLowStockCount = st.lowStock || 0;
  const masterOutOfStockCount = st.outOfStock || 0;

  const issued = transactions.filter(t => t.transaction_type === 'issue_to_employee');
  const returned = transactions.filter(t => t.transaction_type === 'return_from_employee');
  const adjustments = transactions.filter(t => t.transaction_type === 'adjust_inventory' || t.transaction_type === 'physical_count');

  const byItem = (list) => {
    const map = {};
    list.forEach(t => { map[t.equipment_name] = (map[t.equipment_name] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  };
  const topIssued = byItem(issued);
  const topReturned = byItem(returned);

  const byDay = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    byDay[key] = 0;
  }
  transactions.forEach(t => {
    if (!t.transaction_date) return;
    const key = t.transaction_date.split('T')[0];
    if (key in byDay) byDay[key]++;
  });
  const chartData = Object.entries(byDay).map(([date, count]) => ({ date: date.slice(5), count }));

  const byEmployee = {};
  transactions.forEach(t => { if (t.employee) byEmployee[t.employee] = (byEmployee[t.employee] || 0) + 1; });
  const employeeData = Object.entries(byEmployee).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const byVendor = {};
  transactions.forEach(t => { if (t.vendor) byVendor[t.vendor] = (byVendor[t.vendor] || 0) + 1; });
  const vendorData = Object.entries(byVendor).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const pieData = [
    { name: 'Available', value: availableValue },
    { name: 'Assigned', value: assignedValue },
    { name: 'Repair', value: repairValue },
    { name: 'Retired', value: retiredValue }
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Warehouse Dashboard Widgets */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2">Warehouse Inventory Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <WidgetCard icon={Package} label="Available" value={totalAvailable} color="bg-green-100 text-green-600" />
          <WidgetCard icon={Bookmark} label="Reserved" value={totalReserved} color="bg-yellow-100 text-yellow-700" />
          <WidgetCard icon={TrendingUp} label="Assigned" value={totalAssigned} color="bg-blue-100 text-blue-600" />
          <WidgetCard icon={ShoppingCart} label="On Order" value={totalOnOrder} color="bg-purple-100 text-purple-600" />
          <WidgetCard icon={AlertTriangle} label="Low Stock" value={masterLowStockCount} color="bg-amber-100 text-amber-700" />
          <WidgetCard icon={AlertTriangle} label="Out of Stock" value={masterOutOfStockCount} color="bg-red-100 text-red-600" />
          <WidgetCard icon={Wrench} label="Damaged" value={totalDamaged} color="bg-orange-100 text-orange-600" />
          <WidgetCard icon={DollarSign} label="Inventory Value" value={`$${masterTotalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} color="bg-indigo-100 text-indigo-600" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={DollarSign} label="Inventory Value" value={totalValue} color="bg-blue-100 text-blue-600" />
        <StatCard icon={Package} label="Available Value" value={availableValue} color="bg-green-100 text-green-600" />
        <StatCard icon={TrendingUp} label="Assigned Value" value={assignedValue} color="bg-cyan-100 text-cyan-600" />
        <StatCard icon={Wrench} label="Repair Value" value={repairValue} color="bg-orange-100 text-orange-600" />
        <StatCard icon={Archive} label="Retired Value" value={retiredValue} color="bg-gray-100 text-gray-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Transactions by Day (Last 7)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Inventory Value Breakdown</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(outOfStock.length > 0 || lowStock.length > 0) && (
          <Card className="border-amber-300">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-600" /> Stock Alerts</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {outOfStock.map(i => (
                <div key={i.id} className="flex items-center justify-between text-sm">
                  <span className="text-red-600 font-medium">{i.item_name}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">Out of Stock</span>
                </div>
              ))}
              {lowStock.map(i => (
                <div key={i.id} className="flex items-center justify-between text-sm">
                  <span className="text-amber-700">{i.item_name}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">Low: {i.quantity_available}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Most Issued Items</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {topIssued.length === 0 ? <p className="text-sm text-muted-foreground">No issues recorded yet.</p> :
              topIssued.map(([name, count]) => (
                <div key={name} className="flex items-center justify-between text-sm">
                  <span className="truncate">{name}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">{count}x</span>
                </div>
              ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Most Returned Items</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {topReturned.length === 0 ? <p className="text-sm text-muted-foreground">No returns recorded yet.</p> :
              topReturned.map(([name, count]) => (
                <div key={name} className="flex items-center justify-between text-sm">
                  <span className="truncate">{name}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-cyan-100 text-cyan-700">{count}x</span>
                </div>
              ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Transactions by Employee</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {employeeData.length === 0 ? <p className="text-sm text-muted-foreground">No employee transactions yet.</p> :
              employeeData.map(([name, count]) => (
                <div key={name} className="flex items-center justify-between text-sm">
                  <span className="truncate">{name}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">{count}x</span>
                </div>
              ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Transactions by Vendor</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {vendorData.length === 0 ? <p className="text-sm text-muted-foreground">No vendor transactions yet.</p> :
              vendorData.map(([name, count]) => (
                <div key={name} className="flex items-center justify-between text-sm">
                  <span className="truncate">{name}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700">{count}x</span>
                </div>
              ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Inventory Adjustments</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{adjustments.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Adjustment &amp; physical count transactions</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  const Icon = icon;
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}><Icon className="w-4 h-4" /></div>
        <div>
          <p className="text-lg font-bold">${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function WidgetCard({ icon, label, value, color }) {
  const Icon = icon;
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-7 h-7 rounded-md flex items-center justify-center ${color}`}><Icon className="w-3.5 h-3.5" /></div>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className="text-xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}