import { Navigate, useLocation, Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldX } from 'lucide-react';
import { useCurrentRole } from '@/hooks/useCurrentRole';

const RESTRICTED_PATTERNS = [
  '/tasks/department',
  '/tasks/registry',
  '/tasks/board',
  '/tasks/approvals',
  '/tasks/overdue',
  '/tasks/reports',
  '/tasks/settings',
];

/**
 * Guards the Enterprise Task Center routes.
 * Technician roles can only access /tasks/my-tasks and /tasks/detail/:id.
 * Attempting to access any restricted route redirects to My Tasks.
 */
export default function TaskRouteGuard({ children }) {
  const { isTech, loading } = useCurrentRole();
  const location = useLocation();

  if (loading) return children;

  if (!isTech) return children;

  const path = location.pathname;
  const isMyTasks = path === '/tasks/my-tasks' || path.startsWith('/tasks/my-tasks');
  const isDetail = path.startsWith('/tasks/detail/');

  // Techs accessing the dashboard index (/tasks) — redirect to My Tasks
  if (path === '/tasks' || path === '/tasks/') {
    return <Navigate to="/tasks/my-tasks" replace />;
  }

  // Techs accessing any restricted pattern — 403 redirect
  const isRestricted = RESTRICTED_PATTERNS.some(p => path.startsWith(p));
  if (!isMyTasks && !isDetail && isRestricted) {
    return <AccessDenied redirect="/tasks/my-tasks" />;
  }

  return children;
}

function AccessDenied({ redirect }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <Card className="max-w-md w-full text-center border-red-200">
        <CardContent className="p-8 space-y-4">
          <ShieldX className="w-12 h-12 text-red-500 mx-auto" />
          <div>
            <h2 className="text-xl font-bold text-red-800">403 — Access Denied</h2>
            <p className="text-sm text-muted-foreground mt-2">
              You do not have permission to access this module. Enterprise task management is restricted to management roles.
            </p>
          </div>
          <Button asChild>
            <Link to={redirect}>Go to My Tasks</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}