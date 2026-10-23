import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import DataTable from '../../components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import JobFormDialog from '../../components/admin/JobFormDialog';
import JobAppointments from '../../components/shared/JobAppointments';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar, UserPlus } from 'lucide-react';
import moment from 'moment';
import { toast } from 'sonner';
import { formatDateET } from '@/lib/timezone';

const fmtDate = (d) => formatDateET(d);

export default function JobsPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [techs, setTechs] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [aptJob, setAptJob] = useState(null);

  const [aptMap, setAptMap] = useState({});

  // Load linked appointments for the displayed jobs and build a fallback
  // technician display (deduped by ServiceTitan technician ID). Used only when
  // Job-level technician fields are empty. Display-only — never writes.
  const loadAppointments = (jobIds) => {
    if (!jobIds.length) { setAptMap({}); return; }
    base44.entities.Appointment.filter({ job_id: { $in: jobIds } }, null, 500)
      .then(apts => {
        const map = {};
        for (const a of apts) {
          const jid = a.job_id;
          if (!jid) continue;
          // ST technician IDs: servicetitan_technician_id (comma-sep); drop any
          // 24-hex tokens (resolved EmployeeRegistry ids, not ST IDs).
          const ids = String(a.servicetitan_technician_id || "").split(",").map(s => s.trim()).filter(Boolean)
            .filter(t => !/^[0-9a-f]{24}$/.test(t));
          const names = String(a.servicetitan_technician_name || a.technician_name || "").split(",").map(s => s.trim()).filter(Boolean);
          if (!map[jid]) map[jid] = { names: [], seen: new Set(), hasTechId: false, earliestStart: null };
          if (ids.length) map[jid].hasTechId = true;
          // Earliest scheduled Appointment start (ISO) for the Date column.
          const start = a.scheduled_start ? new Date(a.scheduled_start) : null;
          if (start && !isNaN(start.getTime())) {
            if (!map[jid].earliestStart || start < new Date(map[jid].earliestStart)) {
              map[jid].earliestStart = a.scheduled_start;
            }
          }
          const maxLen = Math.max(ids.length, names.length);
          for (let i = 0; i < maxLen; i++) {
            const id = ids[i] || "";
            const name = names[i] || "";
            const key = id || name;
            if (!key) continue;
            if (!map[jid].seen.has(key)) { map[jid].seen.add(key); map[jid].names.push(name || id); }
          }
        }
        setAptMap(map);
      })
      .catch(() => setAptMap({}));
  };

  const load = () => base44.entities.Job.filter({ is_deleted: { $ne: true } }, '-created_date', 100).then(jobs => {
    setJobs(jobs);
    loadAppointments(jobs.map(j => j.id));
  });

  useEffect(() => {
    load();
    base44.entities.Customer.list('-name', 200).then(setCustomers);
    base44.entities.Technician.filter({ status: 'active' }).then(setTechs);
  }, []);

  const statusColor = {
    scheduled: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-amber-100 text-amber-700',
    inspection_complete: 'bg-purple-100 text-purple-700',
    estimate_sent: 'bg-indigo-100 text-indigo-700',
    approved: 'bg-green-100 text-green-700',
    invoiced: 'bg-teal-100 text-teal-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-700',
  };

  // Effective assignment for a row: one source of truth for the technician
  // column, the dispatch badge, and the Assign button so they can never
  // disagree. A Job is "assigned" when ANY of these hold:
  //   - Job-level technician name/email is present, OR
  //   - dispatch_status is assigned/dispatched/started/completed, OR
  //   - a linked Appointment carries a ServiceTitan technician ID.
  const effectiveAssignment = (r) => {
    const m = aptMap[r.id];
    const aptNames = m?.names.length ? m.names : [];
    const display = r.lead_technician_name || r.technician_name || (aptNames.length ? aptNames.join(", ") : "") || "";
    const raw = r.dispatch_status || "";
    const jobLevelTech = !!(display && (r.lead_technician_name || r.technician_name));
    const jobLevelDispatch = !!(raw && raw !== "unassigned" && raw !== "cancelled");
    const aptHasTech = !!(m?.hasTechId);
    const isAssigned = jobLevelTech || jobLevelDispatch || aptHasTech;
    const effective = jobLevelDispatch ? raw : (aptHasTech || jobLevelTech ? "assigned" : (raw || "unassigned"));
    return { display: display || "—", effective, isAssigned };
  };

  const columns = [
    { key: 'customer_number', label: '#', render: r => <span className="font-mono text-xs text-muted-foreground">{r.customer_number || '—'}</span> },
    { key: 'crm_job_number', label: 'CRM #', render: r => <span className="font-mono text-xs text-muted-foreground">{r.servicetitan_job_number || r.crm_job_number || '—'}</span> },
    { key: 'customer_name', label: 'Customer', render: r => <span className="font-medium text-blue-600 hover:underline cursor-pointer">{r.customer_name}</span> },
    { key: 'technician_name', label: 'Technician', render: r => {
      const { display } = effectiveAssignment(r);
      return <span className="text-sm">{display}</span>;
    }},
    { key: 'dispatch_status', label: 'Dispatch', render: r => {
      const { effective } = effectiveAssignment(r);
      const cls = effective === "assigned"
        ? "bg-blue-100 text-blue-700"
        : effective === "dispatched"
          ? "bg-amber-100 text-amber-700"
          : "bg-muted text-muted-foreground";
      return (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
          {effective?.replace(/_/g, " ") || "unassigned"}
        </span>
      );
    }},
    { key: 'service_date', label: 'Date', render: r => {
      const m = aptMap[r.id];
      const dateVal = m?.earliestStart || r.service_date || r.appointment_date;
      return <span className="text-sm">{fmtDate(dateVal)}</span>;
    }},
    { key: 'job_type', label: 'Type', render: r => <span className="capitalize">{r.job_type?.replace(/_/g, ' ') || '—'}</span> },
    { key: 'status', label: 'Status', render: r => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[r.status] || 'bg-muted text-muted-foreground'}`}>
        {r.status?.replace(/_/g, ' ')}
      </span>
    )},
    { key: 'actions', label: '', render: r => {
      const { isAssigned } = effectiveAssignment(r);
      return (
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {!isAssigned && (
            <Button size="sm" variant="outline" className="text-xs h-7 px-2 gap-1" onClick={() => navigate(`/admin/jobs/${r.id}`)}>
              <UserPlus className="w-3 h-3" /> Assign
            </Button>
          )}
          <Button size="sm" variant="outline" className="text-xs h-7 px-2 gap-1" onClick={() => setAptJob(r)}>
            <Calendar className="w-3 h-3" /> Appts
          </Button>
          <Button size="sm" className="text-xs h-7 px-2 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => navigate(`/tech/job-hub/${r.id}`)}>Job Hub</Button>
        </div>
      );
    }},
  ];

  const handleSave = async (data) => {
    // Set customer_name from selection
    const customer = customers.find(c => c.id === data.customer_id);

    // Resolve technician names from lead/apprentice selections
    const leadTech = techs.find(t => t.email === data.lead_technician_email);
    const apprenticeTech = techs.find(t => t.email === data.apprentice_email);
    const emails = [data.lead_technician_email, data.apprentice_email].filter(Boolean);
    const names = [leadTech?.full_name, apprenticeTech?.full_name].filter(Boolean);

    // Determine dispatch status from assignment
    const hasAssignment = !!data.lead_technician_email || !!data.apprentice_email;
    const dispatchStatus = hasAssignment ? 'assigned' : 'unassigned';

    data.customer_name = customer?.name || data.customer_name || '';
    data.customer_number = customer?.customer_number || data.customer_number || '';
    data.technician_emails = emails;
    data.technician_email = data.lead_technician_email || '';
    data.technician_name = names.join(', ');
    data.lead_technician_name = leadTech?.full_name || '';
    data.apprentice_name = apprenticeTech?.full_name || '';
    data.dispatch_status = dispatchStatus;
    if (hasAssignment && (data.status === 'scheduled' || !data.status)) {
      data.status = 'assigned';
    }

    // Resolve truck number
    if (data.assigned_truck_id) {
      try {
        const truck = await base44.entities.TruckProfile.get(data.assigned_truck_id);
        data.assigned_truck_number = truck?.truck_number || '';
      } catch { /* non-blocking */ }
    }

    let savedJob;
    if (editing) {
      savedJob = await base44.entities.Job.update(editing.id, data);
    } else {
      savedJob = await base44.entities.Job.create(data);
    }

    // Auto-create appointment if assignment fields are present and this is a new job
    if (!editing && hasAssignment) {
      try {
        const aptDate = data.appointment_date || data.service_date || moment.utc().format('YYYY-MM-DD');
        const startTime = data.arrival_window_start || '08:00';
        const endTime = data.arrival_window_end || '12:00';
        const crew = [];
        if (data.lead_technician_email) {
          crew.push({ email: data.lead_technician_email, name: leadTech?.full_name || '', role: 'lead' });
        }
        if (data.apprentice_email) {
          crew.push({ email: data.apprentice_email, name: apprenticeTech?.full_name || '', role: 'apprentice' });
        }
        await base44.entities.Appointment.create({
          job_id: savedJob.id,
          customer_id: data.customer_id || '',
          customer_name: data.customer_name || '',
          technician_email: data.lead_technician_email || '',
          technician_name: leadTech?.full_name || '',
          technician_id: leadTech?.id || '',
          apprentice_email: data.apprentice_email || '',
          apprentice_name: apprenticeTech?.full_name || '',
          assigned_vehicle: data.assigned_truck_number || '',
          crew_assignment: JSON.stringify(crew),
          scheduled_start: moment.utc(`${aptDate}T${startTime}:00`).toISOString(),
          scheduled_end: moment.utc(`${aptDate}T${endTime}:00`).toISOString(),
          status: 'assigned',
          dispatch_status: 'assigned',
          appointment_source: 'manual',
          address: data.address || '',
          city: data.city || '',
          state: data.state || '',
          zip: data.zip || '',
          day_number: 1,
          is_final_appointment: true,
        });
      } catch (e) {
        toast.warning('Job saved, but appointment creation failed: ' + e.message);
      }
    }

    toast.success(editing ? 'Job updated' : 'Job created');
    setEditing(null);
    load();
  };

 return (
  <>
    <DataTable
      title="Jobs"
      subtitle="Manage service jobs 123"
      columns={columns}
      data={jobs}
      searchFields={['customer_name', 'technician_name', 'address']}
      onAdd={() => { 
        console.log('🔵 onAdd fired, opening dialog...');
        setEditing(null); 
        setDialogOpen(true); 
      }}
      addLabel="New Job Working"
      onRowClick={(row) => navigate(`/admin/jobs/${row.id}`)}
    />
    {console.log('🟡 dialogOpen state is:', dialogOpen)}
    <JobFormDialog
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      title={editing ? 'Edit Job' : 'New Job'}
      initialData={editing || { status: 'scheduled', priority: 'normal' }}
      customers={customers}
      techs={techs}
      onSave={handleSave}
    />
    ...
  </>
);
}