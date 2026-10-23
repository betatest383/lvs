export const statusColors = {
  'Submitted': 'bg-blue-100 text-blue-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  'Completed': 'bg-green-100 text-green-700',
  'Draft': 'bg-gray-100 text-gray-700',
  'Issued': 'bg-indigo-100 text-indigo-700',
  'Closed': 'bg-green-100 text-green-700',
  'Received': 'bg-blue-100 text-blue-700',
  'Needs Correction': 'bg-red-100 text-red-700',
  'Verified': 'bg-amber-100 text-amber-700',
  'Returned to Stock': 'bg-green-100 text-green-700',
  'Complete': 'bg-green-100 text-green-700',
  'Incomplete': 'bg-red-100 text-red-700',
  'Pending': 'bg-amber-100 text-amber-700',
  'Approved': 'bg-blue-100 text-blue-700',
  'Assigned': 'bg-green-100 text-green-700',
  'Requested': 'bg-blue-100 text-blue-700',
  'Staged': 'bg-amber-100 text-amber-700',
  'Ready for Pickup': 'bg-orange-100 text-orange-700',
  'Picked Up': 'bg-indigo-100 text-indigo-700',
  'Cancelled': 'bg-red-100 text-red-700',
  'Returned': 'bg-green-100 text-green-700',
};

export function StatusBadge({ status }) {
  const colorClass = statusColors[status] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${colorClass}`}>
      {status || '—'}
    </span>
  );
}

export function applyFilters(data, filters) {
  return data.filter(item => {
    for (const [key, value] of Object.entries(filters)) {
      if (!value) continue;
      if (key === 'date') {
        if (item.date !== value) return false;
      } else if (key === 'status') {
        if (item.status !== value) return false;
      } else {
        const itemVal = item[key];
        if (!itemVal || !String(itemVal).toLowerCase().includes(String(value).toLowerCase())) return false;
      }
    }
    return true;
  });
}