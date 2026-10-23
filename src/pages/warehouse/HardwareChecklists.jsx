import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import WarehouseFormDialog from '@/components/warehouse/WarehouseFormDialog';
import WarehouseFilters from '@/components/warehouse/WarehouseFilters';
import WarehouseCardList from '@/components/warehouse/WarehouseCardList';
import { StatusBadge, applyFilters } from '@/components/warehouse/statusConfig.jsx';
import { useTechnicians } from '@/hooks/useTechnicians';

const STATUS_OPTIONS = [
  { value: 'Submitted', label: 'Submitted' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Completed', label: 'Completed' },
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
  { key: 'items_requested', label: 'Items Requested', type: 'textarea', placeholder: 'List hardware items requested...' },
  { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
  { key: 'pulled_by', label: 'Pulled By', type: 'text' },
  { key: 'related_sop_id', label: 'Related SOP ID', type: 'text', placeholder: 'e.g. SOP-WH-001', helpText: 'Link to the official Trainual SOP for this workflow.' },
  { key: 'trainual_link', label: 'Trainual Link', type: 'text', placeholder: 'https://trainual.com/...' },
];

export default function HardwareChecklists() {
  const { technicians, loading: techsLoading } = useTechnicians();
  const [records, setRecords] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const recs = await base44.entities.HardwareChecklist.list('-created_date', 200);
      setRecords(recs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.HardwareChecklist.update(editing.id, data);
      toast.success('Checklist updated');
    } else {
      data.submitted_time = new Date().toISOString();
      await base44.entities.HardwareChecklist.create(data);
      toast.success('Checklist created');
    }
    setEditing(null);
    load();
  };

  const handleDelete = async (record) => {
    if (!confirm('Delete this checklist?')) return;
    await base44.entities.HardwareChecklist.delete(record.id);
    toast.success('Checklist deleted');
    load();
  };

  const handleStatusChange = async (record, newStatus, e) => {
    e.stopPropagation();
    const updates = { status: newStatus };
    if (newStatus === 'Completed') {
      updates.completed_time = new Date().toISOString();
    }
    await base44.entities.HardwareChecklist.update(record.id, updates);
    toast.success(`Marked as ${newStatus}`);
    load();
  };

  const filtered = applyFilters(records, filters);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hardware Checklists</h1>
          <p className="text-muted-foreground text-sm">Track hardware pull requests for technician trucks</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="w-4 h-4 mr-2" /> New Checklist
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
          emptyMessage="No hardware checklists found."
          renderCard={(item) => (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{item.technician}</p>
                  <p className="text-xs text-muted-foreground">{item.date} {item.truck_number ? `• Truck #${item.truck_number}` : ''}</p>
                </div>
                <StatusBadge status={item.status} />
              </div>
              {item.items_requested && (
                <p className="text-xs text-muted-foreground line-clamp-2">{item.items_requested}</p>
              )}
              {item.pulled_by && (
                <p className="text-xs text-muted-foreground">Pulled by: {item.pulled_by}</p>
              )}
              <div className="flex items-center justify-between pt-1">
                <div className="flex gap-1.5">
                  {item.status === 'Submitted' && (
                    <button onClick={(e) => handleStatusChange(item, 'In Progress', e)} className="px-2.5 py-1 rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">Start</button>
                  )}
                  {item.status === 'In Progress' && (
                    <button onClick={(e) => handleStatusChange(item, 'Completed', e)} className="px-2.5 py-1 rounded-md text-xs font-medium bg-accent text-accent-foreground border border-accent hover:bg-accent/90 transition-colors">Complete</button>
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
        title={editing ? 'Edit Checklist' : 'New Hardware Checklist'}
        fields={fields}
        initialData={editing || { date: new Date().toISOString().split('T')[0], status: 'Submitted' }}
        onSave={handleSave}
        technicians={technicians.filter(t => t.active_status)}
      />
    </div>
  );
}