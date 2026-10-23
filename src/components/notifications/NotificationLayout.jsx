import { Outlet } from 'react-router-dom';
import NotificationNav from './NotificationNav';
import NotificationRouteGuard from './NotificationRouteGuard';

export default function NotificationLayout() {
  return (
    <NotificationRouteGuard>
      <div className="space-y-6">
        <NotificationNav />
        <Outlet />
      </div>
    </NotificationRouteGuard>
  );
}