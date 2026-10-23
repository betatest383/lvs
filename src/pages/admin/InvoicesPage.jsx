import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import DataTable from '../../components/shared/DataTable';

const statusColor = {
  draft: 'bg-gray-100 text-gray-700',
  pending_review: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    base44.entities.Invoice.list('-created_date', 100).then(setInvoices);
  }, []);

  const columns = [
    { key: 'customer_name', label: 'Customer', render: r => <span className="font-medium">{r.customer_name || '—'}</span> },
    { key: 'total', label: 'Total', render: r => r.total ? `$${r.total.toFixed(2)}` : '—' },
    { key: 'due_date', label: 'Due Date' },
    { key: 'status', label: 'Status', render: r => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[r.status] || ''}`}>{r.status?.replace(/_/g, ' ')}</span>
    )},
  ];

  return (
    <DataTable
      title="Invoices"
      subtitle="Manage customer invoices"
      columns={columns}
      data={invoices}
      searchFields={['customer_name']}
      emptyMessage="No invoices generated yet"
    />
  );
}