const STATUS_STYLES = {
  'Pending Return': 'bg-blue-100 text-blue-700 border-blue-200',
  'Returned': 'bg-amber-100 text-amber-700 border-amber-200',
  'Warehouse Reviewing': 'bg-amber-100 text-amber-700 border-amber-200',
  'Verified': 'bg-purple-100 text-purple-700 border-purple-200',
  'Adjusted': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  'Closed': 'bg-green-100 text-green-700 border-green-200',
};

export default function MaterialReturnStatusBadge({ status }) {
  const cls = STATUS_STYLES[status] || 'bg-gray-100 text-gray-700 border-gray-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {status}
    </span>
  );
}