import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Package, Wrench, KeyRound } from 'lucide-react';
import MaterialReturnStatusBadge from '@/components/warehouse/MaterialReturnStatusBadge';
import moment from 'moment';

export default function WarehouseReturns() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('Warehouse Reviewing');

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

  const filtered = filter === 'all' ? returns : returns.filter(r => r.status === filter);

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const filters = ['Pending Return', 'Warehouse Reviewing', 'Returned', 'Verified', 'Adjusted', 'Closed', 'all'];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Warehouse Returns</h1>
        <p className="text-sm text-muted-foreground">Verify truck returns — materials, equipment, and rentals</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            {f === 'all' ? 'All' : f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No returns in this status</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <Link key={r.id} to={`/warehouse/material-returns/${r.id}`}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{r.return_id}</p>
                        <MaterialReturnStatusBadge status={r.status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {r.technician} · Truck {r.truck_number}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.transfer_sheet_number || 'No TS'} · {r.job_number || 'No job'}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="flex items-center gap-2 justify-end">
                        {(r.total_items_returned || 0) > 0 && <span className="text-xs text-green-600 flex items-center gap-0.5"><Package className="h-3 w-3" /> {r.total_items_returned}</span>}
                        {(r.total_equipment_returned || 0) > 0 && <span className="text-xs text-blue-600 flex items-center gap-0.5"><Wrench className="h-3 w-3" /> {r.total_equipment_returned}</span>}
                        {(r.total_rental_returned || 0) > 0 && <span className="text-xs text-purple-600 flex items-center gap-0.5"><KeyRound className="h-3 w-3" /> {r.total_rental_returned}</span>}
                      </div>
                      {(r.total_damaged > 0 || r.total_equipment_damaged > 0) && (
                        <p className="text-xs text-orange-600 mt-1">{(r.total_damaged || 0) + (r.total_equipment_damaged || 0)} damaged</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">{moment(r.created_date).format('MMM D, h:mm A')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}