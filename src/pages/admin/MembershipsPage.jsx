import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import DataTable from '../../components/shared/DataTable';
import EntityFormDialog from '../../components/shared/EntityFormDialog';
import { toast } from 'sonner';

const statusColor = {
  active: 'bg-green-100 text-green-700',
  expired: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
  pending: 'bg-amber-100 text-amber-700',
};

export default function MembershipsPage() {
  const [memberships, setMemberships] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => base44.entities.Membership.list('-created_date', 100).then(setMemberships);
  useEffect(() => {
    load();
    base44.entities.Customer.list('-name', 200).then(setCustomers);
  }, []);

  const columns = [
    { key: 'customer_name', label: 'Customer', render: r => <span className="font-medium">{r.customer_name || '—'}</span> },
    { key: 'membership_type', label: 'Type', render: r => <span className="capitalize font-medium">{r.membership_type}</span> },
    { key: 'start_date', label: 'Start Date' },
    { key: 'renewal_date', label: 'Renewal' },
    { key: 'annual_fee', label: 'Fee', render: r => r.annual_fee ? `$${r.annual_fee.toFixed(2)}` : '—' },
    { key: 'status', label: 'Status', render: r => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[r.status] || ''}`}>{r.status}</span>
    )},
  ];

  const fields = [
    { key: 'customer_id', label: 'Customer', type: 'select', options: customers.map(c => ({ value: c.id, label: c.name })) },
    { key: 'membership_type', label: 'Membership Type', type: 'select', options: [
      { value: 'basic', label: 'Basic' },
      { value: 'premium', label: 'Premium' },
      { value: 'gold', label: 'Gold' },
    ]},
    { key: 'start_date', label: 'Start Date', type: 'date' },
    { key: 'renewal_date', label: 'Renewal Date', type: 'date' },
    { key: 'annual_fee', label: 'Annual Fee ($)', type: 'number' },
    { key: 'status', label: 'Status', type: 'select', options: [
      { value: 'active', label: 'Active' },
      { value: 'expired', label: 'Expired' },
      { value: 'cancelled', label: 'Cancelled' },
      { value: 'pending', label: 'Pending' },
    ]},
    { key: 'benefits', label: 'Benefits', type: 'textarea' },
  ];

  const handleSave = async (data) => {
    const customer = customers.find(c => c.id === data.customer_id);
    data.customer_name = customer?.name || '';
    data.customer_email = customer?.email || '';
    if (editing) {
      await base44.entities.Membership.update(editing.id, data);
    } else {
      await base44.entities.Membership.create(data);
    }
    toast.success(editing ? 'Membership updated' : 'Membership created');
    setEditing(null);
    load();
  };

  return (
    <>
      <DataTable
        title="Memberships"
        subtitle="Manage customer memberships"
        columns={columns}
        data={memberships}
        searchFields={['customer_name', 'membership_type']}
        onAdd={() => { setEditing(null); setDialogOpen(true); }}
        addLabel="New Membership"
        onRowClick={(row) => { setEditing(row); setDialogOpen(true); }}
      />
      <EntityFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Edit Membership' : 'New Membership'}
        fields={fields}
        initialData={editing || { status: 'active' }}
        onSave={handleSave}
      />
    </>
  );
}