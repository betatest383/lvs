import { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Undo2, Wrench, CheckCircle2, AlertTriangle, Package } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const CONDITIONS = [
  { value: 'good', label: 'Unused / Good', color: 'text-green-600', needsNotes: false },
  { value: 'damaged', label: 'Damaged', color: 'text-red-600', needsNotes: true },
  { value: 'partial', label: 'Partial', color: 'text-amber-600', needsNotes: true },
  { value: 'missing', label: 'Missing', color: 'text-purple-600', needsNotes: true },
];

export default function PreviousDayReturnDialog({
  open, onClose, identity, truckNumber, onReturnCompleted,
}) {
  const [tab, setTab] = useState('materials');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [returnableItems, setReturnableItems] = useState([]);
  const [returnableEquipment, setReturnableEquipment] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [returnQty, setReturnQty] = useState(0);
  const [condition, setCondition] = useState('good');
  const [notes, setNotes] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [confirmNoReturns, setConfirmNoReturns] = useState(false);

  const techEmail = identity?.email || '';
  const techName = identity?.fullName || '';
  const truck = truckNumber || identity?.truckNumber || '';

  const loadReturnable = useCallback(async () => {
    if (!techEmail && !truck) return;
    setLoading(true);
    try {
      const [transfers, transactions, techEquipment, inventoryMaster] = await Promise.all([
        base44.entities.MaterialTransferSheet.list('-created_date', 200).catch(() => []),
        base44.entities.InventoryTransaction.list('-created_date', 500).catch(() => []),
        base44.entities.TechEquipment.list('-created_date', 200).catch(() => []),
        base44.entities.InventoryMaster.list('-updated_date', 200).catch(() => []),
      ]);

      // Materials: find transfer sheets and transactions issued to this tech/truck
      const myTransfers = transfers.filter(t =>
        t.technician_email === techEmail ||
        t.technician === techName ||
        t.truck_number === truck ||
        t.truck === truck
      );

      // Build returnable material list from transfer sheet line items
      const materialMap = new Map();
      myTransfers.forEach(transfer => {
        let lineItems = [];
        try { lineItems = JSON.parse(transfer.line_items || '[]'); } catch { /* */ }
        lineItems.forEach(li => {
          const key = `${transfer.id}_${li.inventory_master_id || li.sku || li.item_name}`;
          const issued = parseFloat(li.quantity_requested) || 0;
          if (issued <= 0) return;
          const existing = materialMap.get(key);
          if (existing) {
            existing.qtyIssued += issued;
          } else {
            materialMap.set(key, {
              key,
              transferId: transfer.transfer_id || transfer.id,
              transferRecordId: transfer.id,
              jobId: transfer.job_id || '',
              jobNumber: transfer.job_number || '',
              customerName: transfer.customer_name || '',
              inventoryMasterId: li.inventory_master_id || '',
              sku: li.sku || '',
              itemName: li.item_name || '',
              unit: li.unit || 'ea',
              qtyIssued: issued,
              qtyReturned: 0,
              source: 'transfer',
            });
          }
        });
      });

      // Also check inventory transactions for issue_to_employee / assign / fulfill / truck_restock
      const myIssueTxns = transactions.filter(t =>
        t.employee === techName ||
        t.created_by === techEmail ||
        t.truck === truck ||
        t.related_employee === techEmail ||
        (t.transaction_type || '').includes('issue') ||
        (t.transaction_type || '').includes('assign') ||
        (t.transaction_type || '').includes('fulfill') ||
        (t.transaction_type || '').includes('truck_restock')
      );

      myIssueTxns.forEach(txn => {
        if (!txn.inventory_master_id && !txn.inventory_item_name) return;
        const txnType = txn.transaction_type || '';
        // Only count issue/assign/fulfill transactions
        if (!['issue_to_employee', 'assign', 'fulfill', 'truck_restock', 'consumable_fulfill'].includes(txnType)) return;
        // Skip if not related to this tech or truck
        const isMine = txn.employee === techName || txn.created_by === techEmail ||
          txn.truck === truck || txn.related_employee === techEmail;
        if (!isMine) return;

        const key = `txn_${txn.id}`;
        const issued = parseFloat(txn.quantity) || 0;
        if (issued <= 0) return;
        const existing = materialMap.get(key);
        if (existing) {
          existing.qtyIssued += issued;
        } else {
          materialMap.set(key, {
            key,
            transferId: '',
            transferRecordId: '',
            jobId: txn.related_task || '',
            jobNumber: txn.related_task || '',
            customerName: '',
            inventoryMasterId: txn.inventory_master_id || '',
            sku: txn.consumable_sku || '',
            itemName: txn.inventory_item_name || txn.equipment_name || '',
            unit: 'ea',
            qtyIssued: issued,
            qtyReturned: 0,
            source: 'transaction',
            txnId: txn.id,
          });
        }
      });

      // Calculate already-returned quantities from return transactions
      const returnTxns = transactions.filter(t =>
        ['return', 'return_from_employee', 'truck_return', 'consumable_return'].includes(t.transaction_type)
      );
      returnTxns.forEach(txn => {
        const returned = parseFloat(txn.quantity) || 0;
        if (returned <= 0) return;
        // Match by inventory_master_id or item name
        for (const item of materialMap.values()) {
          if (item.inventoryMasterId && item.inventoryMasterId === txn.inventory_master_id) {
            item.qtyReturned += returned;
            break;
          }
          if (item.itemName && item.itemName === txn.inventory_item_name) {
            item.qtyReturned += returned;
            break;
          }
        }
      });

      // Filter: only items with remaining returnable quantity
      const returnable = Array.from(materialMap.values())
        .map(item => ({
          ...item,
          qtyReturnable: Math.max(0, item.qtyIssued - item.qtyReturned),
        }))
        .filter(item => item.qtyReturnable > 0);

      setReturnableItems(returnable);

      // Equipment: find temporary assignments without return
      const myEquipment = techEquipment.filter(e =>
        e.assigned_employee_email === techEmail ||
        e.assigned_employee === techName ||
        e.assigned_truck === truck ||
        e.assigned_truck_number === truck
      ).filter(e =>
        e.assignment_type === 'temporary' &&
        !e.actual_return_datetime &&
        e.is_active !== false &&
        !['retired', 'warehouse_stock'].includes(e.status)
      );

      setReturnableEquipment(myEquipment);
    } catch (e) {
      console.error('Load returnable error:', e);
      toast.error('Failed to load returnable items.');
    } finally {
      setLoading(false);
    }
  }, [techEmail, techName, truck]);

  useEffect(() => {
    if (open) {
      loadReturnable();
      // Reset state
      setSelectedItem(null);
      setSelectedEquipment(null);
      setReturnQty(0);
      setCondition('good');
      setNotes('');
      setPhotoFile(null);
      setConfirmNoReturns(false);
      setSearch('');
    }
  }, [open, loadReturnable]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return returnableItems;
    const q = search.toLowerCase();
    return returnableItems.filter(i =>
      (i.itemName || '').toLowerCase().includes(q) ||
      (i.sku || '').toLowerCase().includes(q) ||
      (i.jobNumber || '').toLowerCase().includes(q) ||
      (i.customerName || '').toLowerCase().includes(q)
    );
  }, [returnableItems, search]);

  const filteredEquipment = useMemo(() => {
    if (!search.trim()) return returnableEquipment;
    const q = search.toLowerCase();
    return returnableEquipment.filter(e =>
      (e.item_name || '').toLowerCase().includes(q) ||
      (e.equipment_id || '').toLowerCase().includes(q) ||
      (e.serial_number || '').toLowerCase().includes(q)
    );
  }, [returnableEquipment, search]);

  const maxQty = selectedItem?.qtyReturnable || 0;
  const conditionConfig = CONDITIONS.find(c => c.value === condition);
  const needsNotes = conditionConfig?.needsNotes;
  const canSubmit = selectedItem && returnQty > 0 && returnQty <= maxQty && (!needsNotes || notes.trim());

  const handleSubmitMaterial = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      let photoUrl = '';
      if (photoFile) {
        try {
          const upload = await base44.integrations.Core.UploadFile({ file: photoFile });
          photoUrl = upload.file_url;
        } catch { /* photo optional */ }
      }

      // Create inventory transaction via secured backend function
      if (!selectedItem.inventoryMasterId) {
        toast.error('Cannot process return — no inventory master record linked to this item. Use the warehouse material return flow.');
        setSubmitting(false);
        return;
      }
      await base44.functions.invoke('processInventoryMasterTransaction', {
        transaction_type: 'return',
        inventory_master_id: selectedItem.inventoryMasterId,
        quantity: returnQty,
        related_employee: techName,
        related_truck: truck,
        related_job: selectedItem.jobNumber || selectedItem.jobId,
        reason: `Previous Day Closeout return — ${condition}`,
        notes: `${notes.trim()}${photoUrl ? ` | Photo: ${photoUrl}` : ''} | Condition: ${condition}`,
        idempotency_key: `prev-day-return-${selectedItem.inventoryMasterId}-${Date.now()}`,
      });

      // Update material transfer returned quantity if from transfer
      if (selectedItem.transferRecordId && selectedItem.source === 'transfer') {
        try {
          const transfer = await base44.entities.MaterialTransferSheet.get(selectedItem.transferRecordId);
          const lineItems = JSON.parse(transfer.line_items || '[]');
          const updatedItems = lineItems.map(li => {
            if ((li.inventory_master_id === selectedItem.inventoryMasterId) ||
                (li.item_name === selectedItem.itemName && li.sku === selectedItem.sku)) {
              const existingReturned = parseFloat(li.quantity_returned) || 0;
              return { ...li, quantity_returned: existingReturned + returnQty };
            }
            return li;
          });
          const totalReturned = (transfer.quantity_returned || 0) + returnQty;
          await base44.entities.MaterialTransferSheet.update(selectedItem.transferRecordId, {
            line_items: JSON.stringify(updatedItems),
            quantity_returned: totalReturned,
            status: totalReturned >= selectedItem.qtyIssued ? 'Returned' : transfer.status,
          });
        } catch (e) { console.error('Transfer update error:', e); }
      }

      // Log to job timeline if job exists
      if (selectedItem.jobId) {
        try {
          await base44.entities.JobActivityLog.create({
            job_id: selectedItem.jobId,
            job_number: selectedItem.jobNumber,
            customer_name: selectedItem.customerName,
            technician_email: techEmail,
            event_type: 'material_transfer',
            event_label: `Returned ${returnQty} ${selectedItem.unit} of ${selectedItem.itemName} (${condition})`,
            event_details: JSON.stringify({
              sku: selectedItem.sku,
              quantity: returnQty,
              condition,
              transfer_id: selectedItem.transferId,
            }),
            performed_by: techName,
            timestamp: new Date().toISOString(),
          });
        } catch { /* timeline optional */ }
      }

      toast.success(`Returned ${returnQty} ${selectedItem.unit} of ${selectedItem.itemName}`);
      onReturnCompleted?.();
      await loadReturnable(); // refresh list
      setSelectedItem(null);
      setReturnQty(0);
      setCondition('good');
      setNotes('');
      setPhotoFile(null);
    } catch (e) {
      console.error('Return submit error:', e);
      toast.error('Failed to process return.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitEquipment = async () => {
    if (!selectedEquipment || !condition) return;
    if (CONDITIONS.find(c => c.value === condition)?.needsNotes && !notes.trim()) return;
    setSubmitting(true);
    try {
      let photoUrl = '';
      if (photoFile) {
        try {
          const upload = await base44.integrations.Core.UploadFile({ file: photoFile });
          photoUrl = upload.file_url;
        } catch { /* */ }
      }

      await base44.entities.TechEquipment.update(selectedEquipment.id, {
        actual_return_datetime: new Date().toISOString(),
        return_condition: condition === 'good' ? 'good' : condition === 'damaged' ? 'damaged' : condition === 'missing' ? 'missing' : 'fair',
        return_reason: `Previous Day Closeout — ${condition}`,
        quantity_returned: selectedEquipment.quantity || 1,
        returned_by: techName,
        notes: notes.trim() || selectedEquipment.notes,
        is_active: false,
        status: condition === 'good' ? 'active' : condition === 'damaged' ? 'damaged' : condition === 'missing' ? 'missing' : 'active',
        assignment_type: 'retired',
      });

      // Log to job timeline
      if (selectedEquipment.assigned_job) {
        try {
          await base44.entities.JobActivityLog.create({
            job_id: selectedEquipment.assigned_job,
            technician_email: techEmail,
            event_type: 'equipment_returned',
            event_label: `Returned equipment: ${selectedEquipment.item_name} (${condition})`,
            performed_by: techName,
            timestamp: new Date().toISOString(),
          });
        } catch { /* */ }
      }

      toast.success(`Returned: ${selectedEquipment.item_name}`);
      onReturnCompleted?.();
      await loadReturnable();
      setSelectedEquipment(null);
      setCondition('good');
      setNotes('');
      setPhotoFile(null);
    } catch (e) {
      console.error('Equipment return error:', e);
      toast.error('Failed to process equipment return.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmNoReturns = () => {
    onReturnCompleted?.(true);
    onClose();
    toast.success('Confirmed: no returns needed for previous day.');
  };

  const allCleared = returnableItems.length === 0 && returnableEquipment.length === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="w-5 h-5 text-accent" /> Previous Day Closeout — Returns
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-2 border-b pb-2">
          <button
            onClick={() => { setTab('materials'); setSelectedItem(null); }}
            className={`px-3 py-1.5 text-sm font-medium rounded-t-lg flex items-center gap-1 ${
              tab === 'materials' ? 'bg-accent/10 text-accent border-b-2 border-accent' : 'text-muted-foreground'
            }`}
          >
            <Package className="w-4 h-4" /> Materials ({returnableItems.length})
          </button>
          <button
            onClick={() => { setTab('equipment'); setSelectedEquipment(null); }}
            className={`px-3 py-1.5 text-sm font-medium rounded-t-lg flex items-center gap-1 ${
              tab === 'equipment' ? 'bg-accent/10 text-accent border-b-2 border-accent' : 'text-muted-foreground'
            }`}
          >
            <Wrench className="w-4 h-4" /> Equipment ({returnableEquipment.length})
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-accent" />
          </div>
        ) : allCleared && !selectedItem && !selectedEquipment ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <div>
              <p className="font-medium text-green-700">All returns reconciled!</p>
              <p className="text-sm text-muted-foreground">No outstanding materials or equipment to return.</p>
            </div>
            <Button onClick={handleConfirmNoReturns} className="gap-1">
              <CheckCircle2 className="w-4 h-4" /> Confirm & Close
            </Button>
          </div>
        ) : (
          <>
            {/* Search */}
            {!selectedItem && !selectedEquipment && (
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={`Search ${tab === 'materials' ? 'materials' : 'equipment'}...`}
                  className="pl-8"
                />
              </div>
            )}

            {/* Materials List */}
            {tab === 'materials' && !selectedItem && (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {filteredItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {search ? 'No matching items found.' : 'No returnable materials found.'}
                  </p>
                ) : (
                  filteredItems.map(item => (
                    <button
                      key={item.key}
                      onClick={() => { setSelectedItem(item); setReturnQty(0); setCondition('good'); setNotes(''); }}
                      className="w-full text-left p-3 rounded-lg border hover:border-accent hover:bg-accent/5 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{item.itemName}</p>
                          <p className="text-xs text-muted-foreground font-mono">{item.sku || '—'}</p>
                          {item.jobNumber && (
                            <p className="text-xs text-muted-foreground">Job {item.jobNumber}{item.customerName ? ` — ${item.customerName}` : ''}</p>
                          )}
                          {item.transferId && (
                            <p className="text-xs text-muted-foreground">Transfer {item.transferId}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <Badge variant="secondary" className="text-[10px]">Returnable: {item.qtyReturnable} {item.unit}</Badge>
                          <p className="text-[10px] text-muted-foreground mt-1">Issued: {item.qtyIssued} · Returned: {item.qtyReturned}</p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Material Return Form */}
            {tab === 'materials' && selectedItem && (
              <div className="space-y-3">
                <button onClick={() => setSelectedItem(null)} className="text-xs text-muted-foreground hover:text-accent">
                  ← Back to list
                </button>
                <div className="p-3 rounded-lg bg-muted/40 border">
                  <p className="font-medium">{selectedItem.itemName}</p>
                  <p className="text-xs text-muted-foreground font-mono">{selectedItem.sku}</p>
                  {selectedItem.jobNumber && <p className="text-xs">Job: {selectedItem.jobNumber} — {selectedItem.customerName}</p>}
                  {selectedItem.transferId && <p className="text-xs">Transfer: {selectedItem.transferId}</p>}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded bg-muted/40">
                    <p className="text-xs text-muted-foreground">Issued</p>
                    <p className="font-bold">{selectedItem.qtyIssued} {selectedItem.unit}</p>
                  </div>
                  <div className="p-2 rounded bg-muted/40">
                    <p className="text-xs text-muted-foreground">Returned</p>
                    <p className="font-bold">{selectedItem.qtyReturned} {selectedItem.unit}</p>
                  </div>
                  <div className="p-2 rounded bg-amber-50 border border-amber-200">
                    <p className="text-xs text-amber-700">Remaining</p>
                    <p className="font-bold text-amber-700">{selectedItem.qtyReturnable} {selectedItem.unit}</p>
                  </div>
                </div>
                <div>
                  <Label>Return Quantity</Label>
                  <Input
                    type="number"
                    min="1"
                    max={selectedItem.qtyReturnable}
                    value={returnQty}
                    onChange={e => setReturnQty(Math.min(Math.max(0, parseInt(e.target.value) || 0), selectedItem.qtyReturnable))}
                  />
                  {returnQty > selectedItem.qtyReturnable && (
                    <p className="text-xs text-red-600 mt-1">Cannot exceed {selectedItem.qtyReturnable}</p>
                  )}
                  {returnQty === 0 && (
                    <p className="text-xs text-amber-600 mt-1">Quantity must be greater than zero</p>
                  )}
                </div>
                <div>
                  <Label>Condition</Label>
                  <div className="grid grid-cols-4 gap-1">
                    {CONDITIONS.map(c => (
                      <button
                        key={c.value}
                        onClick={() => setCondition(c.value)}
                        className={`px-2 py-1.5 rounded text-xs font-medium border transition-colors ${
                          condition === c.value
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-border hover:bg-muted/50'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
                {needsNotes && (
                  <div>
                    <Label>Notes <span className="text-red-500">*</span></Label>
                    <Textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder={`Explain the ${condition} condition...`}
                      rows={2}
                    />
                  </div>
                )}
                <div>
                  <Label>Photo (optional)</Label>
                  <input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files?.[0])} className="w-full text-xs" />
                </div>
              </div>
            )}

            {/* Equipment List */}
            {tab === 'equipment' && !selectedEquipment && (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {filteredEquipment.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {search ? 'No matching equipment found.' : 'No returnable equipment found.'}
                  </p>
                ) : (
                  filteredEquipment.map(eq => (
                    <button
                      key={eq.id}
                      onClick={() => { setSelectedEquipment(eq); setCondition('good'); setNotes(''); }}
                      className="w-full text-left p-3 rounded-lg border hover:border-accent hover:bg-accent/5 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{eq.item_name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{eq.equipment_id || '—'}</p>
                          {eq.serial_number && <p className="text-xs text-muted-foreground">SN: {eq.serial_number}</p>}
                          {eq.assigned_job && <p className="text-xs text-muted-foreground">Job: {eq.assigned_job}</p>}
                          {eq.assigned_truck && <p className="text-xs text-muted-foreground">Truck: {eq.assigned_truck}</p>}
                        </div>
                        <Badge variant="outline" className="text-[10px]">{eq.condition || 'good'}</Badge>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Equipment Return Form */}
            {tab === 'equipment' && selectedEquipment && (
              <div className="space-y-3">
                <button onClick={() => setSelectedEquipment(null)} className="text-xs text-muted-foreground hover:text-accent">
                  ← Back to list
                </button>
                <div className="p-3 rounded-lg bg-muted/40 border">
                  <p className="font-medium">{selectedEquipment.item_name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{selectedEquipment.equipment_id}</p>
                  {selectedEquipment.serial_number && <p className="text-xs">SN: {selectedEquipment.serial_number}</p>}
                  {selectedEquipment.assigned_job && <p className="text-xs">Job: {selectedEquipment.assigned_job}</p>}
                  <p className="text-xs">Current condition: {selectedEquipment.condition}</p>
                </div>
                <div>
                  <Label>Return Condition</Label>
                  <div className="grid grid-cols-4 gap-1">
                    {CONDITIONS.map(c => (
                      <button
                        key={c.value}
                        onClick={() => setCondition(c.value)}
                        className={`px-2 py-1.5 rounded text-xs font-medium border transition-colors ${
                          condition === c.value
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-border hover:bg-muted/50'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
                {needsNotes && (
                  <div>
                    <Label>Notes <span className="text-red-500">*</span></Label>
                    <Textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder={`Explain the ${condition} condition...`}
                      rows={2}
                    />
                  </div>
                )}
                <div>
                  <Label>Photo (optional)</Label>
                  <input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files?.[0])} className="w-full text-xs" />
                </div>
              </div>
            )}
          </>
        )}

        <DialogFooter className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={handleConfirmNoReturns} className="text-xs">
            Confirm no returns needed
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            {tab === 'materials' && selectedItem && (
              <Button onClick={handleSubmitMaterial} disabled={!canSubmit || submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Process Return'}
              </Button>
            )}
            {tab === 'equipment' && selectedEquipment && (
              <Button
                onClick={handleSubmitEquipment}
                disabled={submitting || (CONDITIONS.find(c => c.value === condition)?.needsNotes && !notes.trim())}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Process Return'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}