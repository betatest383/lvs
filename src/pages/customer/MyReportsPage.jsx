import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Calendar, MapPin, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const conditionColor = {
  excellent: 'bg-green-100 text-green-700',
  good: 'bg-blue-100 text-blue-700',
  fair: 'bg-amber-100 text-amber-700',
  poor: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

export default function MyReportsPage() {
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(async u => {
      setUser(u);
      const customers = await base44.entities.Customer.filter({ portal_user_email: u.email });
      if (customers.length === 0) return;
      const customerId = customers[0].id;
      base44.entities.InspectionReport.filter({ customer_id: customerId, status: 'published' }, '-created_date', 50).then(setReports);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Inspection Reports</h1>
        <p className="text-muted-foreground text-sm mt-0.5">View all completed chimney inspection reports</p>
      </div>

      {reports.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No inspection reports yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {reports.map(r => (
            <Card key={r.id} className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelected(r)}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="bg-muted rounded-lg p-2 mt-0.5">
                    <FileText className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{r.address || 'Inspection Report'}</span>
                      {r.overall_condition && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${conditionColor[r.overall_condition] || ''}`}>
                          {r.overall_condition}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{r.inspection_date || new Date(r.created_date).toLocaleDateString()}</span>
                      {r.technician_name && <span>by {r.technician_name}</span>}
                    </div>
                    {r.summary && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.summary}</p>}
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
            <DialogTitle>Inspection Report</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Address:</span> <span className="font-medium">{selected.address}</span></div>
                <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{selected.inspection_date}</span></div>
                <div><span className="text-muted-foreground">Technician:</span> <span className="font-medium">{selected.technician_name}</span></div>
                <div><span className="text-muted-foreground">Condition:</span>
                  <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${conditionColor[selected.overall_condition] || ''}`}>{selected.overall_condition}</span>
                </div>
              </div>
              {selected.summary && (
                <div>
                  <h3 className="font-semibold text-sm mb-1">Summary</h3>
                  <p className="text-sm text-muted-foreground">{selected.summary}</p>
                </div>
              )}
              {selected.recommendations && (
                <div>
                  <h3 className="font-semibold text-sm mb-1">Recommendations</h3>
                  <p className="text-sm text-muted-foreground">{selected.recommendations}</p>
                </div>
              )}
              {selected.photos?.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-2">Photos</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {selected.photos.map((url, i) => (
                      <img key={i} src={url} alt="" className="rounded-lg object-cover aspect-square w-full" />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}