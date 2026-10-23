import { Navigate, useLocation, Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldX } from 'lucide-react';
import { useCurrentRole } from '@/hooks/useCurrentRole';

const RESTRICTED_PATTERNS = [
  '/notifications/center',
  '/notifications/rules',
  '/notifications/history',
  '/notifications/reports',
  '/notifications/settings',
];

/**
 * Guards the Notification Center routes.
 * Technician roles can only access /notifications/my and /notifications/detail/:id.
 * Attempting to access any restricted route shows a 403 Access Denied screen.
 */
export default function NotificationRouteGuard({ children }) {
  const { isTech, loading } = useCurrentRole();
  const location = useLocation();

  if (loading) return children;
  if (!isTech) return children;

  const path = location.pathname;
  const isMyNotifications = path === '/notifications/my' || path.startsWith('/notifications/my');
  const isDetail = path.startsWith('/notifications/detail/');

  // Techs accessing the dashboard index (/notifications) — redirect to My Notifications
  if (path === '/notifications' || path === '/notifications/') {
    return <Navigate to="/notifications/my" replace />;
  }

  // Techs accessing any restricted pattern — 403
  const isRestricted = RESTRICTED_PATTERNS.some(p => path.startsWith(p));
  if (!isMyNotifications && !isDetail && isRestricted) {
    return <AccessDenied />;
  }

  return children;
}

function AccessDenied() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <Card className="max-w-md w-full text-center border-red-200">
        <CardContent className="p-8 space-y-4">
          <ShieldX className="w-12 h-12 text-red-500 mx-auto" />
          <div>
            <h2 className="text-xl font-bold text-red-800">403 — Access Denied</h2>
            <p className="text-sm text-muted-foreground mt-2">
              You do not have permission to access this module. Enterprise notification management is restricted to management roles.
            </p>
          </div>
          <Button asChild>
            <Link to="/notifications/my">Return to My Notifications</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}