import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { Package, Download, RotateCcw, ChevronRight, Inbox } from 'lucide-react';
import moment from 'moment';

const STATUS_BADGE = {
  'Picked Up': 'bg-green-100 text-green-700',
  'Completed': 'bg-green-100 text-green-700',
  'Ready for Pickup': 'bg-blue-100 text-blue-700',
  'Staged': 'bg-amber-100 text-amber-700',
  'Requested': 'bg-amber-100 text-amber-700',
  'Submitted': 'bg-amber-100 text-amber-700',
  'Issued': 'bg-blue-100 text-blue-700',
  'Draft': 'bg-slate-100 text-slate-600',
  'Cancelled': 'bg-red-100 text-red-700',
  'Returned': 'bg-purple-100 text-purple-700',
  'Closed': 'bg-slate-100 text-slate-600',
};

export default function MaterialTransfersCard({ transferSheets = [], materialReturns = [], truckNumber }) {
  const today = new Date().toLocaleDateString('en-CA');
  const todayTransfers = transferSheets.filter(t =>
    (t.created_date || '').split('T')[0] === today
  );
  const pendingReturns = materialReturns.filter(r =>
    r.status !== 'Completed' && r.status !== 'Closed' && r.status !== 'Cancelled'
  );

  const hasContent = todayTransfers.length > 0 || pendingReturns.length > 0;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-500" />
            Material Transfers
          </CardTitle>
          <Link to="/warehouse/material-returns">
            <Button variant="ghost" size="sm" className="text-xs h-7">
              All Transfers <ChevronRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {!hasContent ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <Inbox className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No transfers or returns today</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Today's Transfers */}
            {todayTransfers.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Download className="w-3 h-3" /> Today's Transfers ({todayTransfers.length})
                </p>
                {todayTransfers.slice(0, 3).map(t => (
                  <Link key={t.id} to="/warehouse/material-returns/new">
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg border hover:bg-muted/50 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {t.transfer_sheet_number || t.id?.slice(-8) || 'Transfer'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t.technician_received ? 'Received' : 'Awaiting pickup'}
                          {t.created_date && ` · ${moment(t.created_date).format('h:mm A')}`}
                        </p>
                      </div>
                      <Badge className={t.technician_received ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                        {t.technician_received ? 'Received' : 'Pending'}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Pending Returns */}
            {pendingReturns.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Pending Returns ({pendingReturns.length})
                </p>
                {pendingReturns.slice(0, 2).map(r => (
                  <Link key={r.id} to="/warehouse/material-returns">
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg border hover:bg-muted/50 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {r.return_id || r.id?.slice(-8) || 'Return'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{r.status || 'Pending'}</p>
                      </div>
                      <Badge className={STATUS_BADGE[r.status] || 'bg-slate-100 text-slate-600'}>
                        {r.status || 'Pending'}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Quick Action */}
            <Link to="/warehouse/material-returns/new">
              <Button variant="outline" size="sm" className="w-full mt-2 text-xs h-8">
                <Download className="w-3.5 h-3.5 mr-1" /> Receive Transfer
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}