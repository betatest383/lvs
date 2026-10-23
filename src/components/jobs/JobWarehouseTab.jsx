import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Plus, ArrowLeftRight, ClipboardList, Wrench, StickyNote, History, ShieldAlert, RotateCcw, Package, Truck, User, FileText, ShoppingCart } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { formatDateET, formatDateTimeET } from '@/lib/timezone';
import { getTxnTypeMeta } from '@/lib/inventoryMasterConstants';
import MaterialTransferWizard from '@/components/warehouse/MaterialTransferWizard';

const fmtDate = (d) => formatDateET(d);
const fmtDateTime = (d) => formatDateTimeET(d);

function parseLineItems(lineItemsStr) {
  if (!lineItemsStr) return [];
  try { const p = JSON.parse(lineItemsStr); return Array.isArray(p) ? p : []; } catch { return []; }
}

function EmptyMsg({ label }) {
  return <p className="text-sm text-muted-foreground py-2">{label}</p>;
}

function StatusBadge({ status }) {
  const colors = {
    'Requested': 'bg-blue-100 text-blue-700',
    'Staged': 'bg-amber-100 text-amber-700',
    'Ready for Pickup': 'bg-cyan-100 text-cyan-700',
    'Picked Up': 'bg-indigo-100 text-indigo-700',
    'Completed': 'bg-emerald-100 text-emerald-700',
    'Cancelled': 'bg-red-100 text-red-700',
    'Returned': 'bg-purple-100 text-purple-700',
    'Submitted': 'bg-blue-100 text-blue-700',
    'Pulling': 'bg-amber-100 text-amber-700',
    'Draft': 'bg-muted text-muted-foreground',
  };
  return <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${colors[status] || 'bg-muted text-muted-foreground'}`}>{status || '\u2014'}</span>;
}

function MaterialTransfersTab({ job, reloadTrigger = 0, onNewTransfer }) {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const all = await base44.entities.MaterialTransferSheet.filter({ job_id: job.id }, '-created_date', 100);
        setTransfers(all || []);
      } catch { toast.error('Failed to load transfers'); }
      finally { setLoading(false); }
    };
    load();
  }, [job.id, reloadTrigger]);

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><ArrowLeftRight className="w-4 h-4" /> Material Transfers ({transfers.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={onNewTransfer}><Plus className="w-3.5 h-3.5 mr-1" /> New Transfer</Button>
        </div>
      </CardHeader>
      <CardContent>
        {transfers.length === 0 ? <EmptyMsg label="No material transfers for this job." /> : (
          <div className="space-y-2">
            {transfers.map(t => {
              const items = parseLineItems(t.line_items);
              return (
                <div key={t.id} className="rounded-lg border p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{t.transfer_id || '\u2014'}</p>
                      <p className="text-xs text-muted-foreground">{t.technician} {t.truck_number ? `· Truck #${t.truck_number}` : ''}</p>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>
                  {items.length > 0 && (
                    <div className="space-y-0.5">
                      {items.slice(0, 3).map((li, i) => (
                        <p key={i} className="text-xs text-muted-foreground flex items-center gap-1">
                          <Package className="w-3 h-3" /> {li.item_name} — Qty: {li.quantity_requested}
                        </p>
                      ))}
                      {items.length > 3 && <p className="text-xs text-muted-foreground">+{items.length - 3} more</p>}
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{fmtDate(t.date)}</span>
                    {t.requested_date && <span>Requested: {fmtDateTime(t.requested_date)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConsumableRequestsTab({ job }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const all = await base44.entities.ConsumableReplenishment.filter({ job_id: job.id }, '-created_date', 100);
        setRequests(all || []);
      } catch { toast.error('Failed to load consumable requests'); }
      finally { setLoading(false); }
    };
    load();
  }, [job.id]);

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><ClipboardList className="w-4 h-4" /> Consumable Requests ({requests.length})</CardTitle>
          <Link to="/consumables/new">
            <Button size="sm" variant="outline"><Plus className="w-3.5 h-3.5 mr-1" /> New Request</Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? <EmptyMsg label="No consumable requests for this job." /> : (
          <div className="space-y-2">
            {requests.map(r => {
              const items = parseLineItems(r.items);
              return (
                <div key={r.id} className="rounded-lg border p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{r.request_id || '\u2014'}</p>
                      <p className="text-xs text-muted-foreground">{r.technician} {r.truck_number ? `· Truck #${r.truck_number}` : ''}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  {items.length > 0 && (
                    <div className="space-y-0.5">
                      {items.slice(0, 3).map((li, i) => (
                        <p key={i} className="text-xs text-muted-foreground flex items-center gap-1">
                          <Package className="w-3 h-3" /> {li.item_name} — Qty: {li.quantity}
                        </p>
                      ))}
                      {items.length > 3 && <p className="text-xs text-muted-foreground">+{items.length - 3} more</p>}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">{fmtDate(r.date)}</p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EquipmentTab({ job }) {
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const all = await base44.entities.TechEquipment.filter({ assigned_job: job.id }, '-created_date', 100);
        setEquipment(all || []);
      } catch { toast.error('Failed to load equipment'); }
      finally { setLoading(false); }
    };
    load();
  }, [job.id]);

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Wrench className="w-4 h-4" /> Equipment ({equipment.length})</CardTitle>
          <Link to="/equipment/assign">
            <Button size="sm" variant="outline"><Plus className="w-3.5 h-3.5 mr-1" /> Assign Equipment</Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {equipment.length === 0 ? <EmptyMsg label="No equipment assigned to this job." /> : (
          <div className="space-y-2">
            {equipment.map(e => (
              <div key={e.id} className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{e.item_name}</p>
                  <StatusBadge status={e.status} />
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {e.assigned_employee && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {e.assigned_employee}</span>}
                  {e.assigned_truck && <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> {e.assigned_truck}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InventoryReservationsTab({ job }) {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        // Find all material transfers for this job, then get their inventory transactions
        const transfers = await base44.entities.MaterialTransferSheet.filter({ job_id: job.id }, '-created_date', 100);
        const transferIds = transfers.map(t => t.id);
        const transferNumbers = transfers.map(t => t.transfer_id).filter(Boolean);

        // Get reserve transactions related to this job's transfers
        const reserveTxns = await base44.entities.InventoryTransaction.filter({ related_job: job.crm_job_number || job.id }, '-created_date', 200);
        const filtered = (reserveTxns || []).filter(t =>
          t.transaction_type === 'reserve' && t.status !== 'cancelled'
        );
        setReservations(filtered);
      } catch { toast.error('Failed to load reservations'); }
      finally { setLoading(false); }
    };
    load();
  }, [job.id]);

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  const totalReserved = reservations.reduce((s, r) => s + (r.quantity || 0), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Package className="w-4 h-4" /> Inventory Reservations ({reservations.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {reservations.length === 0 ? <EmptyMsg label="No inventory reservations for this job." /> : (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="p-1.5 font-medium whitespace-nowrap">Txn ID</th>
                    <th className="p-1.5 font-medium whitespace-nowrap">Item</th>
                    <th className="p-1.5 font-medium whitespace-nowrap">Transfer #</th>
                    <th className="p-1.5 font-medium whitespace-nowrap">Technician</th>
                    <th className="p-1.5 font-medium whitespace-nowrap">Truck</th>
                    <th className="p-1.5 font-medium text-right whitespace-nowrap">Qty Reserved</th>
                    <th className="p-1.5 font-medium whitespace-nowrap">Date</th>
                    <th className="p-1.5 font-medium whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {reservations.map(r => (
                    <tr key={r.id} className="hover:bg-muted/20">
                      <td className="p-1.5 text-xs font-mono">{r.transaction_id || '\u2014'}</td>
                      <td className="p-1.5 text-xs">
                        {r.inventory_master_id && <Link to={`/inventory/master/detail/${r.inventory_master_id}`} className="text-blue-600 hover:underline">{r.inventory_item_name || '\u2014'}</Link>}
                        {!r.inventory_master_id && (r.inventory_item_name || '\u2014')}
                      </td>
                      <td className="p-1.5 text-xs">
                        <Link to="/warehouse/transfer-sheets" className="text-blue-600 hover:underline">{r.related_request_id || r.audit_reference || '\u2014'}</Link>
                      </td>
                      <td className="p-1.5 text-xs"><Link to="/lvcos/employees" className="text-blue-600 hover:underline">{r.related_employee || r.employee || '\u2014'}</Link></td>
                      <td className="p-1.5 text-xs"><Link to="/fleet/trucks" className="text-blue-600 hover:underline">{r.related_truck || r.truck || '\u2014'}</Link></td>
                      <td className="p-1.5 text-xs text-right tabular-nums font-medium">{r.quantity}</td>
                      <td className="p-1.5 text-xs">{r.transaction_date ? fmtDateTime(r.transaction_date) : '\u2014'}</td>
                      <td className="p-1.5 text-xs">{r.status || '\u2014'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between rounded-md bg-amber-50 px-3 py-2">
              <span className="text-sm font-medium text-amber-700">Total Reserved</span>
              <span className="text-lg font-bold tabular-nums text-amber-700">{totalReserved}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WarehouseNotesTab({ job }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const all = await base44.entities.EnterpriseTask.filter({ related_job: job.crm_job_number || job.id, task_type: 'Warehouse' }, '-created_date', 100);
        setTasks(all || []);
      } catch { toast.error('Failed to load warehouse notes/tasks'); }
      finally { setLoading(false); }
    };
    load();
  }, [job.id]);

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><StickyNote className="w-4 h-4" /> Warehouse Notes ({tasks.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? <EmptyMsg label="No warehouse notes for this job." /> : (
          <div className="space-y-2">
            {tasks.map(t => (
              <div key={t.id} className="rounded-lg border p-3">
                <p className="font-medium text-sm">{t.title}</p>
                {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <StatusBadge status={t.status} />
                  <span>{fmtDate(t.due_date)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InventoryTimelineTab({ job }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const all = await base44.entities.InventoryTransaction.filter({ related_job: job.crm_job_number || job.id }, '-created_date', 200);
        setTransactions(all || []);
      } catch { toast.error('Failed to load inventory timeline'); }
      finally { setLoading(false); }
    };
    load();
  }, [job.id]);

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><History className="w-4 h-4" /> Inventory Timeline ({transactions.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? <EmptyMsg label="No inventory activity for this job." /> : (
          <div className="relative">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
            <div className="space-y-3">
              {transactions.map(t => {
                const meta = getTxnTypeMeta(t.transaction_type);
                return (
                  <div key={t.id} className="relative pl-8">
                    <div className={`absolute left-0.5 top-2 w-3 h-3 rounded-full ${meta.dot || 'bg-gray-400'} ring-4 ring-background z-10`} />
                    <div className="rounded-lg border p-2.5 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${meta.color}`}>{meta.label}</span>
                        <span className="text-xs text-muted-foreground">{t.transaction_date ? fmtDateTime(t.transaction_date) : '\u2014'}</span>
                      </div>
                      {t.inventory_item_name && (
                        <p className="text-xs">
                          {t.inventory_master_id
                            ? <Link to={`/inventory/master/detail/${t.inventory_master_id}`} className="text-blue-600 hover:underline">{t.inventory_item_name}</Link>
                            : t.inventory_item_name}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>Qty: {t.quantity}</span>
                        {t.created_by && <span>By: {t.created_by}</span>}
                        {t.related_truck && <span>Truck: {t.related_truck}</span>}
                        {t.related_employee && <span>Employee: {t.related_employee}</span>}
                      </div>
                      {t.reason && <p className="text-xs text-muted-foreground border-t pt-0.5">{t.reason}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AuditHistoryTab({ job }) {
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const all = await base44.entities.ManagementAudit.filter({ related_job: job.crm_job_number || job.id }, '-created_date', 100);
        setAudits(all || []);
      } catch { toast.error('Failed to load audit history'); }
      finally { setLoading(false); }
    };
    load();
  }, [job.id]);

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> Audit History ({audits.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {audits.length === 0 ? <EmptyMsg label="No audits for this job." /> : (
          <div className="space-y-2">
            {audits.map(a => (
              <div key={a.id} className="rounded-lg border p-3">
                <p className="font-medium text-sm">{a.audit_number || a.title || 'Audit'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{a.description || '\u2014'}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <StatusBadge status={a.status} />
                  <span>{fmtDate(a.audit_date)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function JobWarehouseTab({ job }) {
  const [subTab, setSubTab] = useState('transfers');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  return (
    <div className="space-y-3">
      {/* Quick Actions */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setWizardOpen(true)}><ArrowLeftRight className="w-3.5 h-3.5 mr-1" /> Create Material Transfer</Button>
            <Link to="/consumables/new">
              <Button variant="outline" size="sm"><ClipboardList className="w-3.5 h-3.5 mr-1" /> Create Consumable Request</Button>
            </Link>
            <Link to={`/inventory/issue?jobId=${job.id}`}>
              <Button variant="outline" size="sm"><Package className="w-3.5 h-3.5 mr-1" /> Reserve Inventory</Button>
            </Link>
            <Link to={`/inventory/issue?jobId=${job.id}`}>
              <Button variant="outline" size="sm"><Package className="w-3.5 h-3.5 mr-1" /> Issue Inventory</Button>
            </Link>
            <Link to="/inventory/return">
              <Button variant="outline" size="sm"><RotateCcw className="w-3.5 h-3.5 mr-1" /> Return Inventory</Button>
            </Link>
            <Link to="/equipment/assign">
              <Button variant="outline" size="sm"><Wrench className="w-3.5 h-3.5 mr-1" /> Issue Equipment</Button>
            </Link>
            <Link to="/inventory/replay">
              <Button variant="outline" size="sm"><RotateCcw className="w-3.5 h-3.5 mr-1" /> Replay Inventory State</Button>
            </Link>
            <Link to="/inventory/transactions">
              <Button variant="outline" size="sm"><History className="w-3.5 h-3.5 mr-1" /> View Inventory Timeline</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="transfers" className="gap-1.5 text-xs"><ArrowLeftRight className="w-3.5 h-3.5" /> Material Transfers</TabsTrigger>
          <TabsTrigger value="consumables" className="gap-1.5 text-xs"><ClipboardList className="w-3.5 h-3.5" /> Consumable Requests</TabsTrigger>
          <TabsTrigger value="equipment" className="gap-1.5 text-xs"><Wrench className="w-3.5 h-3.5" /> Equipment</TabsTrigger>
          <TabsTrigger value="reservations" className="gap-1.5 text-xs"><Package className="w-3.5 h-3.5" /> Reservations</TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5 text-xs"><StickyNote className="w-3.5 h-3.5" /> Notes</TabsTrigger>
          <TabsTrigger value="timeline" className="gap-1.5 text-xs"><History className="w-3.5 h-3.5" /> Timeline</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5 text-xs"><ShieldAlert className="w-3.5 h-3.5" /> Audit</TabsTrigger>
        </TabsList>
        <TabsContent value="transfers"><MaterialTransfersTab job={job} reloadTrigger={reloadTrigger} onNewTransfer={() => setWizardOpen(true)} /></TabsContent>
        <TabsContent value="consumables"><ConsumableRequestsTab job={job} /></TabsContent>
        <TabsContent value="equipment"><EquipmentTab job={job} /></TabsContent>
        <TabsContent value="reservations"><InventoryReservationsTab job={job} /></TabsContent>
        <TabsContent value="notes"><WarehouseNotesTab job={job} /></TabsContent>
        <TabsContent value="timeline"><InventoryTimelineTab job={job} /></TabsContent>
        <TabsContent value="audit"><AuditHistoryTab job={job} /></TabsContent>
      </Tabs>

      <MaterialTransferWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={() => { setReloadTrigger(t => t + 1); setWizardOpen(false); }}
        contextJob={job}
      />
    </div>
  );
}