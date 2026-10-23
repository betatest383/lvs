import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import DataTable from '../../components/shared/DataTable';
import EntityFormDialog from '../../components/shared/EntityFormDialog';
import { toast } from 'sonner';

const fields = [
  { key: 'item_name', label: 'Item Name', type: 'text' },
  { key: 'category', label: 'Category', type: 'select', options: [
    { value: 'accessories', label: 'Accessories' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'tools', label: 'Tools' },
    { value: 'caps', label: 'Caps' },
    { value: 'liners', label: 'Liners' },
    { value: 'services', label: 'Services' },
    { value: 'other', label: 'Other' },
  ]},
  { key: 'price', label: 'Price ($)', type: 'number' },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'image_url', label: 'Image URL', type: 'text' },
  { key: 'stock_qty', label: 'Stock Quantity', type: 'number' },
  { key: 'is_active', label: 'Active', type: 'boolean' },
];

export default function StoreAdminPage() {
  const [items, setItems] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => base44.entities.StoreItem.list('-created_date', 100).then(setItems);
  useEffect(() => { load(); }, []);

  const columns = [
    { key: 'item_name', label: 'Item', render: r => <span className="font-medium">{r.item_name}</span> },
    { key: 'category', label: 'Category', render: r => <span className="capitalize">{r.category}</span> },
    { key: 'price', label: 'Price', render: r => `$${r.price?.toFixed(2) || '0.00'}` },
    { key: 'stock_qty', label: 'Stock', render: r => r.stock_qty || 0 },
    { key: 'is_active', label: 'Active', render: r => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
        {r.is_active !== false ? 'Active' : 'Inactive'}
      </span>
    )},
  ];

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.StoreItem.update(editing.id, data);
    } else {
      await base44.entities.StoreItem.create(data);
    }
    toast.success(editing ? 'Item updated' : 'Item created');
    setEditing(null);
    load();
  };

  return (
    <>
      <DataTable
        title="Store Items"
        subtitle="Manage store products and services"
        columns={columns}
        data={items}
        searchFields={['item_name', 'category']}
        onAdd={() => { setEditing(null); setDialogOpen(true); }}
        addLabel="Add Item"
        onRowClick={(row) => { setEditing(row); setDialogOpen(true); }}
      />
      <EntityFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Edit Store Item' : 'New Store Item'}
        fields={fields}
        initialData={editing || { is_active: true }}
        onSave={handleSave}
      />
    </>
  );
}