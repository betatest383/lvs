import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import DataTable from '../shared/DataTable';
import EntityFormDialog from '../shared/EntityFormDialog';
import { toast } from 'sonner';

export default function MaterialsManager() {
  const [materials, setMaterials] = useState([]);
  const [repairs, setRepairs] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => base44.entities.Material.list('item_name', 200).then(setMaterials);
  useEffect(() => {
    load();
    base44.entities.Repair.list('repair_name', 200).then(setRepairs);
  }, []);

  const fields = [
    { key: 'item_name', label: 'Material Name', type: 'text' },
    { key: 'repair_id', label: 'Associated Repair', type: 'select', options: [{ value: '', label: '— None —' }, ...repairs.map(r => ({ value: r.id, label: r.repair_name }))] },
    { key: 'quantity', label: 'Default Quantity', type: 'number' },
    { key: 'unit', label: 'Unit', type: 'select', options: [
      { value: 'each', label: 'Each' },
      { value: 'feet', label: 'Feet' },
      { value: 'sq_ft', label: 'Sq Ft' },
      { value: 'gallons', label: 'Gallons' },
      { value: 'lbs', label: 'Lbs' },
      { value: 'bags', label: 'Bags' },
      { value: 'tubes', label: 'Tubes' },
      { value: 'rolls', label: 'Rolls' },
      { value: 'boxes', label: 'Boxes' },
    ]},
    { key: 'unit_cost', label: 'Unit Cost ($)', type: 'number' },
    { key: 'supplier', label: 'Supplier', type: 'text' },
    { key: 'sku', label: 'SKU', type: 'text' },
  ];

  const columns = [
    { key: 'item_name', label: 'Material', render: r => <span className="font-medium">{r.item_name}</span> },
    { key: 'repair_name', label: 'Repair' },
    { key: 'quantity', label: 'Qty' },
    { key: 'unit', label: 'Unit' },
    { key: 'unit_cost', label: 'Unit Cost', render: r => r.unit_cost ? `$${r.unit_cost.toFixed(2)}` : '—' },
    { key: 'supplier', label: 'Supplier' },
  ];

  const handleSave = async (data) => {
    const repair = repairs.find(r => r.id === data.repair_id);
    data.repair_name = repair?.repair_name || '';
    if (editing) {
      await base44.entities.Material.update(editing.id, data);
    } else {
      await base44.entities.Material.create(data);
    }
    toast.success(editing ? 'Material updated' : 'Material created');
    setEditing(null);
    load();
  };

  return (
    <>
      <DataTable
        title="Materials Catalog"
        subtitle={`${materials.length} materials defined`}
        columns={columns}
        data={materials}
        searchFields={['item_name', 'repair_name', 'supplier']}
        onAdd={() => { setEditing(null); setDialogOpen(true); }}
        addLabel="Add Material"
        onRowClick={(row) => { setEditing(row); setDialogOpen(true); }}
      />
      <EntityFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Edit Material' : 'New Material'}
        fields={fields}
        initialData={editing || { quantity: 1, unit: 'each' }}
        onSave={handleSave}
      />
    </>
  );
}