import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, ChevronLeft, ChevronRight, Package, Wrench, KeyRound } from 'lucide-react';
import MaterialReturnStatusBadge from '@/components/warehouse/MaterialReturnStatusBadge';
import moment from 'moment';

export default function MaterialReturnHistory() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 20;

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

  const filtered = returns.filter(r => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (r.truck_number || '').toLowerCase().includes(s) ||
      (r.technician || '').toLowerCase().includes(s) ||
      (r.warehouse_associate || '').toLowerCase().includes(s) ||
      (r.job_number || '').toLowerCase().includes(s) ||
      (r.transfer_sheet_number || '').toLowerCase().includes(s) ||
      (r.return_id || '').toLowerCase().includes(s);
  });

  const totalPages = Math.ceil(filtered.length / pageSize);
  const pageData = filtered.slice(page * pageSize, (page + 1) * pageSize);

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Return History</h1>
        <p className="text-sm text-muted-foreground">All truck returns — search by truck, technician, warehouse associate, job, or transfer sheet</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search returns..."
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {pageData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No returns found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">Return ID</th>
                    <th className="p-3 font-medium">Date</th>
                    <th className="p-3 font-medium">Truck</th>
                    <th className="p-3 font-medium">Technician</th>
                    <th className="p-3 font-medium">Warehouse</th>
                    <th className="p-3 font-medium">Transfer Sheet</th>
                    <th className="p-3 font-medium text-center">Materials</th>
                    <th className="p-3 font-medium text-center">Equipment</th>
                    <th className="p-3 font-medium text-center">Rentals</th>
                    <th className="p-3 font-medium text-center">Damaged</th>
                    <th className="p-3 font-medium text-center">Adj.</th>
                    <th className="p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageData.map(r => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="p-3">
                        <Link to={`/warehouse/material-returns/${r.id}`} className="font-medium text-primary hover:underline">
                          {r.return_id}
                        </Link>
                      </td>
                      <td className="p-3 text-xs">{moment(r.created_date).format('MMM D, YYYY')}</td>
                      <td className="p-3">{r.truck_number || '—'}</td>
                      <td className="p-3 text-xs">{r.technician || '—'}</td>
                      <td className="p-3 text-xs">{r.warehouse_associate || '—'}</td>
                      <td className="p-3 text-xs">{r.transfer_sheet_number || '—'}</td>
                      <td className="p-3 text-center">{r.total_items_returned || 0}</td>
                      <td className="p-3 text-center">{r.total_equipment_returned || 0}</td>
                      <td className="p-3 text-center">{r.total_rental_returned || 0}</td>
                      <td className="p-3 text-center text-xs">
                        {(r.total_damaged || 0) + (r.total_equipment_damaged || 0) > 0
                          ? (r.total_damaged || 0) + (r.total_equipment_damaged || 0)
                          : '—'}
                      </td>
                      <td className="p-3 text-center text-xs">
                        {r.manager_review_status && r.manager_review_status !== 'None' ? r.manager_review_status : '—'}
                      </td>
                      <td className="p-3"><MaterialReturnStatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages} · {filtered.length} returns
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}