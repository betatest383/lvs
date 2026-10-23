import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { History, ArrowDown, ArrowUp, Code, ChevronDown } from 'lucide-react';
import { TIMELINE_FILTERS, getTimelineCategory } from '@/lib/inventoryTimelineConstants';
import { groupEventsByDateBucket } from '@/lib/auditUtils';
import { useEmployeeAuditMap } from '@/hooks/useEmployeeAuditMap';
import TimelineEventCard from '@/components/inventory/timeline/TimelineEventCard';

export default function InventoryTimeline({ open, onOpenChange, item, transactions }) {
  const [filter, setFilter] = useState('all');
  const [sortAsc, setSortAsc] = useState(true);
  const [developerMode, setDeveloperMode] = useState(false);
  const employeeMap = useEmployeeAuditMap();

  const events = useMemo(() => {
    const txnEvents = (transactions || []).map(t => ({
      date: t.transaction_date || t.created_date,
      txn: t,
      category: getTimelineCategory(t),
    }));

    const createdEvent = item?.created_date ? [{
      date: item.created_date,
      txn: { transaction_type: 'created', created_by: item.created_by_id, status: 'completed' },
      category: 'movement',
    }] : [];

    return [...createdEvent, ...txnEvents].sort((a, b) => {
      const cmp = new Date(a.date || 0) - new Date(b.date || 0);
      return sortAsc ? cmp : -cmp;
    });
  }, [transactions, item, sortAsc]);

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter(e => e.category === filter);
  }, [events, filter]);

  const grouped = useMemo(() => groupEventsByDateBucket(filteredEvents), [filteredEvents]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" /> Inventory Timeline
          </DialogTitle>
          <DialogDescription>
            Complete lifecycle history for {item?.item_name} ({item?.sku || item?.inventory_id || '—'})
          </DialogDescription>
        </DialogHeader>

        {/* Toolbar: filters + sort + developer mode */}
        <div className="flex items-center justify-between gap-2 border-b pb-2 flex-wrap">
          <div className="flex flex-wrap gap-1">
            {TIMELINE_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  filter === f.value ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70 text-muted-foreground'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant={developerMode ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setDeveloperMode(!developerMode)}
              className={developerMode ? 'bg-purple-600 text-white hover:bg-purple-700' : ''}
            >
              <Code className="w-4 h-4 mr-1" /> Dev Mode
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSortAsc(!sortAsc)}>
              {sortAsc ? <ArrowDown className="w-4 h-4 mr-1" /> : <ArrowUp className="w-4 h-4 mr-1" />}
              {sortAsc ? 'Oldest First' : 'Newest First'}
            </Button>
          </div>
        </div>

        {/* Timeline */}
        <div className="overflow-y-auto flex-1 py-3">
          {grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No events found for this filter.</p>
          ) : (
            <div className="space-y-4">
              {grouped.map(group => (
                <div key={group.key}>
                  <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background py-1 z-10">
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group.label}</span>
                    <span className="text-xs text-muted-foreground">({group.events.length})</span>
                    <div className="flex-1 border-b" />
                  </div>
                  <div className="relative">
                    <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
                    {group.events.map((event, i) => (
                      <TimelineEventCard
                        key={i}
                        event={event}
                        item={item}
                        employeeMap={employeeMap}
                        developerMode={developerMode}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}