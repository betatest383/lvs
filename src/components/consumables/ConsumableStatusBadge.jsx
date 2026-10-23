const STATUS_STYLES = {
  Draft: 'bg-gray-100 text-gray-700',
  Submitted: 'bg-blue-100 text-blue-700',
  Pulling: 'bg-amber-100 text-amber-700',
  'Ready for Pickup': 'bg-purple-100 text-purple-700',
  Completed: 'bg-green-100 text-green-700',
};

export default function ConsumableStatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  );
}