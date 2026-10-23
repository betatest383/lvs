import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Plus, Package, Clock, CheckCircle2, Truck, User, Timer, List } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import ConsumableStatusBadge from '@/components/consumables/ConsumableStatusBadge';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

export default function ConsumableDashboard() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const recs = await base44.entities.ConsumableReplenishment.list('-created_date', 500);
      setRecords(recs);
    } catch {
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const today = moment().format('YYYY-MM-DD');
  const todays = records.filter(r => r.date === today);
  const pending = records.filter(r => ['Submitted', 'Pulling', 'Ready for Pickup'].includes(r.status));
  const completed = records.filter(r => r.status === 'Completed');
  const avgTime = completed.length > 0
    ? Math.round(completed.reduce((s, r) => s + (r.fulfillment_time_minutes || 0), 0) / completed.length)
    : 0;

  const itemCounts = {};
  const categoryCounts = {};
  const truckCounts = {};
  const techCounts = {};

  records.forEach(r => {
    if (r.truck_number) truckCounts[r.truck_number] = (truckCounts[r.truck_number] || 0) + 1;
    if (r.technician) techCounts[r.technician] = (techCounts[r.technician] || 0) + 1;
    try {
      const items = JSON.parse(r.items || '[]');
      items.forEach(i => {
        itemCounts[i.item_name] = (itemCounts[i.item_name] || 0) + (i.quantity || 0);
        categoryCounts[i.category] = (categoryCounts[i.category] || 0) + (i.quantity || 0);
      });
    } catch {}
  });

  const topItems = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 7)
    .map(([name, qty]) => ({ name: name.length > 15 ? name.slice(0, 13) + '…' : name, qty }));
  const topCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])
    .map(([name, qty]) => ({ name, qty }));
  const byTruck = Object.entries(truckCounts).sort((a, b) => b[1] - a[1]).slice(0, 7)
    .map(([name, count]) => ({ name, qty: count }));
  const byTech = Object.entries(techCounts).sort((a, b) => b[1] - a[1]).slice(0, 7)
    .map(([name, count]) => ({ name: name.split(' ')[0], qty: count }));

  const stats = [
    { label: "Today's Requests", value: todays.length, icon: Clock, color: 'text-blue-600' },
    { label: 'Pending', value: pending.length, icon: Package, color: 'text-amber-600' },
    { label: 'Completed', value: completed.length, icon: CheckCircle2, color: 'text-green-600' },
    { label: 'Avg Fulfillment', value: `${avgTime}m`, icon: Timer, color: 'text-purple-600' },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Consumable Replenishment</h1>
          <p className="text-xs text-muted-foreground">WH-102 · WF-WH-102 · BP-101</p>
        </div>
        <Button asChild>
          <Link to="/consumables/new"><Plus className="w-4 h-4" /> New Request</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {stats.map(s => (
          <Card key={s.label}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-2xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Most Requested Consumables</h3>
            {topItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topItems} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="qty" fill="hsl(38 92% 50%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Most Requested Categories</h3>
            {topCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topCategories} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="qty" fill="hsl(222 47% 11%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Truck className="w-4 h-4" />Requests by Truck</h3>
            {byTruck.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={byTruck} margin={{ left: -20, right: 10 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis hide />
                  <Tooltip />
                  <Bar dataKey="qty" fill="hsl(173 58% 39%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><User className="w-4 h-4" />Requests by Technician</h3>
            {byTech.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={byTech} margin={{ left: -20, right: 10 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis hide />
                  <Tooltip />
                  <Bar dataKey="qty" fill="hsl(12 76% 61%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Pending Requests</h3>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/consumables/picklist"><List className="w-3.5 h-3.5" /> View All</Link>
            </Button>
          </div>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No pending requests</p>
          ) : (
            <div className="space-y-2">
              {pending.slice(0, 5).map(r => (
                <Link key={r.id} to={`/consumables/${r.id}`} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                  <div>
                    <p className="text-sm font-medium">{r.technician} · {r.truck_number}</p>
                    <p className="text-xs text-muted-foreground">{r.request_id} · {r.total_quantity || 0} units</p>
                  </div>
                  <ConsumableStatusBadge status={r.status} />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}