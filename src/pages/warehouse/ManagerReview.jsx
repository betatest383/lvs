import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { ClipboardList, ArrowLeftRight, Undo2, Sparkles, MapPin, ChevronRight } from 'lucide-react';
import { StatusBadge } from '@/components/warehouse/statusConfig.jsx';

export default function ManagerReview() {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [checklists, transfers, returns, cleanups, binReqs] = await Promise.all([
          base44.entities.HardwareChecklist.list('-created_date', 200),
          base44.entities.MaterialTransferSheet.list('-created_date', 200),
          base44.entities.ReturnedMaterial.list('-created_date', 200),
          base44.entities.WarehouseCleanup.list('-created_date', 200),
          base44.entities.BinDesignationRequest.list('-created_date', 200),
        ]);
        setData({
          checklistsPending: checklists.filter(c => c.status !== 'Completed'),
          transfersOpen: transfers.filter(t => t.status === 'Draft' || t.status === 'Submitted'),
          returnsPending: returns.filter(r => r.status === 'Received' || r.status === 'Needs Correction'),
          cleanupsIncomplete: cleanups.filter(c => c.status === 'Incomplete'),
          binReqsPending: binReqs.filter(b => b.status === 'Pending' || b.status === 'Approved'),
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  const { checklistsPending = [], transfersOpen = [], returnsPending = [], cleanupsIncomplete = [], binReqsPending = [] } = data;
  const totalPending = checklistsPending.length + transfersOpen.length + returnsPending.length + cleanupsIncomplete.length + binReqsPending.length;

  const sections = [
    { title: 'Hardware Checklists', icon: ClipboardList, to: '/warehouse/hardware-checklists', items: checklistsPending, renderItem: (item) => ({ primary: item.technician, secondary: `${item.date}${item.truck_number ? ` • Truck #${item.truck_number}` : ''}`, status: item.status }) },
    { title: 'Material Transfer Sheets', icon: ArrowLeftRight, to: '/warehouse/transfer-sheets', items: transfersOpen, renderItem: (item) => ({ primary: item.technician, secondary: `${item.date}${item.job_number ? ` • Job #${item.job_number}` : ''}`, status: item.status }) },
    { title: 'Returned Materials', icon: Undo2, to: '/warehouse/returned-materials', items: returnsPending, renderItem: (item) => ({ primary: item.technician, secondary: `${item.date}${item.transfer_sheet_attached !== 'Yes' ? ' • No sheet' : ''}`, status: item.status }) },
    { title: 'Warehouse Cleanup', icon: Sparkles, to: '/warehouse/cleanup', items: cleanupsIncomplete, renderItem: (item) => ({ primary: item.completed_by, secondary: item.date, status: item.status }) },
    { title: 'Bin Designation Requests', icon: MapPin, to: '/warehouse/bin-requests', items: binReqsPending, renderItem: (item) => ({ primary: item.item_name, secondary: item.requested_by || '', status: item.status }) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Manager Review Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          {totalPending > 0 ? `${totalPending} items pending review` : 'All warehouse items are up to date'}
        </p>
      </div>

      {sections.map((section, si) => (
        <div key={si} className="space-y-2">
          <Link to={section.to} className="flex items-center justify-between group">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <section.icon className="w-4 h-4 text-primary" />
              </div>
              <h2 className="text-sm font-semibold">{section.title}</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{section.items.length} pending</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </div>
          </Link>

          {section.items.length === 0 ? (
            <Card className="border shadow-sm">
              <CardContent className="p-3 text-center text-xs text-muted-foreground">
                All caught up — no pending items
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1.5">
              {section.items.slice(0, 5).map((item, i) => {
                const rendered = section.renderItem(item);
                return (
                  <Link key={item.id || i} to={section.to}>
                    <Card className="border shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{rendered.primary}</p>
                          {rendered.secondary && <p className="text-xs text-muted-foreground truncate">{rendered.secondary}</p>}
                        </div>
                        <StatusBadge status={rendered.status} />
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
              {section.items.length > 5 && (
                <Link to={section.to} className="block text-center text-xs text-muted-foreground hover:text-foreground py-1">
                  View all {section.items.length} items →
                </Link>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}