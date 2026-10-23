import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, ChevronLeft, Check, Package, Truck, Clock, User, CheckCircle2, Pen } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import ConsumableStatusBadge from '@/components/consumables/ConsumableStatusBadge';
import SignaturePad from '@/components/warehouse/SignaturePad';

const WAREHOUSE_ROLES = ['warehouse_associate', 'inventory_specialist', 'operations_manager', 'director_of_operations', 'admin', 'owner'];

export default function ConsumableRequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [techSig, setTechSig] = useState('');
  const [whSig, setWhSig] = useState('');
  const [pullNotes, setPullNotes] = useState('');

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    setLoading(true);
    try {
      const [me, rec] = await Promise.all([
        base44.auth.me(),
        base44.entities.ConsumableReplenishment.get(id),
      ]);
      setUser(me);
      setRecord(rec);
      setTechSig(rec.technician_signature || '');
      setWhSig(rec.warehouse_signature || '');
      setPullNotes(rec.additional_notes || '');
    } catch {
      toast.error('Failed to load request');
      navigate('/consumables');
    } finally {
      setLoading(false);
    }
  };

  const items = record ? (() => { try { return JSON.parse(record.items || '[]'); } catch { return []; } })() : [];
  const pulledSet = record ? (() => { try { return new Set(JSON.parse(record.pull_progress || '[]')); } catch { return new Set(); } })() : new Set();
  const isWarehouse = user && WAREHOUSE_ROLES.includes(user.role);
  const isTech = user && (record?.technician_email === user.email || user.role === 'technician' || user.role === 'lead_technician' || user.role === 'apprentice');

  const togglePull = async (itemName) => {
    if (!isWarehouse || record.status === 'Ready for Pickup' || record.status === 'Completed') return;
    const newSet = new Set(pulledSet);
    const wasPulled = newSet.has(itemName);
    if (wasPulled) newSet.delete(itemName);
    else newSet.add(itemName);
    const updates = { pull_progress: JSON.stringify([...newSet]) };
    if (newSet.size > 0 && record.status === 'Submitted') {
      updates.status = 'Pulling';
      updates.pulled_time = new Date().toISOString();
      if (isWarehouse) {
        updates.warehouse_associate = user.full_name;
        updates.warehouse_associate_email = user.email;
      }
    }

    // --- Inventory adjustment ---
    const item = items.find(i => i.item_name === itemName);
    if (item && item.consumable_catalog_id) {
      const qty = item.quantity || 0;
      if (qty > 0) {
        try {
          await base44.functions.invoke('processConsumableTransaction', {
            consumable_catalog_id: item.consumable_catalog_id,
            quantity_delta: wasPulled ? qty : -qty,
            transaction_type: wasPulled ? 'consumable_return' : 'consumable_fulfill',
            reason: wasPulled ? `Un-pulled from ${record.request_id}` : `Pulled for ${record.request_id}`,
            related_request_id: record.request_id,
            related_truck: record.truck_number,
            notes: `Item: ${itemName}, Qty: ${qty} ${item.unit}`,
          });
        } catch (err) {
          toast.error(`Inventory adjustment failed for ${itemName}`);
          return;
        }
      }
    }

    try {
      const updated = await base44.entities.ConsumableReplenishment.update(record.id, updates);
      setRecord(updated);
    } catch {
      toast.error('Failed to update pull status');
    }
  };

  const allPulled = items.length > 0 && items.every(i => pulledSet.has(i.item_name));

  const markReadyForPickup = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const updates = { status: 'Ready for Pickup', ready_for_pickup_time: now };
      const updated = await base44.entities.ConsumableReplenishment.update(record.id, updates);
      setRecord(updated);
      toast.success('Marked as ready for pickup');
    } catch {
      toast.error('Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  const saveSignature = async (which, sigData) => {
    if (!sigData) { toast.error('Please draw your signature'); return; }
    setSaving(true);
    try {
      const updates = which === 'tech'
        ? { technician_signature: sigData }
        : { warehouse_signature: sigData };
      const updated = await base44.entities.ConsumableReplenishment.update(record.id, updates);
      setRecord(updated);
      toast.success(which === 'tech' ? 'Technician signature saved' : 'Warehouse signature saved');
      if (which === 'tech' && updated.warehouse_signature) {
        await completeRequest(updated);
      } else if (which === 'wh' && updated.technician_signature) {
        await completeRequest(updated);
      }
    } catch {
      toast.error('Failed to save signature');
    } finally {
      setSaving(false);
    }
  };

  const completeRequest = async (rec) => {
    if (!rec.technician_signature || !rec.warehouse_signature) return;
    try {
      const now = new Date().toISOString();
      const submitted = rec.submitted_time ? new Date(rec.submitted_time) : new Date();
      const mins = Math.round((new Date(now) - submitted) / 60000);
      const updated = await base44.entities.ConsumableReplenishment.update(rec.id, {
        status: 'Completed',
        completed_time: now,
        fulfillment_time_minutes: mins,
      });
      setRecord(updated);
      toast.success('Request completed');
    } catch {
      toast.error('Failed to complete request');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!record) return null;

  const grouped = {};
  items.forEach(i => {
    if (!grouped[i.category]) grouped[i.category] = [];
    grouped[i.category].push(i);
  });

  return (
    <div className="max-w-2xl mx-auto pb-8">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">{record.request_id}</h1>
            <ConsumableStatusBadge status={record.status} />
          </div>
          <p className="text-xs text-muted-foreground">WH-102 · WF-WH-102</p>
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground flex items-center gap-1"><User className="w-3 h-3" />Technician</p>
              <p className="font-semibold">{record.technician}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Truck className="w-3 h-3" />Truck</p>
              <p className="font-semibold">{record.truck_number}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />Submitted</p>
              <p className="font-semibold">{record.submitted_time ? moment(record.submitted_time).format('MMM D, h:mm A') : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="font-semibold">{record.total_quantity || 0} units · {items.length} types</p>
            </div>
          </div>
          {record.warehouse_associate && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground">Warehouse Associate</p>
              <p className="font-semibold text-sm">{record.warehouse_associate}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {record.photo_url && (
        <Card className="mb-4">
          <CardContent className="p-3">
            <img src={record.photo_url} alt="Request photo" className="w-full h-40 object-cover rounded-lg" />
          </CardContent>
        </Card>
      )}

      <div className="space-y-2 mb-4">
        {Object.entries(grouped).map(([cat, catItems]) => (
          <Card key={cat}>
            <CardContent className="p-0">
              <div className="px-3.5 py-2 border-b bg-muted/30">
                <p className="font-semibold text-sm">{cat}</p>
              </div>
              <div className="divide-y divide-border">
                {catItems.map(item => {
                  const pulled = pulledSet.has(item.item_name);
                  const canCheck = isWarehouse && record.status !== 'Ready for Pickup' && record.status !== 'Completed';
                  return (
                    <div key={item.item_name} className="flex items-center gap-3 p-3">
                      <button
                        type="button"
                        disabled={!canCheck}
                        onClick={() => togglePull(item.item_name)}
                        className={`w-7 h-7 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                          pulled ? 'bg-green-500 border-green-500 text-white' : 'border-border'
                        } ${canCheck ? 'active:scale-95' : 'opacity-60'}`}
                      >
                        {pulled && <Check className="w-4 h-4" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{item.item_name}</p>
                        <p className="text-xs text-muted-foreground">{item.unit}</p>
                      </div>
                      <span className="text-lg font-bold tabular-nums">{item.quantity}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {record.additional_notes && (
        <Card className="mb-4">
          <CardContent className="p-3.5">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <p className="text-sm mt-1">{record.additional_notes}</p>
          </CardContent>
        </Card>
      )}

      {isWarehouse && record.status === 'Pulling' && allPulled && (
        <Button className="w-full mb-4" size="lg" onClick={markReadyForPickup} disabled={saving}>
          <CheckCircle2 className="w-5 h-5" /> Ready for Pickup
        </Button>
      )}

      {isWarehouse && record.status === 'Pulling' && !allPulled && items.length > 0 && (
        <p className="text-center text-xs text-muted-foreground mb-4">
          Check all items to enable "Ready for Pickup"
        </p>
      )}

      {(record.status === 'Ready for Pickup' || record.status === 'Completed') && (
        <div className="space-y-4">
          {record.status !== 'Completed' && (
            <p className="text-center text-sm font-semibold text-purple-700">
              Ready for Technician Verification
            </p>
          )}
          {isTech && record.status !== 'Completed' && (
            <Card>
              <CardContent className="p-4">
                <Label className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                  <Pen className="w-3.5 h-3.5" /> Technician Signature (Confirm Receipt)
                </Label>
                {record.technician_signature ? (
                  <img src={record.technician_signature} alt="Tech signature" className="w-full h-20 object-contain border rounded-lg bg-white" />
                ) : (
                  <>
                    <SignaturePad value={techSig} onChange={setTechSig} />
                    <Button className="w-full mt-3" onClick={() => saveSignature('tech', techSig)} disabled={saving || !techSig}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Confirm Receipt
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}
          {isWarehouse && record.status !== 'Completed' && (
            <Card>
              <CardContent className="p-4">
                <Label className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                  <Pen className="w-3.5 h-3.5" /> Warehouse Associate Signature
                </Label>
                {record.warehouse_signature ? (
                  <img src={record.warehouse_signature} alt="Warehouse signature" className="w-full h-20 object-contain border rounded-lg bg-white" />
                ) : (
                  <>
                    <SignaturePad value={whSig} onChange={setWhSig} />
                    <Button className="w-full mt-3" onClick={() => saveSignature('wh', whSig)} disabled={saving || !whSig}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Save Warehouse Signature
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}
          {record.status === 'Completed' && (record.technician_signature || record.warehouse_signature) && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-semibold">Completed</span>
                </div>
                {record.technician_signature && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Technician Signature</p>
                    <img src={record.technician_signature} alt="Tech signature" className="w-full h-16 object-contain border rounded-lg bg-white" />
                  </div>
                )}
                {record.warehouse_signature && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Warehouse Signature</p>
                    <img src={record.warehouse_signature} alt="Warehouse signature" className="w-full h-16 object-contain border rounded-lg bg-white" />
                  </div>
                )}
                {record.fulfillment_time_minutes != null && (
                  <p className="text-xs text-muted-foreground">
                    Fulfillment time: {record.fulfillment_time_minutes} min
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}