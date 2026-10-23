import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import DataTable from '../../components/shared/DataTable';
import EntityFormDialog from '../../components/shared/EntityFormDialog';
import LocationsManager from '@/components/admin/LocationsManager';
import { Building2, Trash2, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import CustomerJobsDialog from '@/components/admin/CustomerJobsDialog';
import { useAuth } from '@/lib/AuthContext';

const fields = [
  { key: 'name', label: 'Full Name', type: 'text' },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'address', label: 'Address', type: 'text' },
  { key: 'city', label: 'City', type: 'text' },
  { key: 'state', label: 'State', type: 'text' },
  { key: 'zip', label: 'Zip Code', type: 'text' },
  { key: 'portal_user_email', label: 'Portal Login Email', type: 'text' },
  { key: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
  { key: 'notes', label: 'Notes', type: 'textarea' },
];

const getColumns = (onLocations, onJobs, onDelete, canDelete) => [
  { key: 'customer_number', label: '#', render: r => <span className="font-mono text-xs text-muted-foreground">{r.customer_number || r.servicetitan_customer_id || '—'}</span> },
  { key: 'name', label: 'Name', render: r => <span className="font-medium">{r.name}</span> },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'city', label: 'City' },
  { key: 'status', label: 'Status', render: r => (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {r.status}
    </span>
  )},
  { key: 'actions', label: '', render: r => (
    <div className="flex items-center gap-1">
      <button
        onClick={(e) => { e.stopPropagation(); onLocations(r); }}
        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <Building2 className="w-3.5 h-3.5" /> Locations
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onJobs(r); }}
        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
        title="View jobs for this customer"
      >
        <ClipboardList className="w-3.5 h-3.5" /> Jobs
      </button>
      {canDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(r); }}
          className="flex items-center justify-center w-8 h-8 rounded-md text-destructive border border-input bg-background hover:bg-destructive hover:text-destructive-foreground transition-colors"
          title="Delete customer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )},
];

export default function CustomersPage() {
  const { user } = useAuth();
  const canDelete = user?.role === 'admin' || user?.role === 'owner';
  const [customers, setCustomers] = useState([]);
  const [portalUsers, setPortalUsers] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [locationsCustomer, setLocationsCustomer] = useState(null);
  const [jobsCustomer, setJobsCustomer] = useState(null);

  const loadAllCustomers = async () => {
    const all = [];
    let skip = 0;
    // Fetch every Customer record in batches of 5,000 until a batch is short.
    while (true) {
      const batch = await base44.entities.Customer.list('-created_date', 5000, skip);
      all.push(...batch);
      if (batch.length < 5000) break;
      skip += 5000;
    }
    return all;
  };

  const load = () => Promise.all([
    loadAllCustomers(),
    base44.entities.User.list('-created_date', 100),
  ]).then(([custs, users]) => {
    setCustomers(custs);
    setPortalUsers(users.filter(u => u.role !== 'admin' && u.role !== 'technician'));
  });
  useEffect(() => { load(); }, []);

  const handleDelete = async (customer) => {
    if (!confirm(`Delete customer "${customer.name}"? This will also remove their locations. This cannot be undone.`)) return;
    try {
      await base44.entities.Customer.delete(customer.id);
      toast.success('Customer deleted');
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to delete customer');
    }
  };

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.Customer.update(editing.id, data);
    } else {
      // Auto-generate customer number
      const all = await base44.entities.Customer.list('-created_date', 1);
      const lastNum = all.length > 0 && all[0].customer_number ? parseInt(all[0].customer_number.replace(/\D/g, '')) || 0 : 0;
      data.customer_number = `C${String(lastNum + 1).padStart(4, '0')}`;
      await base44.entities.Customer.create(data);
    }
    toast.success(editing ? 'Customer updated' : 'Customer created');
    setEditing(null);
    load();
  };

  const portalColumns = [
    { key: 'full_name', label: 'Name', render: r => <span className="font-medium">{r.full_name}</span> },
    { key: 'email', label: 'Email' },
    { key: 'created_date', label: 'Registered', render: r => new Date(r.created_date).toLocaleDateString() },
    { key: 'role', label: 'Role', render: r => (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{r.role || 'user'}</span>
    )},
  ];

  return (
    <div className="space-y-8">
      <DataTable
        title="Customers"
        subtitle="Manage your customer CRM records"
        columns={getColumns(setLocationsCustomer, setJobsCustomer, handleDelete, canDelete)}
        data={customers}
        searchFields={['name', 'email', 'phone', 'city']}
        onAdd={() => { setEditing(null); setDialogOpen(true); }}
        addLabel="Add Customer"
        onRowClick={(row) => { setEditing(row); setDialogOpen(true); }}
      />

      <DataTable
        title="Portal Users"
        subtitle="Customers who have signed into the portal"
        columns={portalColumns}
        data={portalUsers}
        searchFields={['full_name', 'email']}
        emptyMessage="No portal users yet."
      />

      <EntityFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Edit Customer' : 'New Customer'}
        fields={fields}
        initialData={editing || { status: 'active' }}
        onSave={handleSave}
      />

      <LocationsManager
        customer={locationsCustomer}
        open={!!locationsCustomer}
        onOpenChange={(open) => !open && setLocationsCustomer(null)}
      />

      <CustomerJobsDialog
        customer={jobsCustomer}
        open={!!jobsCustomer}
        onOpenChange={(open) => !open && setJobsCustomer(null)}
      />
    </div>
  );
}