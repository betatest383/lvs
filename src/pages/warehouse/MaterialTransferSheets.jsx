import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Package } from 'lucide-react';
import { toast } from 'sonner';
import WarehouseFormDialog from '@/components/warehouse/WarehouseFormDialog';
import WarehouseFilters from '@/components/warehouse/WarehouseFilters';
import WarehouseCardList from '@/components/warehouse/WarehouseCardList';
import { StatusBadge, applyFilters } from '@/components/warehouse/statusConfig.jsx';
import { useTechnicians } from '@/hooks/useTechnicians';
import MaterialTransferWizard from '@/components/warehouse/MaterialTransferWizard';

const STATUS_OPTIONS = [
  { value: 'Requested', label: 'Requested' },
  { value: 'Staged', label: 'Staged' },
  { value: 'Ready for Pickup', label: 'Ready for Pickup' },
  { value: 'Picked Up', label: 'Picked Up' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Cancelled', label: 'Cancelled' },
  { value: 'Returned', label: 'Returned' },
  // Legacy statuses
  { value: 'Draft', label: 'Draft' },
  { value: 'Submitted', label: 'Submitted' },
  { value: 'Issued', label: 'Issued' },
  { value: 'Closed', label: 'Closed' },
];

const filterConfig = [
  { key: 'technician', label: 'Technician', type: 'text' },
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'truck_number', label: 'Truck #', type: 'text' },
  { key: 'job_number', label: 'Job #', type: 'text' },
  { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
];

const fields = [
  { key: 'date', label: 'Date', type: 'date', required: true },
  { key: 'technician', label: 'Technician', type: 'technician_select', required: true, autoFillTruck: true },
  { key: 'truck_number', label: 'Truck Number', type: 'text' },
  { key: 'job_number', label: 'Job Number', type: 'text' },
  { key: 'materials_taken', label: 'Materials Taken', type: 'textarea', placeholder: 'List all materials taken from warehouse...' },
  { key: 'quantity_taken', label: 'Quantity Taken', type: 'text', placeholder: 'e.g. 2 bags, 5 tubes' },
  { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
  { key: 'issued_by', label: 'Issued By', type: 'text' },
  { key: 'technician_signature', label: 'Technician Signature', type: 'signature' },
  { key: 'related_sop_id', label: 'Related SOP ID', type: 'text', placeholder: 'e.g. SOP-WH-002', helpText: 'Link to the official Trainual SOP for this workflow.' },
  { key: 'trainual_link', label: 'Trainual Link', type: 'text', placeholder: 'https://trainual.com/...' },
];

// New workflow status flow
const NEXT_STATUSES = {
  'Requested': ['Staged', 'Cancelled'],
  'Staged': ['Ready for Pickup', 'Cancelled'],
  'Ready for Pickup': ['Picked Up', 'Cancelled'],
  'Picked Up': ['Completed', 'Returned'],
  'Completed': ['Returned'],
};

const LEGACY_NEXT = {
  'Draft': ['Submitted'],
  'Submitted': ['Issued'],
  'Issued': ['Closed'],
};

export default function MaterialTransferSheets() {
  const { technicians } = useTechnicians();
  const [searchParams] = useSearchParams();
  const contextJobId = searchParams.get('jobId');
  const [records, setRecords] = useState([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [contextJob, setContextJob] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const recs = await base44.entities.MaterialTransferSheet.list('-created_date', 200);
      setRecords(recs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (contextJobId) {
      base44.entities.Job.get(contextJobId)
        .then(setContextJob)
        .then(() => setWizardOpen(true))
        .catch(() => toast.error('Failed to load job context'));
    }
  }, []);

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.MaterialTransferSheet.update(editing.id, data);
      toast.success('Transfer sheet updated');
    } else {
      if (data.status === 'Submitted') {
        data.submitted_time = new Date().toISOString();
      }
      await base44.entities.MaterialTransferSheet.create(data);
      toast.success('Transfer sheet created');
    }
    setEditing(null);
    load();
  };

  const handleDelete = async (record) => {
    if (!confirm('Delete this transfer sheet?')) return;
    await base44.entities.MaterialTransferSheet.delete(record.id);
    toast.success('Transfer sheet deleted');
    load();
  };

  const handleStatusTransition = async (record, newStatus, e) => {
    e.stopPropagation();
    setTransitioning(record.id);
    try {
      const response = await base44.functions.invoke('processMaterialTransfer', {
        action: 'transition',
        transfer_id: record.id,
        new_status: newStatus,
      });
      if (response.data?.error) {
        toast.error(response.data.error);
      } else {
        toast.success(`Transfer moved to ${newStatus}`);
        load();
      }
    } catch (err) {
      toast.error('Failed to update transfer status');
    } finally {
      setTransitioning(null);
    }
  };

  const handleLegacyStatusChange = async (record, newStatus, e) => {
    e.stopPropagation();
    const updates = { status: newStatus };
    if (newStatus === 'Submitted' && !record.submitted_time) {
      updates.submitted_time = new Date().toISOString();
    }
    await base44.entities.MaterialTransferSheet.update(record.id, updates);
    toast.success(`Marked as ${newStatus}`);
    load();
  };

  const filtered = applyFilters(records, filters);

  const parseLineItems = (record) => {
    if (!record.line_items) return [];
    try { return JSON.parse(record.line_items); } catch { return []; }
  };

  const renderStatusButtons = (item) => {
    const isNewWorkflow = ['Requested', 'Staged', 'Ready for Pickup', 'Picked Up', 'Completed', 'Cancelled', 'Returned'].includes(item.status);
    const nextStatuses = isNewWorkflow ? (NEXT_STATUSES[item.status] || []) : (LEGACY_NEXT[item.status] || []);

    if (nextStatuses.length === 0) return null;

    return nextStatuses.map(status => (
      <button
        key={status}
        onClick={(e) => isNewWorkflow ? handleStatusTransition(item, status, e) : handleLegacyStatusChange(item, status, e)}
        disabled={transitioning === item.id}
        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors disabled:opacity-50 ${status === 'Cancelled' ? 'border-destructive text-destructive hover:bg-destructive/10' : status === 'Completed' || status === 'Closed' ? 'bg-accent text-accent-foreground border-accent hover:bg-accent/90' : 'border-input bg-background hover:bg-accent hover:text-accent-foreground'}`}
      >
        {transitioning === item.id ? '...' : status}
      </button>
    ));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Material Transfer Sheets</h1>
          <p className="text-muted-foreground text-sm">Create and track material transfers from warehouse to jobsite</p>
        </div>
        <Button onClick={() => { setEditing(null); setContextJob(null); setWizardOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="w-4 h-4 mr-2" /> New Material Transfer
        </Button>
      </div>

      <WarehouseFilters filters={filterConfig} values={filters} onChange={setFilters} />

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
        </div>
      ) : (
        <WarehouseCardList
          data={filtered}
          onRowClick={(row) => { setEditing(row); setDialogOpen(true); }}
          emptyMessage="No transfer sheets found. Click 'New Material Transfer' to create one."
          renderCard={(item) => {
            const lineItems = parseLineItems(item);
            const isNewWorkflow = !!item.transfer_id;
            return (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {item.transfer_id ? `${item.transfer_id} — ` : ''}{item.technician}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.date} {item.truck_number ? `• Truck #${item.truck_number}` : ''}
                      {item.job_number ? ` • Job #${item.job_number}` : ''}
                      {item.customer_name ? ` • ${item.customer_name}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                {lineItems.length > 0 ? (
                  <div className="space-y-0.5">
                    {lineItems.slice(0, 3).map((li, i) => (
                      <p key={i} className="text-xs text-muted-foreground flex items-center gap-1">
                        <Package className="w-3 h-3" /> {li.item_name} — Qty: {li.quantity_requested} {li.unit || 'ea'}
                      </p>
                    ))}
                    {lineItems.length > 3 && <p className="text-xs text-muted-foreground">+{lineItems.length - 3} more items</p>}
                  </div>
                ) : item.materials_taken ? (
                  <p className="text-xs text-muted-foreground line-clamp-2">{item.materials_taken}</p>
                ) : null}
                {item.technician_signature && (
                  <p className="text-xs text-green-600 flex items-center gap-1">✓ Signed</p>
                )}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex gap-1.5 flex-wrap">
                    {renderStatusButtons(item)}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(item); }} className="text-destructive hover:bg-destructive/10 p-1.5 rounded-md transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          }}
        />
      )}

      <MaterialTransferWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={load}
        contextJob={contextJob}
      />

      <WarehouseFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Edit Transfer Sheet' : 'New Material Transfer Sheet'}
        fields={fields}
        initialData={editing || { date: new Date().toISOString().split('T')[0], status: 'Draft' }}
        onSave={handleSave}
        technicians={technicians.filter(t => t.active_status)}
      />
    </div>
  );
}