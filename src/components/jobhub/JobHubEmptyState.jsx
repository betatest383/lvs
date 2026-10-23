import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Home, Package, Wrench, ClipboardList,
  Warehouse, ArrowLeft, ChevronDown, Bug,
} from 'lucide-react';
import { useDeveloperMode } from '@/hooks/useDeveloperMode';
import { useAuth } from '@/lib/AuthContext';

const NO_JOB_ACTIONS = [
  { label: 'Morning Workflow', path: '/tech/readiness', icon: Home, description: 'Truck readiness and morning checklist' },
  { label: 'Return Materials', path: '/warehouse/material-returns', icon: Package, description: 'Process returned materials' },
  { label: 'Return Equipment', path: '/inventory/return', icon: Wrench, description: 'Return equipment to warehouse' },
  { label: 'Submit Consumable Request', path: '/consumables/new', icon: ClipboardList, description: 'Request consumables from warehouse' },
  { label: 'Warehouse Tasks', path: '/tasks/my-tasks', icon: Warehouse, description: 'View your assigned warehouse tasks' },
];

/**
 * JobHubEmptyState — safe fallback UI for Job Hub when no job can be loaded.
 *
 * Props:
 *   mode: 'no_jobs' | 'error' | 'missing_job_link'
 *   diagnostics: { routeJobId, resolvedJobId, appointmentId, appointmentJob, appointmentJobId, error }
 */
export default function JobHubEmptyState({ mode, diagnostics = {} }) {
  const { isDevToolsVisible } = useDeveloperMode();
  const { user } = useAuth();
  const [showDiag, setShowDiag] = useState(false);

  if (mode === 'no_jobs') {
    return (
      <div className="max-w-2xl mx-auto py-8 space-y-6">
        <Card className="border-0 shadow-sm bg-blue-50/40">
          <CardContent className="p-8 text-center space-y-2">
            <Home className="w-12 h-12 text-blue-500 mx-auto" />
            <h2 className="text-xl font-bold">No assigned jobs for today</h2>
            <p className="text-sm text-muted-foreground">
              You have no jobs scheduled for today. Use this time to complete warehouse tasks, return materials, or prepare for tomorrow.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Available Actions</h3>
          {NO_JOB_ACTIONS.map(action => {
            const Icon = action.icon;
            return (
              <Link key={action.path} to={action.path}>
                <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{action.label}</p>
                      <p className="text-xs text-muted-foreground">{action.description}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        <div className="flex justify-center">
          <Link to="/tech/dashboard">
            <Button variant="outline" className="gap-1"><ArrowLeft className="w-4 h-4" /> Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  // mode === 'error' or 'missing_job_link'
  const isMissingLink = mode === 'missing_job_link';
  const title = isMissingLink
    ? 'Appointment is missing a linked job.'
    : 'Job Hub could not find a linked job for this appointment.';
  const message = isMissingLink
    ? 'This appointment does not have a linked job record. Contact the office to resolve this.'
    : 'The job ID in the URL is invalid or the job record no longer exists.';

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-4">
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-6 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-8 h-8 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-red-900">{title}</h2>
              <p className="text-sm text-red-700">{message}</p>
              {diagnostics.error && (
                <p className="text-xs text-red-600 font-mono mt-1">{diagnostics.error}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link to="/tech/dashboard">
              <Button variant="outline" className="gap-1"><ArrowLeft className="w-4 h-4" /> Back to Dashboard</Button>
            </Link>
            <Link to="/tech/job-hub">
              <Button variant="outline" className="gap-1"><Home className="w-4 h-4" /> Daily Job Hub</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {isDevToolsVisible && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4">
            <button
              className="flex items-center gap-1 text-xs font-semibold text-amber-700 w-full"
              onClick={() => setShowDiag(!showDiag)}
            >
              {showDiag ? <ChevronDown className="w-3.5 h-3.5 rotate-180" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <Bug className="w-3.5 h-3.5" /> Admin Diagnostics
            </button>
            {showDiag && (
              <div className="mt-3 space-y-1 text-xs font-mono">
                <div><span className="text-muted-foreground font-semibold">route_job_id:</span> {diagnostics.routeJobId || '(none)'}</div>
                <div><span className="text-muted-foreground font-semibold">resolved_job_id:</span> {diagnostics.resolvedJobId || '(none)'}</div>
                <div><span className="text-muted-foreground font-semibold">selected_appointment_id:</span> {diagnostics.appointmentId || '(none)'}</div>
                <div><span className="text-muted-foreground font-semibold">appointment_job:</span> {diagnostics.appointmentJob || '(none)'}</div>
                <div><span className="text-muted-foreground font-semibold">appointment_job_id:</span> {diagnostics.appointmentJobId || '(none)'}</div>
                <div><span className="text-muted-foreground font-semibold">current_user:</span> {user?.email || user?.full_name || '(unknown)'}</div>
                <div><span className="text-muted-foreground font-semibold">current_role:</span> {user?.role || '(unknown)'}</div>
                <div><span className="text-muted-foreground font-semibold">error:</span> {diagnostics.error || '(none)'}</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}