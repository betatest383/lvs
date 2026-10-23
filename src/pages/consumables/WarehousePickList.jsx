import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, ChevronRight, Truck, Clock, User, Package, Filter } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import ConsumableStatusBadge from '@/components/consumables/ConsumableStatusBadge';

export default function WarehousePickList() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('active');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const recs = await base44.entities.ConsumableReplenishment.list('-created_date', 200);
      setRecords(recs);
    } catch {
      toast.error('Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  const today = moment().format('YYYY-MM-DD');
  const filtered = records.filter(r => {
    if (filter === 'today') return r.date === today;
    if (filter === 'active') return r.status !== 'Completed' && r.status !== 'Draft';
    if (filter === 'pending') return ['Submitted', 'Pulling'].includes(r.status);
    if (filter === 'ready') return r.status === 'Ready for Pickup';
    if (filter === 'completed') return r.status === 'Completed';
    return true;
  });

  const filters = [
    { key: 'active', label: 'Active' },
    { key: 'pending', label: 'Pending' },
    { key: 'ready', label: 'Ready' },
    { key: 'today', label: 'Today' },
    { key: 'completed', label: 'Completed' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-bold">Consumable Pick List</h1>
        <p className="text-xs text-muted-foreground">WH-102 | Today's consumable replenishment requests</p>
      </div>

      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No requests in this view</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <Link key={r.id} to={`/consumables/${r.id}`}>
              <Card className="active:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="p-3.5 flex items-center justify-between">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{r.technician}</span>
                      <ConsumableStatusBadge status={r.status} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Truck className="w-3 h-3" />{r.truck_number}</span>
                      {r.submitted_time && (
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{moment(r.submitted_time).format('h:mm A')}</span>
                      )}
                      <span>{r.total_quantity || 0} units</span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}