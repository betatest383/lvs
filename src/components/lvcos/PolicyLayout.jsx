import { Outlet } from 'react-router-dom';
import PolicyNav from './PolicyNav';

export default function PolicyLayout() {
  return (
    <div className="space-y-0">
      <PolicyNav />
      <div className="p-4 md:p-6">
        <Outlet />
      </div>
    </div>
  );
}