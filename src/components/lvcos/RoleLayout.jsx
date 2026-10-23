import { Outlet } from 'react-router-dom';
import RoleNav from './RoleNav';

export default function RoleLayout() {
  return (
    <div className="space-y-0">
      <RoleNav />
      <div className="p-4 md:p-6">
        <Outlet />
      </div>
    </div>
  );
}