import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Truck, User, Calendar, Package } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import ConsumableStatusBadge from '@/components/consumables/ConsumableStatusBadge';

export default function ConsumableHistory() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [truckFilter, setTruckFilter] = useState('');
  const [techFilter, setTechFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const recs = await base44.entities.ConsumableReplenishment.list('-created_date', 500);
      setRecords(recs);
    } catch {
      toast.error('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    return records.filter(r => {
      if (truckFilter && !(r.truck_number || '').toLowerCase().includes(truckFilter.toLowerCase())) return false;
      if (techFilter && !(r.technician || '').toLowerCase().includes(techFilter.toLowerCase())) return false;
      if (dateFilter && r.date !== dateFilter) return false;
      return true;
    });
  }, [records, truckFilter, techFilter, dateFilter]);

  const trucks = [...new Set(records.map(r => r.truck_number).filter(Boolean))].sort();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-bold">Consumable History</h1>
        <p className="text-xs text-muted-foreground">WH-102 · Filter by truck, technician, or date</p>
      </div>

      <Card className="mb-4">
        <CardContent className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="relative">
            <Truck className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Truck number" value={truckFilter} onChange={e => setTruckFilter(e.target.value)} className="pl-8" />
          </div>
          <div className="relative">
            <User className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Technician" value={techFilter} onChange={e => setTechFilter(e.target.value)} className="pl-8" />
          </div>
          <div className="relative">
            <Calendar className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="pl-8" />
          </div>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground mb-3">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No records found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            let items = [];
            try { items = JSON.parse(r.items || '[]'); } catch {}
            return (
              <Link key={r.id} to={`/consumables/${r.id}`}>
                <Card className="active:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{r.request_id}</span>
                        <ConsumableStatusBadge status={r.status} />
                      </div>
                      <span className="text-xs text-muted-foreground">{moment(r.date).format('MMM D, Y')}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{r.technician}</span>
                      <span className="flex items-center gap-1"><Truck className="w-3 h-3" />{r.truck_number}</span>
                      <span>{r.total_quantity || 0} units</span>
                    </div>
                    {items.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {items.slice(0, 5).map((it, i) => (
                          <span key={i} className="text-xs bg-muted px-1.5 py-0.5 rounded">
                            {it.item_name} ({it.quantity})
                          </span>
                        ))}
                        {items.length > 5 && <span className="text-xs text-muted-foreground">+{items.length - 5} more</span>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}