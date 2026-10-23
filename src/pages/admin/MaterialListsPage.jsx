import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import DataTable from '../../components/shared/DataTable';

const statusColor = {
  pending: 'bg-amber-100 text-amber-700',
  ordered: 'bg-blue-100 text-blue-700',
  received: 'bg-green-100 text-green-700',
  partial: 'bg-purple-100 text-purple-700',
};

export default function MaterialListsPage() {
  const [lists, setLists] = useState([]);

  useEffect(() => {
    base44.entities.MaterialList.list('-created_date', 100).then(setLists);
  }, []);

  const columns = [
    { key: 'customer_name', label: 'Customer', render: r => <span className="font-medium">{r.customer_name || '—'}</span> },
    { key: 'total_cost', label: 'Total Cost', render: r => r.total_cost ? `$${r.total_cost.toFixed(2)}` : '—' },
    { key: 'status', label: 'Status', render: r => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[r.status] || ''}`}>{r.status}</span>
    )},
    { key: 'created_date', label: 'Created', render: r => new Date(r.created_date).toLocaleDateString() },
  ];

  return (
    <DataTable
      title="Material Lists"
      subtitle="Materials needed for estimated repairs"
      columns={columns}
      data={lists}
      searchFields={['customer_name']}
      emptyMessage="No material lists generated yet"
    />
  );
}