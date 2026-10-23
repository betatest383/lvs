import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Wrench, Loader2, Plus, PackagePlus, FileSignature, PenLine, AlertCircle, DollarSign, ShieldAlert, Wrench as WrenchIcon, Package, Eye, AlertTriangle, History, RefreshCw } from 'lucide-react';
import EquipmentReceiptViewer from '@/components/shared/EquipmentReceiptViewer';
import SignatureModal from '@/components/shared/SignatureModal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';

const CONDITION_LABELS = { new: 'New', good: 'Good', fair: 'Fair', poor: 'Poor', damaged: 'Damaged', missing: 'Missing', out_for_repair: 'Out for Repair' };
const CONDITION_COLORS = { new: 'bg-green-100 text-green-700', good: 'bg-blue-100 text-blue-700', fair: 'bg-yellow-100 text-yellow-700', poor: 'bg-red-100 text-red-700', damaged: 'bg-red-100 text-red-700', missing: 'bg-gray-200 text-gray-700', out_for_repair: 'bg-orange-100 text-orange-700' };
const STATUS_COLORS = { pending: 'bg-yellow-100 text-yellow-700', approved: 'bg-green-100 text-green-700', denied: 'bg-red-100 text-red-700', assigned: 'bg-blue-100 text-blue-700', completed: 'bg-green-100 text-green-700' };

