import { Outlet } from 'react-router-dom';
import EnterpriseTaskNav from './EnterpriseTaskNav';
import TaskRouteGuard from './TaskRouteGuard';
import MobileNewTaskButton from './MobileNewTaskButton';

export default function EnterpriseTaskLayout() {
  // Real-time engine is mounted globally in AppLayout — no duplicate polling here.
  // Developer diagnostics are available at /admin/developer-diagnostics (Owner/Admin only).
  return (
    <TaskRouteGuard>
      <div className="space-y-0">
        <EnterpriseTaskNav />
        <div className="p-4 md:p-6">
          <Outlet />
        </div>
        <MobileNewTaskButton />
      </div>
    </TaskRouteGuard>
  );
}