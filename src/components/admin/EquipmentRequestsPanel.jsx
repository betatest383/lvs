import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Check, X, RefreshCw, Trash2, Package, FileSignature } from 'lucide-react';
import { toast } from 'sonner';
import EquipmentReceiptViewer from '@/components/shared/EquipmentReceiptViewer';

const STATUS_COLORS = { pending: 'bg-yellow-100 text-yellow-700', approved: 'bg-green-100 text-green-700', denied: 'bg-red-100 text-red-700' };
const URGENCY_COLORS = { low: 'text-muted-foreground', normal: 'text-foreground', high: 'text-orange-600 font-medium', urgent: 'text-red-600 font-semibold' };

export default function EquipmentRequestsPanel() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [disposition, setDisposition] = useState('');
  const [quantityReissued, setQuantityReissued] = useState('');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('pending');
  const [showReceiptsFor, setShowReceiptsFor] = useState(null);

  useEffect(() => {
    base44.entities.EquipmentRequest.list('-created_date', 100)
      .then(setRequests)
      .finally(() => setLoading(false));
  }, []);

  const openRequest = (req) => {
    setSelected(req);
    setAdminNotes(req.admin_notes || '');
    setDisposition(req.old_item_disposition || '');
    setQuantityReissued(req.quantity_reissued?.toString() || '');
  };

  const handleAction = async (status) => {
    if (status === 'approved' && selected.request_type === 'replacement' && !disposition) {
      toast.error('Please select what to do with the old item before approving.');
      return;
    }
    if (status === 'approved' && disposition === 'reissued' && !quantityReissued) {
      toast.error('Please enter the quantity being reissued.');
      return;
    }
    setSaving(true);
    const updateData = { status, admin_notes: adminNotes || null };
    if (selected.request_type === 'replacement' && disposition) {
      updateData.old_item_disposition = disposition;
      if (disposition === 'reissued') {
        updateData.quantity_reissued = parseInt(quantityReissued) || 0;
      }
      if (status === 'approved' && disposition === 'return_to_inventory' && selected.catalog_id) {
        const catItems = await base44.entities.EquipmentCatalog.filter({ id: selected.catalog_id });
        if (catItems.length > 0) {
          const cat = catItems[0];
          await base44.entities.EquipmentCatalog.update(cat.id, { quantity: (cat.quantity || 0) + (selected.quantity || 1) });
        }
      }
    }
    const updated = await base44.entities.EquipmentRequest.update(selected.id, updateData);
    setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));

    // When approving, create a TechEquipment record so it shows in the equipment table
    if (status === 'approved') {
      await base44.entities.TechEquipment.create({
        technician_email: selected.technician_email,
        technician_name: selected.technician_name,
        item_name: selected.item_name,
        quantity: selected.quantity || 1,
        catalog_id: selected.catalog_id || null,
        assigned_date: new Date().toISOString().split('T')[0],
        condition: 'new',
      });

      // For replacements, archive any existing signed receipt for this item
      if (selected.request_type === 'replacement') {
        const oldReceipts = await base44.entities.EquipmentReceipt.filter({
          technician_email: selected.technician_email,
          item_name: selected.item_name,
          is_archived: false,
        });
        let archiveReason;
        if (disposition === 'return_to_inventory') {
          archiveReason = 'Item returned to inventory (replacement issued)';
        } else if (disposition === 'discard') {
          archiveReason = 'Item discarded (replacement issued)';
        } else if (disposition === 'reissued') {
          const qtyRe = parseInt(quantityReissued) || 0;
          const qtyRep = (selected.quantity || 1);
          archiveReason = `Partial return: ${qtyRe} reissued, ${qtyRep} replaced`;
        }
        await Promise.all(oldReceipts.map(r =>
          base44.entities.EquipmentReceipt.update(r.id, { is_archived: true, archive_reason: archiveReason })
        ));
      }
    }

    setSelected(null);
    setAdminNotes('');
    setDisposition('');
    setQuantityReissued('');
    toast.success(status === 'approved' ? 'Request approved — technician will be prompted to sign on their device.' : `Request ${status}`);
    setSaving(false);
  };

  const filtered = requests.filter(r => filter === 'all' || r.status === filter);

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Equipment Requests</h3>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="denied">Denied</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-xl">
          No {filter !== 'all' ? filter : ''} requests.
        </div>
      ) : (
        <div className="divide-y border rounded-xl overflow-hidden">
          {filtered.map(req => (
            <div key={req.id} className="px-4 py-3 bg-card hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => openRequest(req)}>

              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{req.item_name}</p>
                    {req.request_type === 'replacement' && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700 font-medium">
                        <RefreshCw className="w-3 h-3" /> Replacement
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{req.technician_name}</span>
                    {req.quantity > 1 && <span>Qty: <strong>{req.quantity}</strong></span>}
                    <span className={URGENCY_COLORS[req.urgency] || ''}>{req.urgency?.charAt(0).toUpperCase() + req.urgency?.slice(1)}</span>
                    {req.created_date && <span>{new Date(req.created_date).toLocaleDateString()}</span>}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${STATUS_COLORS[req.status] || ''}`}>
                  {req.status?.charAt(0).toUpperCase() + req.status?.slice(1)}
                </span>
              </div>
              {req.reason && <p className="text-xs text-muted-foreground mt-1">{req.reason}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Receipts Viewer Dialog */}
      <Dialog open={!!showReceiptsFor} onOpenChange={open => !open && setShowReceiptsFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileSignature className="w-4 h-4" /> Signed Receipts — {showReceiptsFor?.technician_name}</DialogTitle></DialogHeader>
          {showReceiptsFor && <EquipmentReceiptViewer technicianEmail={showReceiptsFor.technician_email} adminView />}
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Review Request</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 py-2">
              {selected.request_type === 'replacement' && (
                <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
                  <RefreshCw className="w-4 h-4 shrink-0" />
                  <span>This is a <strong>replacement request</strong>. The technician is returning an old item.</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Technician:</span> <span className="font-medium">{selected.technician_name}</span></div>
                <div><span className="text-muted-foreground">Type:</span> <span className="capitalize">{selected.request_type === 'new_tool' ? 'New Tool' : 'Replacement'}</span></div>
                <div><span className="text-muted-foreground">Item:</span> <span className="font-medium">{selected.item_name}</span></div>
                <div><span className="text-muted-foreground">Qty Requested:</span> <span className="font-medium">{selected.quantity || 1}</span></div>
                <div><span className="text-muted-foreground">Urgency:</span> <span className={`capitalize ${URGENCY_COLORS[selected.urgency] || ''}`}>{selected.urgency}</span></div>
              </div>
              {selected.reason && (
                <div>
                  <Label className="text-muted-foreground">Reason</Label>
                  <p className="text-sm mt-0.5">{selected.reason}</p>
                </div>
              )}

              {/* Replacement disposition */}
              {selected.request_type === 'replacement' && selected.status === 'pending' && (
                <div className="space-y-3">
                  <Label>What should happen to the old item? <span className="text-red-500">*</span></Label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDisposition('return_to_inventory')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${disposition === 'return_to_inventory' ? 'border-green-500 bg-green-50 text-green-700' : 'border-border hover:bg-muted/50'}`}
                    >
                      <Package className="w-4 h-4" /> Return to Inventory
                    </button>
                    <button
                      onClick={() => setDisposition('discard')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${disposition === 'discard' ? 'border-red-500 bg-red-50 text-red-700' : 'border-border hover:bg-muted/50'}`}
                    >
                      <Trash2 className="w-4 h-4" /> Discard
                    </button>
                    <button
                      onClick={() => setDisposition('reissued')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${disposition === 'reissued' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-border hover:bg-muted/50'}`}
                    >
                      <RefreshCw className="w-4 h-4" /> Reissued
                    </button>
                  </div>
                  {disposition === 'reissued' && (
                    <div>
                      <Label className="text-sm">Qty being reissued (of {selected.quantity || 1} total) <span className="text-red-500">*</span></Label>
                      <Input className="mt-1" type="number" min="0" max={selected.quantity || 1} value={quantityReissued} onChange={e => setQuantityReissued(e.target.value)} placeholder="e.g. 3" />
                    </div>
                  )}
                </div>
              )}

              {/* Show recorded disposition for already-approved replacements */}
              {selected.request_type === 'replacement' && selected.old_item_disposition && selected.status !== 'pending' && (
                <div className="text-sm space-y-1">
                  <div>
                    <span className="text-muted-foreground">Old item disposition: </span>
                    <span className="font-medium capitalize">
                      {selected.old_item_disposition === 'return_to_inventory' ? 'Returned to Inventory' : selected.old_item_disposition === 'discard' ? 'Discarded' : 'Reissued'}
                    </span>
                  </div>
                  {selected.old_item_disposition === 'reissued' && selected.quantity_reissued != null && (
                    <div>
                      <span className="text-muted-foreground">Reissued: </span>
                      <span className="font-medium">{selected.quantity_reissued} units, {selected.quantity - selected.quantity_reissued} replaced</span>
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label>Admin Notes</Label>
                <Textarea className="mt-1" rows={2} value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="Optional response to technician" />
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowReceiptsFor(selected); setSelected(null); }} className="mr-auto">
              <FileSignature className="w-3.5 h-3.5 mr-1" /> View Receipts
            </Button>
            <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
            {selected?.status === 'pending' && (
              <>
                <Button variant="destructive" onClick={() => handleAction('denied')} disabled={saving}>
                  <X className="w-4 h-4 mr-1" /> Deny
                </Button>
                <Button onClick={() => handleAction('approved')} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white">
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <Check className="w-4 h-4 mr-1" /> Approve
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}