function SummaryCard({ icon: Icon, label, value, color }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MyEquipmentPage() {
  const [items, setItems] = useState([]);
  const [requests, setRequests] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingRequest, setSigningRequest] = useState(null);
  const [actionDialog, setActionDialog] = useState(null);
  const [form, setForm] = useState({ request_type: 'new_tool', item_name: '', reason: '', urgency: 'normal', catalog_id: '', quantity: 1 });

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
        const [equipment, reqs, cat, recs] = await Promise.all([
          base44.entities.TechEquipment.filter({ assigned_employee_email: me.email }, '-assignment_date'),
          base44.entities.EquipmentRequest.filter({ technician_email: me.email }, '-created_date'),
          base44.entities.EquipmentMaster.filter({ is_active: true }, 'item_name', 200),
          base44.entities.EquipmentReceipt.filter({ technician_email: me.email }),
        ]);
        setItems(equipment || []);
        setRequests(reqs || []);
        setCatalog(cat || []);
        setReceipts(recs || []);
      } catch (e) {
        console.error('Equipment load error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSubmitRequest = async () => {
    if (!form.item_name) { toast.error('Item name is required'); return; }
    setSaving(true);
    try {
      const { catalog_id, ...rest } = form;
      const created = await base44.entities.EquipmentRequest.create({
        ...rest,
        quantity: rest.quantity || 1,
        technician_email: user.email,
        technician_name: user.full_name,
        requested_at: new Date().toISOString(),
      });
      setRequests(prev => [created, ...prev]);
      setForm({ request_type: 'new_tool', item_name: '', reason: '', urgency: 'normal', catalog_id: '', quantity: 1 });
      setDialogOpen(false);
      toast.success('Request submitted');
    } catch (e) {
      toast.error('Failed to submit request');
    } finally {
      setSaving(false);
    }
  };

  const handleActionSubmit = async () => {
    if (!actionDialog || !actionDialog.reason) { toast.error('Please provide details'); return; }
    setSaving(true);
    try {
      const created = await base44.entities.EquipmentRequest.create({
        technician_email: user.email,
        technician_name: user.full_name,
        request_type: actionDialog.actionType,
        item_name: actionDialog.item.item_name,
        category: actionDialog.item.category || '',
        quantity: 1,
        reason: actionDialog.reason,
        urgency: actionDialog.actionType === 'missing_report' ? 'urgent' : 'high',
        status: 'pending',
        requested_at: new Date().toISOString(),
      });
      setRequests(prev => [created, ...prev]);
      toast.success(`${actionDialog.actionType.replace(/_/g, ' ')} submitted`);
      setActionDialog(null);
    } catch (e) {
      toast.error('Failed to submit');
    } finally {
      setSaving(false);
    }
  };

  const unsignedApprovals = requests.filter(r => r.status === 'approved' && !receipts.some(rec => rec.request_id === r.id));
  const unsignedAssignments = items.filter(item => !receipts.some(rec => rec.equipment_id === item.id));
  const allUnsigned = [...unsignedApprovals, ...unsignedAssignments];

  const handleSignReceipt = async (signatureDataUrl) => {
    if (!signingRequest || !user) return;
    const statement = `I acknowledge receipt of the listed company assets. I understand I am responsible for maintaining, safeguarding, and returning company property in accordance with company policy.`;
    try {
      const uploadRes = await base44.functions.invoke('uploadSignature', { dataUrl: signatureDataUrl });
      const signatureUrl = uploadRes.data.file_url;
      const isDirectAssignment = !signingRequest.request_type;
      const rawRequestType = isDirectAssignment ? 'new_tool' : signingRequest.request_type;
      const receiptType = ['new_tool', 'replacement'].includes(rawRequestType) ? rawRequestType : 'new_tool';
      const newReceipt = await base44.entities.EquipmentReceipt.create({
        technician_email: user.email,
        technician_name: user.full_name,
        item_name: signingRequest.item_name,
        quantity: signingRequest.quantity || 1,
        receipt_type: receiptType,
        request_id: isDirectAssignment ? null : signingRequest.id,
        equipment_id: isDirectAssignment ? signingRequest.id : null,
        signature_data_url: signatureUrl,
        signed_date: new Date().toISOString(),
        statement,
      });
      setReceipts(prev => [...prev, newReceipt]);
      setSigningRequest(null);
      toast.success('Receipt signed and saved!');
    } catch (err) {
      toast.error('Failed to save receipt');
      throw err;
    }
  };

  // --- Equipment categorization ---
  const permanent = items.filter(i => i.assignment_type === 'permanent');
  const temporary = items.filter(i => i.assignment_type === 'temporary');
  const missing = items.filter(i => i.status === 'missing' || i.condition === 'missing');
  const damaged = items.filter(i => i.status === 'damaged' || i.condition === 'damaged');

  const totalValue = items.reduce((sum, i) => sum + (i.current_value || i.replacement_cost || 0) * (i.quantity || 1), 0);
  const permanentValue = permanent.reduce((sum, i) => sum + (i.current_value || i.replacement_cost || 0) * (i.quantity || 1), 0);
  const temporaryValue = temporary.reduce((sum, i) => sum + (i.current_value || i.replacement_cost || 0) * (i.quantity || 1), 0);
  const missingDamagedCount = missing.length + damaged.length;
  const dailyReqItems = items.filter(i => i.required_daily_operations);
  const dailyReqReady = dailyReqItems.filter(i => i.status !== 'missing' && i.condition !== 'missing' && i.condition !== 'damaged' && i.status !== 'damaged').length;

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const actionTypeLabels = {
    damage_report: { label: 'Report Damage', icon: AlertTriangle, color: 'text-red-600' },
    missing_report: { label: 'Report Missing', icon: ShieldAlert, color: 'text-orange-600' },
    repair: { label: 'Request Repair', icon: WrenchIcon, color: 'text-blue-600' },
    replacement: { label: 'Request Replacement', icon: RefreshCw, color: 'text-purple-600' },
  };

  return (
    <div className="space-y-6">
      <SignatureModal
        open={!!signingRequest}
        onClose={() => setSigningRequest(null)}
        onSign={handleSignReceipt}
        title="Sign Equipment Receipt"
        statement={signingRequest ? `I acknowledge receipt of ${signingRequest.quantity || 1} × "${signingRequest.item_name}"${signingRequest.replacement_cost ? ` at $${(signingRequest.replacement_cost || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} per unit` : ''}${signingRequest.replacement_cost ? ` (Total: $${((signingRequest.replacement_cost || 0) * (signingRequest.quantity || 1)).toLocaleString('en-US', { maximumFractionDigits: 0 })})` : ''}. I understand I am responsible for maintaining, safeguarding, and returning company property in accordance with company policy.` : ''}
      />

      <div>
        <h1 className="text-2xl font-bold">My Equipment</h1>
        <p className="text-sm text-muted-foreground">Company assets assigned to you</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <SummaryCard icon={DollarSign} label="Total Value Assigned" value={`$${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} color="bg-green-100 text-green-600" />
        <SummaryCard icon={Wrench} label="Permanent Value" value={`$${permanentValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} color="bg-purple-100 text-purple-600" />
        <SummaryCard icon={Package} label="Temporary Value" value={`$${temporaryValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} color="bg-cyan-100 text-cyan-600" />
        <SummaryCard icon={AlertTriangle} label="Missing/Damaged" value={missingDamagedCount} color="bg-red-100 text-red-600" />
        <SummaryCard icon={ShieldAlert} label="Daily Req. Ready" value={`${dailyReqReady}/${dailyReqItems.length}`} color={dailyReqReady === dailyReqItems.length && dailyReqItems.length > 0 ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'} />
      </div>

      {/* Unsigned receipt banners */}
      {allUnsigned.length > 0 && (
        <div className="space-y-2">
          {allUnsigned.map(item => (
            <div key={item.id} className="flex items-center justify-between gap-3 p-4 bg-amber-50 border border-amber-300 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">Signature required: {item.item_name}</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {item.assigned_date && !item.request_type ? 'Equipment was assigned to you. Please sign to acknowledge receipt.' : 'Your request was approved. Please sign to acknowledge receipt.'}
                  </p>
                </div>
              </div>
              <Button size="sm" onClick={() => setSigningRequest(item)} className="bg-amber-600 hover:bg-amber-700 text-white shrink-0">
                <PenLine className="w-3.5 h-3.5 mr-1" /> Sign Now
              </Button>
            </div>
          ))}
        </div>
      )}

      <Tabs defaultValue="permanent" className="space-y-4">
        <TabsList>
          <TabsTrigger value="permanent">Permanent ({permanent.length})</TabsTrigger>
          <TabsTrigger value="temporary">Temporary ({temporary.length})</TabsTrigger>
          {missing.length > 0 && <TabsTrigger value="missing" className="text-orange-600">Missing ({missing.length})</TabsTrigger>}
          {damaged.length > 0 && <TabsTrigger value="damaged" className="text-red-600">Damaged ({damaged.length})</TabsTrigger>}
          <TabsTrigger value="receipts" className="flex items-center gap-1">
            <FileSignature className="w-3.5 h-3.5" /> Receipts
            {allUnsigned.length > 0 && <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-amber-500 text-white">{allUnsigned.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="requests">
            Requests {requests.filter(r => r.status === 'pending').length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-700">
                {requests.filter(r => r.status === 'pending').length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Permanent Equipment */}
        <TabsContent value="permanent">
          {permanent.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border border-dashed rounded-xl">
              <Wrench className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No permanent equipment assigned to you.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {permanent.map(item => (
                <EquipmentRow key={item.id} item={item} onAction={(actionType) => setActionDialog({ item, actionType, reason: '' })} onSign={() => setSigningRequest(item)} hasReceipt={receipts.some(r => r.equipment_id === item.id)} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Temporary Equipment */}
        <TabsContent value="temporary">
          {temporary.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border border-dashed rounded-xl">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No temporary equipment checked out.</p>
            </div>
          ) : (
            <div className="border rounded-xl overflow-hidden">
              <div className="grid grid-cols-5 gap-2 px-4 py-2 bg-muted text-xs font-medium text-muted-foreground">
                <span>Equipment</span>
                <span>Assigned Job</span>
                <span>Assigned Date</span>
                <span>Return Required</span>
                <span>Status</span>
              </div>
              {temporary.map(item => (
                <div key={item.id} className="grid grid-cols-5 gap-2 px-4 py-3 border-t bg-card text-sm">
                  <span className="font-medium truncate">{item.item_name}</span>
                  <span className="text-muted-foreground truncate">{item.assigned_job || '—'}</span>
                  <span className="text-muted-foreground">{item.assignment_date ? new Date(item.assignment_date).toLocaleDateString() : '—'}</span>
                  <span>{item.return_required ? <span className="text-red-600 font-medium">Yes</span> : 'No'}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium inline-block w-fit ${CONDITION_COLORS[item.condition] || 'bg-gray-100 text-gray-600'}`}>
                    {CONDITION_LABELS[item.condition] || item.condition || 'Active'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Missing Equipment */}
        {missing.length > 0 && (
          <TabsContent value="missing">
            <div className="space-y-2">
              {missing.map(item => (
                <EquipmentRow key={item.id} item={item} onAction={(actionType) => setActionDialog({ item, actionType, reason: '' })} onSign={() => setSigningRequest(item)} hasReceipt={receipts.some(r => r.equipment_id === item.id)} />
              ))}
            </div>
          </TabsContent>
        )}

        {/* Damaged Equipment */}
        {damaged.length > 0 && (
          <TabsContent value="damaged">
            <div className="space-y-2">
              {damaged.map(item => (
                <EquipmentRow key={item.id} item={item} onAction={(actionType) => setActionDialog({ item, actionType, reason: '' })} onSign={() => setSigningRequest(item)} hasReceipt={receipts.some(r => r.equipment_id === item.id)} />
              ))}
            </div>
          </TabsContent>
        )}

        {/* Receipts */}
        <TabsContent value="receipts" className="space-y-4">
          {allUnsigned.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-amber-700">Awaiting your signature:</p>
              {allUnsigned.map(item => (
                <div key={item.id} className="flex items-center justify-between gap-3 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-amber-900">{item.item_name}</p>
                    <p className="text-xs text-amber-700">Qty: {item.quantity || 1}</p>
                  </div>
                  <Button size="sm" onClick={() => setSigningRequest(item)} className="bg-amber-600 hover:bg-amber-700 text-white shrink-0">
                    <PenLine className="w-3.5 h-3.5 mr-1" /> Sign
                  </Button>
                </div>
              ))}
            </div>
          )}
          <p className="text-sm text-muted-foreground">Signed receipts for equipment you've received.</p>
          {user && <EquipmentReceiptViewer technicianEmail={user.email} />}
        </TabsContent>

        {/* Requests */}
        <TabsContent value="requests" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setDialogOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Plus className="w-4 h-4 mr-1" /> New Request
            </Button>
          </div>
          {requests.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border border-dashed rounded-xl">
              <PackagePlus className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No requests yet.</p>
            </div>
          ) : (
            <div className="divide-y border rounded-xl overflow-hidden">
              {requests.map(req => (
                <div key={req.id} className="px-4 py-3 bg-card space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{req.item_name}</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[req.status] || ''}`}>
                      {req.status?.charAt(0).toUpperCase() + req.status?.slice(1)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="capitalize">{req.request_type?.replace(/_/g, ' ')}</span>
                    <span>Urgency: {req.urgency}</span>
                    {req.created_date && <span>{new Date(req.created_date).toLocaleDateString()}</span>}
                  </div>
                  {req.reason && <p className="text-xs text-muted-foreground">{req.reason}</p>}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Action Dialog (Report Damage/Missing, Request Repair/Replacement) */}
      <Dialog open={!!actionDialog} onOpenChange={(v) => !v && setActionDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{actionDialog ? actionTypeLabels[actionDialog.actionType]?.label : ''}</DialogTitle>
          </DialogHeader>
          {actionDialog && (
            <div className="space-y-3 py-2">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">{actionDialog.item.item_name}</p>
                {actionDialog.item.equipment_id && <p className="text-xs text-muted-foreground">ID: {actionDialog.item.equipment_id}</p>}
                {actionDialog.item.serial_number && <p className="text-xs text-muted-foreground">S/N: {actionDialog.item.serial_number}</p>}
              </div>
              <div>
                <Label>Details / Reason *</Label>
                <Textarea className="mt-1" rows={3} value={actionDialog.reason} onChange={e => setActionDialog(prev => ({ ...prev, reason: e.target.value }))} placeholder="Provide details about the issue..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button onClick={handleActionSubmit} disabled={saving || !actionDialog?.reason} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Request Equipment</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {catalog.length > 0 && (
              <div>
                <Label>Select from Catalog</Label>
                <Select value={form.catalog_id} onValueChange={v => { const cat = catalog.find(c => c.id === v); setForm(p => ({ ...p, catalog_id: v, item_name: cat ? cat.item_name : p.item_name })); }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Browse catalog (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>— Type manually —</SelectItem>
                    {catalog.map(c => <SelectItem key={c.id} value={c.id}>{c.item_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Request Type *</Label>
              <Select value={form.request_type} onValueChange={v => setForm(p => ({ ...p, request_type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_tool">New Tool</SelectItem>
                  <SelectItem value="replacement">Replacement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Item Name *</Label>
              <Input className="mt-1" value={form.item_name} onChange={e => setForm(p => ({ ...p, item_name: e.target.value }))} placeholder="e.g. RIDGID SeeSnake Camera" />
            </div>
            <div>
              <Label>Quantity</Label>
              <Input className="mt-1" type="number" min="1" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: parseInt(e.target.value) || 1 }))} />
            </div>
            <div>
              <Label>Urgency</Label>
              <Select value={form.urgency} onValueChange={v => setForm(p => ({ ...p, urgency: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reason / Notes</Label>
              <Textarea className="mt-1" rows={3} value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitRequest} disabled={saving || !form.item_name} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EquipmentRow({ item, onAction, onSign, hasReceipt }) {
  const [expanded, setExpanded] = useState(false);
  const value = (item.current_value || item.replacement_cost || 0) * (item.quantity || 1);

  return (
    <div className="border rounded-xl overflow-hidden bg-card">
      <div className="flex items-center gap-3 px-4 py-3">
        {item.photo_url ? (
          <img src={item.photo_url} alt={item.item_name} className="w-12 h-12 rounded-lg object-cover" />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
            <Wrench className="w-5 h-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm truncate">{item.item_name}</p>
            {item.quantity > 1 && <span className="text-xs text-muted-foreground">x{item.quantity}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-0.5">
            {item.equipment_id && <span className="text-xs text-muted-foreground">ID: {item.equipment_id}</span>}
            {item.assigned_truck_number && <span className="text-xs text-muted-foreground">Truck: {item.assigned_truck_number}</span>}
            {item.required_daily_operations && <span className="text-xs text-amber-600 font-medium">★ Daily Ops</span>}
            {item.required_todays_job && <span className="text-xs text-orange-600 font-medium">★ Today's Job</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {item.condition && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CONDITION_COLORS[item.condition] || ''}`}>
              {CONDITION_LABELS[item.condition] || item.condition}
            </span>
          )}
          {value > 0 && <span className="text-sm font-semibold">${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>}
          <Button size="icon" variant="ghost" onClick={() => setExpanded(!expanded)}>
            <Eye className="w-4 h-4" />
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="border-t px-4 py-3 space-y-3 bg-muted/30">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div><p className="text-muted-foreground">Replacement Cost/Unit</p><p className="font-medium">${(item.replacement_cost || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p></div>
            <div><p className="text-muted-foreground">Total Value ({item.quantity || 1} × ${(item.replacement_cost || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })})</p><p className="font-medium">${((item.current_value || (item.replacement_cost || 0) * (item.quantity || 1))).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p></div>
            <div><p className="text-muted-foreground">Storage Truck</p><p className="font-medium">{item.assigned_truck_number || '—'}</p></div>
            <div><p className="text-muted-foreground">Status</p><p className="font-medium capitalize">{(item.status || 'active').replace(/_/g, ' ')}</p></div>
            {item.serial_number && <div><p className="text-muted-foreground">Serial Number</p><p className="font-medium">{item.serial_number}</p></div>}
            {item.bin && <div><p className="text-muted-foreground">Bin</p><p className="font-medium">{item.bin}</p></div>}
            <div><p className="text-muted-foreground">Required Daily Ops</p><p className={`font-medium ${item.required_daily_operations ? 'text-amber-600' : ''}`}>{item.required_daily_operations ? 'Yes' : 'No'}</p></div>
            <div><p className="text-muted-foreground">Required Today's Job</p><p className={`font-medium ${item.required_todays_job ? 'text-orange-600' : ''}`}>{item.required_todays_job ? 'Yes' : 'No'}</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onAction('damage_report')}><AlertTriangle className="w-3.5 h-3.5 mr-1 text-red-600" /> Report Damage</Button>
            <Button size="sm" variant="outline" onClick={() => onAction('missing_report')}><ShieldAlert className="w-3.5 h-3.5 mr-1 text-orange-600" /> Report Missing</Button>
            <Button size="sm" variant="outline" onClick={() => onAction('repair')}><WrenchIcon className="w-3.5 h-3.5 mr-1 text-blue-600" /> Request Repair</Button>
            <Button size="sm" variant="outline" onClick={() => onAction('replacement')}><RefreshCw className="w-3.5 h-3.5 mr-1 text-purple-600" /> Request Replacement</Button>
            {!hasReceipt && <Button size="sm" variant="outline" onClick={onSign}><PenLine className="w-3.5 h-3.5 mr-1 text-amber-600" /> Sign Receipt</Button>}
            <Button size="sm" variant="ghost"><History className="w-3.5 h-3.5 mr-1" /> Assignment History</Button>
          </div>
        </div>
      )}
    </div>
  );
}