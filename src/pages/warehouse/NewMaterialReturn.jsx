import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Send, ChevronLeft, Truck, ArrowLeftRight, Package, Wrench, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import ReturnItemEditor from '@/components/warehouse/ReturnItemEditor';
import EquipmentReturnEditor from '@/components/warehouse/EquipmentReturnEditor';
import RentalReturnEditor from '@/components/warehouse/RentalReturnEditor';
import SignaturePad from '@/components/warehouse/SignaturePad';

export default function NewMaterialReturn() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [truckNumber, setTruckNumber] = useState('');
  const [transferSheets, setTransferSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState(null);
  const [items, setItems] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [signature, setSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const topRef = useRef(null);

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);
      try {
        const techs = await base44.entities.WarehouseTechnician.filter({ name: me.full_name });
        if (techs.length > 0 && techs[0].truck_number) {
          setTruckNumber(techs[0].truck_number);
          loadTransferSheets(techs[0].truck_number);
        }
      } catch {}
    } catch {
      toast.error('Failed to load user info');
    } finally {
      setLoading(false);
    }
  };

  const loadTransferSheets = async (truck) => {
    if (!truck) { setTransferSheets([]); return; }
    setLoadingSheets(true);
    setSelectedSheet(null);
    setItems([]);
    try {
      const sheets = await base44.entities.ServiceTitanTransferSheet.filter({ truck: truck });
      const open = sheets.filter(s => !s.technician_received || s.waiting_for_truck_receipt || s.status === 'Waiting for Truck Receipt');
      setTransferSheets(open.length > 0 ? open : sheets);
    } catch (e) {
      toast.error('Failed to load transfer sheets');
    } finally {
      setLoadingSheets(false);
    }
  };

  const handleSelectSheet = (sheet) => {
    setSelectedSheet(sheet);
    let parsedItems = [];
    try {
      parsedItems = sheet.items ? (typeof sheet.items === 'string' ? JSON.parse(sheet.items) : sheet.items) : [];
    } catch {}
    setItems(parsedItems.map(item => ({
      item_name: item.name || item.item_name || 'Unknown',
      sku: item.sku || '',
      quantity_transferred: Number(item.quantity) || 0,
      returned_quantity: 0,
      damaged_quantity: 0,
      disposed_quantity: 0,
      comments: '',
      photo_url: '',
      unit_cost: Number(item.cost || item.price) || 0,
    })));
  };

  const handleItemChange = (idx, updated) => {
    setItems(prev => prev.map((it, i) => i === idx ? updated : it));
  };

  const hasMaterials = items.some(i => (i.returned_quantity || 0) > 0 || (i.damaged_quantity || 0) > 0 || (i.disposed_quantity || 0) > 0);
  const hasEquipment = equipment.some(e => e.item_name);
  const hasRentals = rentals.some(r => r.item_name);
  const hasAnyReturn = hasMaterials || hasEquipment || hasRentals;

  const totalReturned = items.reduce((s, i) => s + (i.returned_quantity || 0), 0);
  const totalDamaged = items.reduce((s, i) => s + (i.damaged_quantity || 0), 0);
  const totalDisposed = items.reduce((s, i) => s + (i.disposed_quantity || 0), 0);
  const inventoryValue = items.reduce((s, i) => s + (i.returned_quantity || 0) * (i.unit_cost || 0), 0);

  const totalEquipReturned = equipment.reduce((s, e) => s + (e.quantity || 1), 0);
  const totalEquipDamaged = equipment.filter(e => e.status === 'Damaged' || e.status === 'Needs Repair').reduce((s, e) => s + (e.quantity || 1), 0);
  const totalEquipMissing = equipment.filter(e => e.status === 'Missing').reduce((s, e) => s + (e.quantity || 1), 0);
  const totalRentalReturned = rentals.length;

  const generateReturnId = async () => {
    try {
      const recs = await base44.entities.MaterialReturn.list('-created_date', 1);
      let next = 1;
      if (recs.length > 0 && recs[0].return_id) {
        const m = recs[0].return_id.match(/MR-(\d+)/);
        if (m) next = parseInt(m[1]) + 1;
      }
      return `MR-${String(next).padStart(6, '0')}`;
    } catch {
      return `MR-${Date.now().toString().slice(-6)}`;
    }
  };

  const handleSubmit = async () => {
    if (!truckNumber) { toast.error('Truck number is required'); return; }
    if (!selectedSheet) { toast.error('Select a transfer sheet'); return; }
    if (!hasAnyReturn) { toast.error('Indicate at least one returned material, equipment, or rental item'); return; }
    if (!signature) { toast.error('Technician signature is required'); return; }

    setSubmitting(true);
    try {
      const returnId = await generateReturnId();
      const now = new Date().toISOString();
      await base44.entities.MaterialReturn.create({
        return_id: returnId,
        workflow_id: 'WH-201',
        related_sop_id: 'WH-201',
        related_business_process: 'BP-102',
        status: 'Warehouse Reviewing',
        truck_id: selectedSheet.truck || '',
        truck_number: truckNumber,
        technician: user?.full_name || '',
        technician_email: user?.email || '',
        job_number: selectedSheet.job_number || '',
        customer_name: selectedSheet.customer_name || '',
        transfer_sheet_id: selectedSheet.id,
        transfer_sheet_number: selectedSheet.transfer_sheet_number || '',
        st_transfer_sheet_id: selectedSheet.st_transfer_sheet_id || '',
        returned_items: JSON.stringify(items),
        returned_equipment: equipment.length > 0 ? JSON.stringify(equipment) : '',
        rental_returns: rentals.length > 0 ? JSON.stringify(rentals) : '',
        technician_signature: signature,
        submitted_at: now,
        returned_at: now,
        total_items_returned: totalReturned,
        total_damaged: totalDamaged,
        total_disposed: totalDisposed,
        inventory_value_returned: inventoryValue,
        total_equipment_returned: totalEquipReturned,
        total_equipment_damaged: totalEquipDamaged,
        total_equipment_missing: totalEquipMissing,
        total_rental_returned: totalRentalReturned,
      });
      toast.success('Truck return submitted successfully');
      navigate('/warehouse/material-returns');
    } catch (err) {
      toast.error('Failed to submit return');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const today = moment().format('MMM D, YYYY');

  return (
    <div ref={topRef} className="max-w-2xl mx-auto pb-32">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Truck Returns Process</h1>
          <p className="text-xs text-muted-foreground">WH-201 · Truck Returns Process</p>
        </div>
      </div>

      {/* Step 1: Truck */}
      <Card className="mb-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</div>
            <span className="font-semibold text-sm flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> Select Truck</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Technician</Label>
              <p className="font-semibold text-sm">{user?.full_name || '—'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Date</Label>
              <p className="font-semibold text-sm">{today}</p>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Truck Number</Label>
            <Input
              value={truckNumber}
              onChange={e => { setTruckNumber(e.target.value); }}
              onBlur={e => loadTransferSheets(e.target.value)}
              placeholder="Enter truck number"
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Select Transfer Sheet */}
      {truckNumber && (
        <Card className="mb-4">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</div>
              <span className="font-semibold text-sm flex items-center gap-1"><ArrowLeftRight className="h-3.5 w-3.5" /> Select Transfer Sheet</span>
            </div>
            {loadingSheets ? (
              <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : transferSheets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No open transfer sheets found for truck {truckNumber}</p>
            ) : (
              <div className="space-y-2">
                {transferSheets.map(sheet => (
                  <button
                    key={sheet.id}
                    onClick={() => handleSelectSheet(sheet)}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${selectedSheet?.id === sheet.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate flex items-center gap-1">
                          <ArrowLeftRight className="h-3.5 w-3.5" /> {sheet.transfer_sheet_number || sheet.st_transfer_sheet_id}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{sheet.customer_name} · {sheet.job_number}</p>
                      </div>
                      <div className="text-xs text-muted-foreground flex-shrink-0">
                        {sheet.materials_count || 0} items
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Return Materials */}
      {selectedSheet && (
        <Card className="mb-4">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</div>
              <span className="font-semibold text-sm flex items-center gap-1"><Package className="h-3.5 w-3.5" /> Return Inventoried Materials</span>
            </div>
            <p className="text-xs text-muted-foreground">Indicate returned, damaged, or disposed quantities for each material.</p>
            <div className="space-y-3">
              {items.map((item, idx) => (
                <ReturnItemEditor key={idx} item={item} onChange={updated => handleItemChange(idx, updated)} />
              ))}
            </div>
            {hasMaterials && (
              <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t">
                <div>
                  <p className="text-xs text-green-600">Returned</p>
                  <p className="font-bold">{totalReturned}</p>
                </div>
                <div>
                  <p className="text-xs text-orange-600">Damaged</p>
                  <p className="font-bold">{totalDamaged}</p>
                </div>
                <div>
                  <p className="text-xs text-red-600">Disposed</p>
                  <p className="font-bold">{totalDisposed}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Return Equipment */}
      {selectedSheet && (
        <Card className="mb-4">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">4</div>
              <span className="font-semibold text-sm flex items-center gap-1"><Wrench className="h-3.5 w-3.5" /> Return Company Equipment</span>
            </div>
            <p className="text-xs text-muted-foreground">Select equipment being returned from the truck.</p>
            <EquipmentReturnEditor items={equipment} onChange={setEquipment} />
          </CardContent>
        </Card>
      )}

      {/* Step 5: Rental Equipment */}
      {selectedSheet && (
        <Card className="mb-4">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">5</div>
              <span className="font-semibold text-sm flex items-center gap-1"><KeyRound className="h-3.5 w-3.5" /> Rental Equipment</span>
            </div>
            <p className="text-xs text-muted-foreground">If rental equipment is on the truck, document its return.</p>
            <RentalReturnEditor items={rentals} onChange={setRentals} />
          </CardContent>
        </Card>
      )}

      {/* Signature */}
      {selectedSheet && hasAnyReturn && (
        <Card className="mb-4">
          <CardContent className="p-4 space-y-2">
            <Label className="text-sm font-semibold">Technician Signature</Label>
            <p className="text-xs text-muted-foreground">Confirm the items listed above</p>
            <SignaturePad value={signature} onChange={setSignature} />
          </CardContent>
        </Card>
      )}

      {/* Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-3 pb-safe z-50 max-w-2xl mx-auto">
        <Button className="w-full" onClick={handleSubmit} disabled={submitting || !hasAnyReturn || !signature}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Submit Truck Return
        </Button>
        {hasAnyReturn && (
          <p className="text-center text-xs text-muted-foreground mt-2">
            {hasMaterials && `${totalReturned} materials · `}
            {hasEquipment && `${totalEquipReturned} equipment · `}
            {hasRentals && `${totalRentalReturned} rentals · `}
            ${inventoryValue.toFixed(2)} inventory value
          </p>
        )}
      </div>
    </div>
  );
}