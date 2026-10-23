import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import DataTable from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { RotateCcw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTimeET } from '@/lib/timezone';

const fmtDateTime = (d) => formatDateTimeET(d);

export default function DeletedJobsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState(null);

  const load = () => {
    setLoading(true);
    base44.entities.Job.filter({ is_deleted: true }, '-deleted_at', 200)
      .then(setJobs)
      .catch(() => toast.error('Failed to load deleted jobs'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (user && user.role !== 'admin' && user.role !== 'owner') {
    return <div className="p-8 text-center text-muted-foreground">Owner/Admin access required.</div>;
  }

  const handleRestore = async (job) => {
    setRestoringId(job.id);
    try {
      await base44.functions.invoke('manageJobDeletion', { action: 'restore', job_id: job.id });
      toast.success('Job restored');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message || 'Failed to restore job');
    } finally {
      setRestoringId(null);
    }
  };

  const columns = [
    { key: 'crm_job_number', label: 'Job #', render: r => <span className="font-mono text-xs text-muted-foreground">{r.crm_job_number || r.servicetitan_job_number || '—'}</span> },
    { key: 'customer_name', label: 'Customer', render: r => <span className="font-medium">{r.customer_name || '—'}</span> },
    { key: 'address', label: 'Address', render: r => <span className="text-xs">{[r.address, r.city, r.state].filter(Boolean).join(', ') || '—'}</span> },
    { key: 'deleted_at', label: 'Deleted Date', render: r => <span className="text-xs">{fmtDateTime(r.deleted_at)}</span> },
    { key: 'deleted_by_name', label: 'Deleted By', render: r => <span className="text-xs">{r.deleted_by_name || '—'}</span> },
    { key: 'deletion_reason', label: 'Reason', render: r => <span className="text-xs text-muted-foreground line-clamp-1">{r.deletion_reason || '—'}</span> },
    { key: 'actions', label: '', render: r => (
      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-7 px-2 gap-1"
          onClick={() => handleRestore(r)}
          disabled={restoringId === r.id}
        >
          {restoringId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
          Restore
        </Button>
      </div>
    )},
  ];

  return (
    <DataTable
      title="Deleted Jobs"
      subtitle="Soft-deleted jobs — Owner/Admin only. All related history is preserved."
      columns={columns}
      data={jobs}
      loading={loading}
      searchFields={['customer_name', 'address', 'crm_job_number', 'deletion_reason']}
      onRowClick={(row) => navigate(`/admin/jobs/${row.id}`)}
    />
  );
}