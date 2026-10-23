import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { FileCheck, ChevronRight, Calendar } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const statusColor = {
  draft: 'bg-gray-100 text-gray-600',
  pending_review: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  sent: 'bg-indigo-100 text-indigo-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
};

export default function MyEstimatesPage() {
  const [estimates, setEstimates] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    base44.auth.me().then(u => {
      base44.entities.Estimate.filter({ customer_id: u.id }, '-created_date', 50).then(setEstimates);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Estimates</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Review repair estimates for your property</p>
      </div>

      {estimates.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center text-muted-foreground">
            <FileCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No estimates yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {estimates.map(e => (
            <Card key={e.id} className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelected(e)}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="bg-muted rounded-lg p-2 mt-0.5">
                    <FileCheck className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">Estimate #{e.id?.slice(-6)}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColor[e.status] || ''}`}>{e.status?.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(e.created_date).toLocaleDateString()}</span>
                      {e.valid_until && <span>Valid until {e.valid_until}</span>}
                    </div>
                    <p className="text-sm font-bold mt-1 text-foreground">Total: ${e.total?.toFixed(2) || '0.00'}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Estimate Details</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Status:</span>
                  <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColor[selected.status] || ''}`}>{selected.status?.replace(/_/g, ' ')}</span>
                </div>
                <div><span className="text-muted-foreground">Valid Until:</span> <span className="font-medium">{selected.valid_until || '—'}</span></div>
              </div>
              {selected.line_items && (() => {
                let items = [];
                try { items = JSON.parse(selected.line_items); } catch {}
                return items.length > 0 ? (
                  <div>
                    <h3 className="font-semibold text-sm mb-2">Line Items</h3>
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-xs text-muted-foreground"><th className="text-left py-1">Item</th><th className="text-right py-1">Price</th></tr></thead>
                      <tbody>
                        {items.map((item, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-2">{item.name || item.description}</td>
                            <td className="py-2 text-right">${(item.price || item.total || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null;
              })()}
              <div className="border-t pt-3 space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>${selected.subtotal?.toFixed(2) || '0.00'}</span></div>
                {selected.tax_amount > 0 && <div className="flex justify-between text-muted-foreground"><span>Tax ({selected.tax_rate}%)</span><span>${selected.tax_amount?.toFixed(2)}</span></div>}
                <div className="flex justify-between font-bold text-base"><span>Total</span><span>${selected.total?.toFixed(2) || '0.00'}</span></div>
              </div>
              {selected.notes && <div><h3 className="font-semibold text-sm mb-1">Notes</h3><p className="text-sm text-muted-foreground">{selected.notes}</p></div>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}