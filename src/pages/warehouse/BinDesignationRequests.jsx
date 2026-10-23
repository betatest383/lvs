import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import WarehouseFormDialog from '@/components/warehouse/WarehouseFormDialog';
import WarehouseFilters from '@/components/warehouse/WarehouseFilters';
import WarehouseCardList from '@/components/warehouse/WarehouseCardList';
import { StatusBadge, applyFilters } from '@/components/warehouse/statusConfig.jsx';

const STATUS_OPTIONS = [
  { value: 'Pending', label: 'Pending' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Assigned', label: 'Assigned' },
];

const filterConfig = [
  { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
  { key: 'requested_by', label: 'Requested By', type: 'text' },
];

const fields = [
  { key: 'item_name', label: 'Item Name', type: 'text', required: true },
  { key: 'sku', label: 'SKU', type: 'text' },
  { key: 'current_location', label: 'Current Location', type: 'text', placeholder: 'Where is the item currently?' },
  { key: 'reason_needed', label: 'Reason Needed', type: 'textarea' },
  { key: 'requested_by', label: 'Requested By', type: 'text' },
  { key: 'photo_upload', label: 'Photo Upload', type: 'photo' },
  { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
  { key: 'assigned_bin_location', label: 'Assigned Bin Location', type: 'text', placeholder: 'e.g. A-12, Shelf B-3' },
  { key: 'approved_by', label: 'Approved By', type: 'text' },
  { key: 'related_sop_id', label: 'Related SOP ID', type: 'text', placeholder: 'e.g. SOP-WH-005', helpText: 'Link to the official Trainual SOP for this workflow.' },
  { key: 'trainual_link', label: 'Trainual Link', type: 'text', placeholder: 'https://trainual.com/...' },
];

export default function BinDesignationRequests() {
  const [records, setRecords] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const recs = await base44.entities.BinDesignationRequest.list('-created_date', 200);
      setRecords(recs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.BinDesignationRequest.update(editing.id, data);
      toast.success('Request updated');
    } else {
      await base44.entities.BinDesignationRequest.create(data);
      toast.success('Request created');
    }
    setEditing(null);
    load();
  };

  const handleDelete = async (record) => {
    if (!confirm('Delete this bin designation request?')) return;
    await base44.entities.BinDesignationRequest.delete(record.id);
    toast.success('Request deleted');
    load();
  };

  const handleStatusChange = async (record, newStatus, e) => {
    e.stopPropagation();
    if (newStatus === 'Assigned' && !record.assigned_bin_location) {
      toast.error('Assign a bin location before marking as Assigned');
      setEditing({ ...record, status: 'Assigned' });
      setDialogOpen(true);
      return;
    }
    const updates = { status: newStatus };
    if (newStatus === 'Approved' && !record.approved_by) {
      updates.approved_by = 'Warehouse Manager';
    }
    await base44.entities.BinDesignationRequest.update(record.id, updates);
    toast.success(`Marked as ${newStatus}`);
    load();
  };

  const filtered = applyFilters(records, filters);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bin Designation Requests</h1>
          <p className="text-muted-foreground text-sm">Request bin locations for items without a designated home</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="w-4 h-4 mr-2" /> New Request
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
          emptyMessage="No bin designation requests found."
          renderCard={(item) => (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{item.item_name}</p>
                  {item.sku && <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>}
                </div>
                <StatusBadge status={item.status} />
              </div>
              {item.current_location && (
                <p className="text-xs text-muted-foreground">Current: {item.current_location}</p>
              )}
              {item.assigned_bin_location && (
                <p className="text-xs text-green-600 font-medium">Bin: {item.assigned_bin_location}</p>
              )}
              {item.reason_needed && (
                <p className="text-xs text-muted-foreground line-clamp-2">{item.reason_needed}</p>
              )}
              {item.photo_upload && (
                <img src={item.photo_upload} alt="Item" className="w-full h-20 object-cover rounded-lg" />
              )}
              {item.requested_by && (
                <p className="text-xs text-muted-foreground">Requested by: {item.requested_by}</p>
              )}
              <div className="flex items-center justify-between pt-1">
                <div className="flex gap-1.5">
                  {item.status === 'Pending' && (
                    <button onClick={(e) => handleStatusChange(item, 'Approved', e)} className="px-2.5 py-1 rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">Approve</button>
                  )}
                  {item.status === 'Approved' && (
                    <button onClick={(e) => handleStatusChange(item, 'Assigned', e)} className="px-2.5 py-1 rounded-md text-xs font-medium bg-accent text-accent-foreground border border-accent hover:bg-accent/90 transition-colors">Assign</button>
                  )}
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(item); }} className="text-destructive hover:bg-destructive/10 p-1.5 rounded-md transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        />
      )}

      <WarehouseFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Edit Bin Request' : 'New Bin Designation Request'}
        fields={fields}
        initialData={editing || { status: 'Pending' }}
        onSave={handleSave}
      />
    </div>
  );
}