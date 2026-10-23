import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Briefcase, ClipboardCheck, Calculator, Receipt, Users, Wrench, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

function StatCard({ icon: Icon, label, value, color, to }) {
  return (
    <Link to={to}>
      <Card className="hover:shadow-lg transition-all duration-200 cursor-pointer border-0 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
              <p className="text-2xl font-bold mt-1">{value}</p>
            </div>
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState({ jobs: 0, inspections: 0, estimates: 0, invoices: 0, customers: 0, techs: 0 });
  const [recentJobs, setRecentJobs] = useState([]);

  useEffect(() => {
    Promise.all([
      base44.entities.Job.list('-created_date', 50),
      base44.entities.InspectionSubmission.list('-created_date', 10),
      base44.entities.Estimate.list('-created_date', 10),
      base44.entities.Invoice.list('-created_date', 10),
      base44.entities.Customer.list('-created_date', 50),
      base44.entities.User.filter({ role: 'technician' }),
    ]).then(([jobs, inspections, estimates, invoices, customers, techs]) => {
      setStats({
        jobs: jobs.length,
        inspections: inspections.length,
        estimates: estimates.length,
        invoices: invoices.length,
        customers: customers.length,
        techs: techs.length,
      });
      setRecentJobs(jobs.slice(0, 8));
    });
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your chimney service operations</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard icon={Briefcase} label="Jobs" value={stats.jobs} color="bg-blue-100 text-blue-600" to="/admin/jobs" />
        <StatCard icon={ClipboardCheck} label="Inspections" value={stats.inspections} color="bg-purple-100 text-purple-600" to="/admin/inspections" />
        <StatCard icon={Calculator} label="Estimates" value={stats.estimates} color="bg-amber-100 text-amber-600" to="/admin/estimates" />
        <StatCard icon={Receipt} label="Invoices" value={stats.invoices} color="bg-green-100 text-green-600" to="/admin/invoices" />
        <StatCard icon={Users} label="Customers" value={stats.customers} color="bg-pink-100 text-pink-600" to="/admin/customers" />
        <StatCard icon={Wrench} label="Technicians" value={stats.techs} color="bg-indigo-100 text-indigo-600" to="/admin/technicians" />
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Jobs</h2>
          {recentJobs.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No jobs yet. Create your first job to get started.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 text-xs font-semibold text-muted-foreground uppercase">Customer</th>
                    <th className="text-left py-3 px-2 text-xs font-semibold text-muted-foreground uppercase">Technician</th>
                    <th className="text-left py-3 px-2 text-xs font-semibold text-muted-foreground uppercase">Date</th>
                    <th className="text-left py-3 px-2 text-xs font-semibold text-muted-foreground uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.map(job => (
                    <tr key={job.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-2 font-medium">{job.customer_name}</td>
                      <td className="py-3 px-2 text-muted-foreground">{job.technician_name || '—'}</td>
                      <td className="py-3 px-2 text-muted-foreground">{job.service_date}</td>
                      <td className="py-3 px-2">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor[job.status] || 'bg-muted text-muted-foreground'}`}>
                          {job.status?.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}