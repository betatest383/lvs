import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bookmark, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

function parseLineItems(lineItemsStr) {
  if (!lineItemsStr) return [];
  try {
    const parsed = typeof lineItemsStr === 'string' ? JSON.parse(lineItemsStr) : lineItemsStr;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function TopReservedInventoryWidget() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [masters, transfers] = await Promise.all([
          base44.entities.InventoryMaster.list('-created_date', 200),
          base44.entities.MaterialTransferSheet.list('-created_date', 200),
        ]);

        const reserved = (masters || [])
          .filter(m => (m.quantity_reserved || 0) > 0)
          .sort((a, b) => (b.quantity_reserved || 0) - (a.quantity_reserved || 0))
          .slice(0, 5);

        const enriched = reserved.map(item => {
          const match = (transfers || []).find(ts => {
            const lineItems = parseLineItems(ts.line_items);
            return lineItems.some(li =>
              li.inventory_master_id === item.id ||
              li.inventory_master_id === item.inventory_id ||
              (item.sku && li.sku === item.sku)
            );
          });
          return {
            ...item,
            transfer: match,
          };
        });

        setItems(enriched);
      } catch (err) {
        console.error('TopReservedInventoryWidget error:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-amber-600" /> Top Reserved Inventory
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No reserved inventory items.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="p-1.5 font-medium">Item</th>
                  <th className="p-1.5 font-medium text-right">Reserved Qty</th>
                  <th className="p-1.5 font-medium">Reserved By</th>
                  <th className="p-1.5 font-medium">Next Pickup</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="p-1.5 text-xs">
                      <Link to={`/inventory/master/detail/${item.id}`} className="text-blue-600 hover:underline font-medium">
                        {item.item_name}
                      </Link>
                      <p className="text-xs text-muted-foreground font-mono">{item.sku || item.inventory_id || '—'}</p>
                    </td>
                    <td className="p-1.5 text-xs text-right tabular-nums font-bold text-amber-700">{item.quantity_reserved}</td>
                    <td className="p-1.5 text-xs">
                      {item.transfer?.technician || '—'}
                    </td>
                    <td className="p-1.5 text-xs">
                      {item.transfer?.ready_date
                        ? new Date(item.transfer.ready_date).toLocaleDateString()
                        : item.transfer?.requested_date
                          ? new Date(item.transfer.requested_date).toLocaleDateString()
                          : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}