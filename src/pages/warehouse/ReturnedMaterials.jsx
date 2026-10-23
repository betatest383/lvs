import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import WarehouseFormDialog from '@/components/warehouse/WarehouseFormDialog';
import WarehouseFilters from '@/components/warehouse/WarehouseFilters';
import WarehouseCardList from '@/components/warehouse/WarehouseCardList';
import { StatusBadge, applyFilters } from '@/components/warehouse/statusConfig.jsx';
import { useTechnicians } from '@/hooks/useTechnicians';

const STATUS_OPTIONS = [
  { value: 'Received', label: 'Received' },
  { value: 'Needs Correction', label: 'Needs Correction' },
  { value: 'Verified', label: 'Verified' },
  { value: 'Returned to Stock', label: 'Returned to Stock' },
];

const filterConfig = [
  { key: 'technician', label: 'Technician', type: 'text' },
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'truck_number', label: 'Truck #', type: 'text' },
  { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
];

const fields = [
  { key: 'date', label: 'Date', type: 'date', required: true },
  { key: 'technician', label: 'Technician', type: 'technician_select', required: true, autoFillTruck: true },
  { key: 'truck_number', label: 'Truck Number', type: 'text' },
  { key: 'materials_returned', label: 'Materials Returned', type: 'textarea', placeholder: 'List returned materials...' },
  { key: 'quantity_returned', label: 'Quantity Returned', type: 'text', placeholder: 'e.g. 1 bag, 3 tubes' },
  { key: 'condition', label: 'Condition', type: 'text', placeholder: 'e.g. Good, Damaged, Worn' },
  { key: 'transfer_sheet_attached', label: 'Transfer Sheet Attached', type: 'select', options: [{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }] },
  { key: 'verified_by', label: 'Verified By', type: 'text' },
  { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
  { key: 'related_sop_id', label: 'Related SOP ID', type: 'text', placeholder: 'e.g. SOP-WH-003', helpText: 'Link to the official Trainual SOP for this workflow.' },
  { key: 'trainual_link', label: 'Trainual Link', type: 'text', placeholder: 'https://trainual.com/...' },
];

export default function ReturnedMaterials() {
  const { technicians } = useTechnicians();
  const [records, setRecords] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const recs = await base44.entities.ReturnedMaterial.list('-created_date', 200);
      setRecords(recs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.ReturnedMaterial.update(editing.id, data);
      toast.success('Return updated');
    } else {
      await base44.entities.ReturnedMaterial.create(data);
      toast.success('Return logged');
    }
    setEditing(null);
    load();
  };

  const handleDelete = async (record) => {
    if (!confirm('Delete this return record?')) return;
    await base44.entities.ReturnedMaterial.delete(record.id);
    toast.success('Return deleted');
    load();
  };

  const handleStatusChange = async (record, newStatus, e) => {
    e.stopPropagation();
    if (newStatus === 'Verified' && record.transfer_sheet_attached !== 'Yes') {
      toast.error('Cannot mark as Verified — transfer sheet must be attached first');
      return;
    }
    const updates = { status: newStatus };
    if (newStatus === 'Verified' && !record.verified_by) {
      updates.verified_by = 'Warehouse Manager';
    }
    await base44.entities.ReturnedMaterial.update(record.id, updates);
    toast.success(`Marked as ${newStatus}`);
    load();
  };

  const filtered = applyFilters(records, filters);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Returned Materials</h1>
          <p className="text-muted-foreground text-sm">Track materials returned to the warehouse</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="w-4 h-4 mr-2" /> Log Return
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
          emptyMessage="No returns logged yet."
          renderCard={(item) => (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{item.technician}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.date} {item.truck_number ? `• Truck #${item.truck_number}` : ''}
                  </p>
                </div>
                <StatusBadge status={item.status} />
              </div>
              {item.materials_returned && (
                <p className="text-xs text-muted-foreground line-clamp-2">{item.materials_returned}</p>
              )}
              <div className="flex items-center gap-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded ${item.transfer_sheet_attached === 'Yes' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {item.transfer_sheet_attached === 'Yes' ? 'Sheet attached' : 'No sheet'}
                </span>
                {item.condition && <span className="text-muted-foreground">Condition: {item.condition}</span>}
              </div>
              {item.status !== 'Verified' && item.status !== 'Returned to Stock' && item.transfer_sheet_attached !== 'Yes' && (
                <div className="flex items-center gap-1 text-xs text-amber-600">
                  <AlertTriangle className="w-3 h-3" /> Attach transfer sheet to verify
                </div>
              )}
              <div className="flex items-center justify-between pt-1">
                <div className="flex gap-1.5 flex-wrap">
                  {(item.status === 'Received' || item.status === 'Needs Correction') && item.transfer_sheet_attached === 'Yes' && (
                    <button onClick={(e) => handleStatusChange(item, 'Verified', e)} className="px-2.5 py-1 rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">Verify</button>
                  )}
                  {item.status === 'Verified' && (
                    <button onClick={(e) => handleStatusChange(item, 'Returned to Stock', e)} className="px-2.5 py-1 rounded-md text-xs font-medium bg-accent text-accent-foreground border border-accent hover:bg-accent/90 transition-colors">Return to Stock</button>
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
        title={editing ? 'Edit Return' : 'Log Returned Material'}
        fields={fields}
        initialData={editing || { date: new Date().toISOString().split('T')[0], status: 'Received', transfer_sheet_attached: 'No' }}
        onSave={handleSave}
        technicians={technicians.filter(t => t.active_status)}
      />
    </div>
  );
}