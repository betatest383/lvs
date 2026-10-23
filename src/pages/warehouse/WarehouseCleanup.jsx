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
  { value: 'Complete', label: 'Complete' },
  { value: 'Incomplete', label: 'Incomplete' },
];

const filterConfig = [
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
];

const fields = [
  { key: 'date', label: 'Date', type: 'date', required: true },
  { key: 'completed_by', label: 'Completed By', type: 'text', required: true },
  { key: 'warehouse_floor_checked', label: 'Warehouse Floor Checked', type: 'boolean' },
  { key: 'outside_lot_checked', label: 'Outside Lot Checked', type: 'boolean' },
  { key: 'cement_spills_cleaned', label: 'Cement Spills Cleaned', type: 'boolean' },
  { key: 'soot_debris_cleaned', label: 'Soot & Debris Cleaned', type: 'boolean' },
  { key: 'trash_removed', label: 'Trash Removed', type: 'boolean' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
  { key: 'photo_upload', label: 'Photo Upload', type: 'photo' },
  { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
  { key: 'related_sop_id', label: 'Related SOP ID', type: 'text', placeholder: 'e.g. SOP-WH-004', helpText: 'Link to the official Trainual SOP for this workflow.' },
  { key: 'trainual_link', label: 'Trainual Link', type: 'text', placeholder: 'https://trainual.com/...' },
];

const CHECK_KEYS = ['warehouse_floor_checked', 'outside_lot_checked', 'cement_spills_cleaned', 'soot_debris_cleaned', 'trash_removed'];

export default function WarehouseCleanup() {
  const [records, setRecords] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const recs = await base44.entities.WarehouseCleanup.list('-created_date', 200);
      setRecords(recs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    const allChecked = CHECK_KEYS.every(k => data[k] === true);
    data.status = allChecked ? 'Complete' : 'Incomplete';
    if (editing) {
      await base44.entities.WarehouseCleanup.update(editing.id, data);
      toast.success('Cleanup record updated');
    } else {
      await base44.entities.WarehouseCleanup.create(data);
      toast.success(allChecked ? 'Cleanup marked complete' : 'Cleanup record saved');
    }
    setEditing(null);
    load();
  };

  const handleDelete = async (record) => {
    if (!confirm('Delete this cleanup record?')) return;
    await base44.entities.WarehouseCleanup.delete(record.id);
    toast.success('Cleanup record deleted');
    load();
  };

  const filtered = applyFilters(records, filters);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Warehouse Cleanup</h1>
          <p className="text-muted-foreground text-sm">Daily cleanup checklist for warehouse floor and lot</p>
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
          emptyMessage="No cleanup records found."
          renderCard={(item) => {
            const completedCount = CHECK_KEYS.filter(k => item[k]).length;
            return (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{item.completed_by}</p>
                    <p className="text-xs text-muted-foreground">{item.date}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{completedCount}/{CHECK_KEYS.length} tasks done</span>
                </div>
                {CHECK_KEYS.map(key => (
                  <div key={key} className="flex items-center gap-1.5 text-xs">
                    <span className={item[key] ? 'text-green-600' : 'text-muted-foreground'}>
                      {item[key] ? '✓' : '○'} {fields.find(f => f.key === key)?.label}
                    </span>
                  </div>
                ))}
                {item.photo_upload && (
                  <img src={item.photo_upload} alt="Cleanup" className="w-full h-20 object-cover rounded-lg mt-1" />
                )}
                <div className="flex justify-end pt-1">
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(item); }} className="text-destructive hover:bg-destructive/10 p-1.5 rounded-md transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          }}
        />
      )}

      <WarehouseFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Edit Cleanup Checklist' : 'New Cleanup Checklist'}
        fields={fields}
        initialData={editing || {
          date: new Date().toISOString().split('T')[0],
          status: 'Incomplete',
          warehouse_floor_checked: false,
          outside_lot_checked: false,
          cement_spills_cleaned: false,
          soot_debris_cleaned: false,
          trash_removed: false,
        }}
        onSave={handleSave}
      />
    </div>
  );
}