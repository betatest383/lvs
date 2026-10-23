import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Calendar, Clock, User, MapPin, RefreshCw } from 'lucide-react';
import { formatDateTimeET } from '@/lib/timezone';
import { useCurrentRole } from '@/hooks/useCurrentRole';
import { canOverrideConflict } from '@/lib/roleUtils';
import { toast } from 'react-hot-toast';

const statusColor = {
  scheduled: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-indigo-100 text-indigo-700',
  dispatched: 'bg-amber-100 text-amber-700',
  started: 'bg-orange-100 text-orange-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

const fmtDateTime = (d) => formatDateTimeET(d);

export default function JobAppointments({ jobId, crmJobNumber }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState({});
  const { role } = useCurrentRole();
  const canRefresh = canOverrideConflict(role);

  const loadAppointments = () => {
    if (!jobId && !crmJobNumber) return;
    setLoading(true);
    const filter = jobId ? { job_id: jobId } : { crm_job_number: crmJobNumber };
    base44.entities.Appointment.filter(filter, 'scheduled_start', 50)
      .then(setAppointments)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAppointments(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [jobId, crmJobNumber]);

  const handleRefresh = async (aptId) => {
    setRefreshing((s) => ({ ...s, [aptId]: true }));
    try {
      const res = await base44.functions.invoke('requestZapierAppointmentRefresh', { appointment_id: aptId });
      const data = res?.data || res;
      if (data?.success) {
        toast.success(data.message || 'Refresh request sent. The appointment will update shortly.');
        loadAppointments();
      } else {
        toast.error(data?.error || 'Refresh request failed.');
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Refresh request failed.';
      toast.error(msg);
    } finally {
      setRefreshing((s) => ({ ...s, [aptId]: false }));
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground py-2">Loading appointments…</p>;
  }

  if (appointments.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No appointments linked to this job.</p>;
  }

  return (
    <div className="space-y-2">
      {appointments.map(apt => (
        <div key={apt.id} className="rounded-lg border p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{apt.appointment_type || 'Appointment'}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[apt.status] || 'bg-muted text-muted-foreground'}`}>
              {apt.status}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            <span>{fmtDateTime(apt.scheduled_start)}</span>
            {apt.scheduled_end && (
              <>
                <Clock className="w-3 h-3 ml-1" />
                <span>to {fmtDateTime(apt.scheduled_end)}</span>
              </>
            )}
          </div>
          {apt.technician_name && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <User className="w-3 h-3" />
              <span>{apt.technician_name}</span>
            </div>
          )}
          {apt.address && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3" />
              <span className="truncate">{[apt.address, apt.city, apt.state, apt.zip].filter(Boolean).join(', ')}</span>
            </div>
          )}
          {apt.servicetitan_appointment_id && (
            <p className="text-xs text-muted-foreground font-mono">ServiceTitan Appointment ID: {apt.servicetitan_appointment_id}</p>
          )}
          {apt.notes && <p className="text-xs text-muted-foreground pt-1">{apt.notes}</p>}
          {canRefresh && apt.servicetitan_appointment_id && (
            <button
              type="button"
              onClick={() => handleRefresh(apt.id)}
              disabled={!!refreshing[apt.id]}
              className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:opacity-80 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing[apt.id] ? 'animate-spin' : ''}`} />
              {refreshing[apt.id] ? 'Sending refresh…' : 'Refresh from ServiceTitan'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}