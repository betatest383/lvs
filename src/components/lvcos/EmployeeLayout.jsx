import { Outlet } from 'react-router-dom';
import EmployeeNav from './EmployeeNav';

export default function EmployeeLayout() {
  return (
    <div className="space-y-0">
      <EmployeeNav />
      <div className="p-4 md:p-6">
        <Outlet />
      </div>
    </div>
  );
}