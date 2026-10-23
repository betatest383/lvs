import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTechnicianOperationsData } from '@/hooks/useTechnicianOperationsData';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Pencil, Users, Briefcase, CheckSquare, Bell, ShieldAlert, Award } from 'lucide-react';
import { notify } from '@/lib/notify';

const readinessVariant = {
  'Ready': 'bg-green-100 text-green-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  'Blocked': 'bg-red-100 text-red-700',
  'Not Started': 'bg-slate-100 text-slate-500',
};

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TechniciansPage() {
  const navigate = useNavigate();
  const { employees, loading } = useTechnicianOperationsData();
  const [search, setSearch] = useState('');
  const [readinessFilter, setReadinessFilter] = useState('all');

  const filtered = useMemo(() => {
    return employees.filter(e => {
      const q = search.toLowerCase();
      const matchesSearch = !q ||
        e.full_name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.role.toLowerCase().includes(q) ||
        e.assigned_truck.toLowerCase().includes(q);
      const matchesReadiness = readinessFilter === 'all' || e.morning_readiness === readinessFilter;
      return matchesSearch && matchesReadiness;
    });
  }, [employees, search, readinessFilter]);

  const stats = useMemo(() => ({
    total: employees.length,
    ready: employees.filter(e => e.morning_readiness === 'Ready').length,
    jobsToday: employees.reduce((sum, e) => sum + e.today_jobs_count, 0),
    openTasks: employees.reduce((sum, e) => sum + e.open_tasks_count, 0),
    criticalNotifs: employees.reduce((sum, e) => sum + e.critical_notifications_count, 0),
    expiringCerts: employees.reduce((sum, e) => sum + e.expiring_certs_count, 0),
  }), [employees]);

  const handleEdit = (employee) => {
    notify.info('Opening Employee Registry record...', { sourceModule: 'Operations → Technicians', duration: 2000 });
    navigate(`/lvcos/employees/detail/${employee.id}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Technicians</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Operational dashboard for active field service employees — sourced from Employee Registry
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Users} label="Active Techs" value={stats.total} accent="bg-slate-100 text-slate-600" />
        <StatCard icon={CheckSquare} label="Ready" value={stats.ready} accent="bg-green-100 text-green-600" />
        <StatCard icon={Briefcase} label="Jobs Today" value={stats.jobsToday} accent="bg-blue-100 text-blue-600" />
        <StatCard icon={CheckSquare} label="Open Tasks" value={stats.openTasks} accent="bg-amber-100 text-amber-600" />
        <StatCard icon={Bell} label="Critical Alerts" value={stats.criticalNotifs} accent="bg-red-100 text-red-600" />
        <StatCard icon={Award} label="Certs Expiring" value={stats.expiringCerts} accent="bg-orange-100 text-orange-600" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, role, or truck..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {['all', 'Ready', 'In Progress', 'Blocked', 'Not Started'].map(f => (
            <Button
              key={f}
              size="sm"
              variant={readinessFilter === f ? 'default' : 'outline'}
              onClick={() => setReadinessFilter(f)}
            >
              {f === 'all' ? 'All' : f}
            </Button>
          ))}
        </div>
      </div>

      {/* Operational table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left font-medium px-4 py-3">Employee</th>
                <th className="text-left font-medium px-4 py-3">Role</th>
                <th className="text-left font-medium px-4 py-3">Assigned Truck</th>
                <th className="text-center font-medium px-4 py-3">Today's Jobs</th>
                <th className="text-left font-medium px-4 py-3">WH-105</th>
                <th className="text-left font-medium px-4 py-3">Morning Readiness</th>
                <th className="text-center font-medium px-4 py-3">Open Tasks</th>
                <th className="text-center font-medium px-4 py-3">Critical Notifs</th>
                <th className="text-center font-medium px-4 py-3">Certs Expiring</th>
                <th className="text-right font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center text-muted-foreground py-12">
                    No field service employees found.
                  </td>
                </tr>
              ) : filtered.map(e => (
                <tr key={e.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{e.full_name}</div>
                    <div className="text-xs text-muted-foreground">{e.email}</div>
                  </td>
                  <td className="px-4 py-3">{e.role}</td>
                  <td className="px-4 py-3">
                    {e.assigned_truck !== '—' ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                        {e.assigned_truck}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="text-center px-4 py-3">
                    {e.today_jobs_count > 0 ? (
                      <span className="font-medium text-blue-600">{e.today_jobs_count}</span>
                    ) : <span className="text-muted-foreground">0</span>}
                  </td>
                  <td className="px-4 py-3">
                    {e.wh105_status ? (
                      <span className="text-xs">{e.wh105_status}</span>
                    ) : <span className="text-xs text-muted-foreground">No record</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${readinessVariant[e.morning_readiness] || readinessVariant['Not Started']}`}>
                      {e.morning_readiness}
                    </span>
                  </td>
                  <td className="text-center px-4 py-3">
                    {e.open_tasks_count > 0 ? (
                      <span className="font-medium text-amber-600">{e.open_tasks_count}</span>
                    ) : <span className="text-muted-foreground">0</span>}
                  </td>
                  <td className="text-center px-4 py-3">
                    {e.critical_notifications_count > 0 ? (
                      <span className="inline-flex items-center gap-1 font-medium text-red-600">
                        <Bell className="h-3 w-3" />{e.critical_notifications_count}
                      </span>
                    ) : <span className="text-muted-foreground">0</span>}
                  </td>
                  <td className="text-center px-4 py-3">
                    {e.expiring_certs_count > 0 ? (
                      <span className="inline-flex items-center gap-1 font-medium text-orange-600">
                        <Award className="h-3 w-3" />{e.expiring_certs_count}
                      </span>
                    ) : <span className="text-muted-foreground">0</span>}
                  </td>
                  <td className="text-right px-4 py-3">
                    <Button size="sm" variant="outline" onClick={() => handleEdit(e)} className="flex items-center gap-1 ml-auto">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        All technician data is sourced from Employee Registry. Click "Edit" to open the employee's full record.
      </p>
    </div>
  );
}