import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import DataTable from '../shared/DataTable';
import RepairFormDialog from './RepairFormDialog';
import { toast } from 'sonner';

export default function RepairsManager() {
  const [repairs, setRepairs] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => base44.entities.Repair.list('repair_name', 200).then(setRepairs);
  useEffect(() => { load(); }, []);

  const columns = [
    { key: 'repair_name', label: 'Repair', render: r => <span className="font-medium">{r.repair_name}</span> },
    { key: 'repair_category_name', label: 'Category', render: r => r.repair_category_name || r.category || '—' },
    { key: 'estimate_price', label: 'Estimate Price', render: r => r.estimate_price ? `$${r.estimate_price.toFixed(2)}` : '—' },
    { key: 'invoice_price', label: 'Invoice Price', render: r => r.invoice_price ? `$${r.invoice_price.toFixed(2)}` : '—' },
    { key: 'labor_hours', label: 'Labor Hrs' },
    { key: 'is_active', label: 'Active', render: r => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
        {r.is_active !== false ? 'Active' : 'Inactive'}
      </span>
    )},
  ];

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.Repair.update(editing.id, data);
    } else {
      await base44.entities.Repair.create(data);
    }
    toast.success(editing ? 'Repair updated' : 'Repair created');
    setEditing(null);
    load();
  };

  return (
    <>
      <DataTable
        title="Repairs Catalog"
        subtitle={`${repairs.length} repairs defined`}
        columns={columns}
        data={repairs}
        searchFields={['repair_name', 'category', 'repair_category_name']}
        onAdd={() => { setEditing(null); setDialogOpen(true); }}
        addLabel="Add Repair"
        onRowClick={(row) => { setEditing(row); setDialogOpen(true); }}
      />
      <RepairFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Edit Repair' : 'New Repair'}
        initialData={editing || { is_active: true }}
        onSave={handleSave}
      />
    </>
  );
}