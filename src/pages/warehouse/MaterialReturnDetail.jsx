import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, ChevronLeft, Package, AlertTriangle, DollarSign, CheckCircle2, Wrench, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import MaterialReturnStatusBadge from '@/components/warehouse/MaterialReturnStatusBadge';
import SignaturePad from '@/components/warehouse/SignaturePad';
import { MANAGER_REVIEW_ACTIONS, WAREHOUSE_ITEM_VERIFICATION_OPTIONS } from '@/lib/wh201Constants';

const WAREHOUSE_VERIFY_ROLES = ['admin', 'owner', 'Warehouse Associate', 'Warehouse Manager', 'Inventory Specialist'];
const MANAGER_ROLES = ['admin', 'owner', 'Operations Manager', 'Director of Operations'];

export default function MaterialReturnDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Warehouse form
  const [whVerification, setWhVerification] = useState('');
  const [whNotes, setWhNotes] = useState('');
  const [whSignature, setWhSignature] = useState('');
  const [whEquipStatuses, setWhEquipStatuses] = useState({});
  const [whRentalStatuses, setWhRentalStatuses] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Manager form
  const [mgrAction, setMgrAction] = useState('');
  const [mgrNotes, setMgrNotes] = useState('');

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);
      const data = await base44.entities.MaterialReturn.get(id);
      setRecord(data);
      setWhVerification(data.warehouse_verification || '');
      setWhNotes(data.warehouse_notes || '');
      setWhSignature(data.warehouse_signature || '');
      setMgrAction(data.manager_review_status !== 'None' ? data.manager_review_status : '');
      setMgrNotes(data.manager_notes || '');
      // Initialize per-item warehouse verification states from existing data
      const equipItems = parseJson(data.returned_equipment);
      const rentalItems = parseJson(data.rental_returns);
      const initEquip = {};
      equipItems.forEach((item, i) => { initEquip[i] = item.warehouse_status || 'Pending'; });
      setWhEquipStatuses(initEquip);
      const initRental = {};
      rentalItems.forEach((item, i) => { initRental[i] = item.warehouse_status || 'Pending'; });
      setWhRentalStatuses(initRental);
    } catch (e) {
      toast.error('Failed to load return record');
    } finally {
      setLoading(false);
    }
  };

  const parseJson = (val) => {
    if (!val) return [];
    try {
      return typeof val === 'string' ? JSON.parse(val) : val;
    } catch { return []; }
  };

  const items = parseJson(record?.returned_items);
  const equipment = parseJson(record?.returned_equipment);
  const rentals = parseJson(record?.rental_returns);
  const discrepancies = parseJson(record?.discrepancies);

  const canVerify = (record?.status === 'Returned' || record?.status === 'Warehouse Reviewing') && WAREHOUSE_VERIFY_ROLES.includes(user?.role);
  const canManage = (record?.status === 'Verified' || record?.status === 'Adjusted') && record?.manager_review_status === 'Pending' && MANAGER_ROLES.includes(user?.role);
  const canOverride = record?.status !== 'Closed' && MANAGER_ROLES.includes(user?.role) && !record?.manager_override_applied;

  const handleWarehouseSubmit = async () => {
    if (!whVerification) { toast.error('Select a verification status'); return; }
    if (!whSignature) { toast.error('Warehouse signature required'); return; }
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      // Embed warehouse status into equipment/rental items
      const updatedEquip = equipment.map((item, i) => ({ ...item, warehouse_status: whEquipStatuses[i] || 'Pending' }));
      const updatedRentals = rentals.map((item, i) => ({ ...item, warehouse_status: whRentalStatuses[i] || 'Pending' }));
      const updates = {
        warehouse_associate: user?.full_name || '',
        warehouse_associate_email: user?.email || '',
        warehouse_verification: whVerification,
        warehouse_notes: whNotes,
        warehouse_signature: whSignature,
        warehouse_verified_at: now,
        verified_at: now,
        status: whVerification === 'Rejected' ? 'Closed' : 'Verified',
        manager_review_status: (whVerification === 'Requires Manager Review' || whVerification === 'Partial Return') ? 'Pending' : 'None',
        closed_at: whVerification === 'Rejected' ? now : null,
        returned_equipment: updatedEquip.length > 0 ? JSON.stringify(updatedEquip) : '',
        rental_returns: updatedRentals.length > 0 ? JSON.stringify(updatedRentals) : '',
      };
      if (updates.status === 'Closed') updates.processing_time_minutes = Math.round((new Date(now) - new Date(record.submitted_at || record.created_date)) / 60000);
      await base44.entities.MaterialReturn.update(record.id, updates);
      toast.success('Return verified');
      load();
    } catch (e) {
      toast.error('Failed to verify return');
    } finally {
      setSubmitting(false);
    }
  };

  const handleManagerSubmit = async () => {
    if (!mgrAction) { toast.error('Select a manager action'); return; }
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const updates = {
        manager_review_status: mgrAction,
        manager_name: user?.full_name || '',
        manager_notes: mgrNotes,
        manager_reviewed_at: now,
        adjusted_at: now,
        status: 'Adjusted',
      };
      await base44.entities.MaterialReturn.update(record.id, updates);
      toast.success('Manager review submitted');
      load();
    } catch (e) {
      toast.error('Failed to submit manager review');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOverride = async () => {
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      await base44.entities.MaterialReturn.update(record.id, {
        manager_override_applied: true,
        manager_override_by: user?.full_name || '',
        manager_override_at: now,
      });
      toast.success('Manager override applied — truck can reach 100% readiness');
      load();
    } catch (e) {
      toast.error('Failed to apply override');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async () => {
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const updates = {
        status: 'Closed',
        closed_at: now,
        processing_time_minutes: Math.round((new Date(now) - new Date(record.submitted_at || record.created_date)) / 60000),
      };
      await base44.entities.MaterialReturn.update(record.id, updates);
      toast.success('Return closed');
      load();
    } catch (e) {
      toast.error('Failed to close return');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!record) {
    return <div className="p-6 text-center text-muted-foreground">Return record not found</div>;
  }

  const tabs = [
    { key: 'overview', label: 'Overview' },
    ...(canVerify ? [{ key: 'warehouse', label: 'Verify' }] : []),
    ...(canManage ? [{ key: 'manager', label: 'Manager Review' }] : []),
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{record.return_id}</h1>
            <MaterialReturnStatusBadge status={record.status} />
          </div>
          <p className="text-xs text-muted-foreground">WH-201 Truck Returns Process · {record.transfer_sheet_number || 'No transfer sheet'}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Info */}
          <Card>
            <CardHeader><CardTitle className="text-base">Return Information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow label="Technician" value={record.technician} />
              <InfoRow label="Truck" value={record.truck_number} />
              <InfoRow label="Job Number" value={record.job_number} />
              <InfoRow label="Customer" value={record.customer_name} />
              <InfoRow label="Transfer Sheet" value={record.transfer_sheet_number} />
              <InfoRow label="Submitted" value={record.submitted_at ? moment(record.submitted_at).format('MMM D, h:mm A') : '—'} />
              {record.warehouse_verified_at && <InfoRow label="Verified" value={moment(record.warehouse_verified_at).format('MMM D, h:mm A')} />}
              {record.manager_reviewed_at && <InfoRow label="Manager Reviewed" value={moment(record.manager_reviewed_at).format('MMM D, h:mm A')} />}
              {record.closed_at && <InfoRow label="Closed" value={moment(record.closed_at).format('MMM D, h:mm A')} />}
              {record.processing_time_minutes != null && <InfoRow label="Processing Time" value={`${record.processing_time_minutes} min`} />}
              {record.manager_override_applied && <InfoRow label="Manager Override" value={`Yes — ${record.manager_override_by || ''}`} />}
            </CardContent>
          </Card>

          {/* Materials */}
          {items.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" /> Returned Materials</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.item_name}</p>
                        {item.sku && <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">Transferred: {item.quantity_transferred}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-2 text-center text-xs">
                      <div className="bg-green-50 rounded p-1">
                        <p className="text-green-600">Returned</p>
                        <p className="font-bold">{item.returned_quantity || 0}</p>
                      </div>
                      <div className="bg-orange-50 rounded p-1">
                        <p className="text-orange-600">Damaged</p>
                        <p className="font-bold">{item.damaged_quantity || 0}</p>
                      </div>
                      <div className="bg-red-50 rounded p-1">
                        <p className="text-red-600">Disposed</p>
                        <p className="font-bold">{item.disposed_quantity || 0}</p>
                      </div>
                      <div className="bg-green-50 rounded p-1">
                        <p className="text-green-600">Value</p>
                        <p className="font-bold">${((item.returned_quantity || 0) * (item.unit_cost || 0)).toFixed(2)}</p>
                      </div>
                    </div>
                    {item.warehouse_status && item.warehouse_status !== 'Pending' && (
                      <p className="text-xs mt-1"><span className="text-muted-foreground">Warehouse:</span> <span className="font-medium">{item.warehouse_status}</span></p>
                    )}
                    {item.comments && <p className="text-xs text-muted-foreground mt-2 italic">"{item.comments}"</p>}
                    {item.photo_url && <img src={item.photo_url} alt="Item" className="w-full h-24 object-cover rounded-lg mt-2 border" />}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Equipment */}
          {equipment.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" /> Returned Equipment</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {equipment.map((item, i) => (
                  <div key={i} className="border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{item.item_name}</p>
                      <span className="text-xs text-muted-foreground">Qty: {item.quantity || 1}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{item.status || 'Good'}</span>
                      {item.warehouse_status && item.warehouse_status !== 'Pending' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">WH: {item.warehouse_status}</span>
                      )}
                    </div>
                    {item.comments && <p className="text-xs text-muted-foreground mt-1 italic">"{item.comments}"</p>}
                    {item.photo_url && <img src={item.photo_url} alt="Equipment" className="w-full h-24 object-cover rounded-lg mt-2 border" />}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Rentals */}
          {rentals.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" /> Rental Equipment</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {rentals.map((item, i) => (
                  <div key={i} className="border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{item.item_name}</p>
                      {item.vendor && <span className="text-xs text-muted-foreground">{item.vendor}</span>}
                    </div>
                    {item.condition && <p className="text-xs mt-1">Condition: {item.condition}</p>}
                    {item.warehouse_status && item.warehouse_status !== 'Pending' && (
                      <p className="text-xs mt-1"><span className="text-muted-foreground">Warehouse:</span> <span className="font-medium">{item.warehouse_status}</span></p>
                    )}
                    {item.comments && <p className="text-xs text-muted-foreground mt-1 italic">"{item.comments}"</p>}
                    {item.photo_url && <img src={item.photo_url} alt="Rental" className="w-full h-24 object-cover rounded-lg mt-2 border" />}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Summary */}
          <Card>
            <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={Package} label="Materials Returned" value={record.total_items_returned || 0} color="text-green-600" />
              <Stat icon={Wrench} label="Equipment Returned" value={record.total_equipment_returned || 0} color="text-blue-600" />
              <Stat icon={AlertTriangle} label="Damaged" value={(record.total_damaged || 0) + (record.total_equipment_damaged || 0)} color="text-orange-600" />
              <Stat icon={DollarSign} label="Inventory Value" value={`$${(record.inventory_value_returned || 0).toFixed(2)}`} color="text-green-600" />
              {(record.total_equipment_missing > 0 || record.total_rental_returned > 0) && (
                <>
                  <Stat icon={AlertTriangle} label="Missing Equipment" value={record.total_equipment_missing || 0} color="text-red-600" />
                  <Stat icon={KeyRound} label="Rentals Returned" value={record.total_rental_returned || 0} color="text-purple-600" />
                </>
              )}
            </CardContent>
          </Card>

          {/* Warehouse Verification */}
          {record.warehouse_verification && (
            <Card>
              <CardHeader><CardTitle className="text-base">Warehouse Verification</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <InfoRow label="Verified By" value={record.warehouse_associate} />
                <InfoRow label="Result" value={record.warehouse_verification} />
                {record.warehouse_notes && <InfoRow label="Notes" value={record.warehouse_notes} />}
                {record.warehouse_signature && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Signature</Label>
                    <img src={record.warehouse_signature} alt="Signature" className="h-20 object-contain border rounded-lg bg-white mt-1" />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Manager Review */}
          {record.manager_review_status && record.manager_review_status !== 'None' && (
            <Card>
              <CardHeader><CardTitle className="text-base">Manager Review</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <InfoRow label="Status" value={record.manager_review_status} />
                <InfoRow label="Manager" value={record.manager_name} />
                {record.manager_notes && <InfoRow label="Notes" value={record.manager_notes} />}
              </CardContent>
            </Card>
          )}

          {/* Manager Override */}
          {canOverride && (
            <Button onClick={handleOverride} variant="outline" disabled={submitting} className="w-full">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Apply Manager Override (Allow 100% Readiness)
            </Button>
          )}

          {/* Close button */}
          {record.status !== 'Closed' && MANAGER_ROLES.includes(user?.role) && !canVerify && !canManage && (
            <Button onClick={handleClose} disabled={submitting} className="w-full">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Close Return
            </Button>
          )}
        </div>
      )}

      {activeTab === 'warehouse' && canVerify && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Verify Materials</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="border border-border rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{item.item_name}</p>
                    <span className="text-xs text-muted-foreground">Returned: {item.returned_quantity || 0}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Damaged: {item.damaged_quantity || 0} · Disposed: {item.disposed_quantity || 0}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {equipment.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Verify Equipment</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {equipment.map((item, i) => (
                  <div key={i} className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{item.item_name} (Qty: {item.quantity || 1})</p>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{item.status || 'Good'}</span>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Warehouse Status</Label>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {WAREHOUSE_ITEM_VERIFICATION_OPTIONS.map(opt => (
                          <button
                            key={opt}
                            onClick={() => setWhEquipStatuses(prev => ({ ...prev, [i]: opt }))}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                              (whEquipStatuses[i] || 'Pending') === opt
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:bg-muted/30'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {rentals.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Verify Rentals</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {rentals.map((item, i) => (
                  <div key={i} className="border border-border rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium">{item.item_name} {item.vendor && `· ${item.vendor}`}</p>
                    {item.condition && <p className="text-xs text-muted-foreground">Condition: {item.condition}</p>}
                    <div>
                      <Label className="text-xs text-muted-foreground">Warehouse Status</Label>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {WAREHOUSE_ITEM_VERIFICATION_OPTIONS.map(opt => (
                          <button
                            key={opt}
                            onClick={() => setWhRentalStatuses(prev => ({ ...prev, [i]: opt }))}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                              (whRentalStatuses[i] || 'Pending') === opt
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:bg-muted/30'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Overall Verification</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Verify correct items, quantities, and conditions for all returned materials, equipment, and rentals.</p>
              <div>
                <Label className="text-sm font-semibold">Verification Result</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {['Accepted', 'Partial Return', 'Rejected', 'Requires Manager Review'].map(opt => (
                    <button
                      key={opt}
                      onClick={() => setWhVerification(opt)}
                      className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${whVerification === opt ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'}`}
                    >
                     !                       {opt}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-sm font-semibold">Notes</Label>
                <Textarea value={whNotes} onChange={e => setWhNotes(e.target.value)} placeholder="Optional verification notes..." className="mt-1" rows={3} />
              </div>
              <div>
                <Label className="text-sm font-semibold">Warehouse Signature</Label>
                <div className="mt-1">
                  <SignaturePad value={whSignature} onChange={setWhSignature} />
                </div>
              </div>
              <Button onClick={handleWarehouseSubmit} disabled={submitting} className="w-full">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Submit Verification
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'manager' && canManage && (
        <Card>
          <CardHeader><CardTitle className="text-base">Manager Review</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold">Discrepancies Found:</p>
              {discrepancies.length > 0 ? (
                discrepancies.map((d, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm bg-amber-50 p-2 rounded">
                    <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">{d.type}</p>
                      <p className="text-xs text-muted-foreground">{d.description}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No discrepancies flagged. Review the return details and select an action.</p>
              )}
            </div>
            <div>
              <Label className="text-sm font-semibold">Manager Action</Label>
              <div className="grid grid-cols-1 gap-2 mt-2">
                {MANAGER_REVIEW_ACTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setMgrAction(opt.value)}
                    className={`p-3 rounded-lg border-2 text-left transition-colors ${mgrAction === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'}`}
                  >
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-sm font-semibold">Manager Notes</Label>
              <Textarea value={mgrNotes} onChange={e => setMgrNotes(e.target.value)} placeholder="Document the review decision..." className="mt-1" rows={3} />
            </div>
            <Button onClick={handleManagerSubmit} disabled={submitting} className="w-full">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Submit Manager Review
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-sm">{value || '—'}</p>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div className="text-center">
      <Icon className={`h-5 w-5 mx-auto ${color}`} />
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}