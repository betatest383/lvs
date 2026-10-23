import { Outlet } from 'react-router-dom';
import CertificationNav from './CertificationNav';

export default function CertificationLayout() {
  return (
    <div className="space-y-0">
      <CertificationNav />
      <div className="p-4 md:p-6">
        <Outlet />
      </div>
    </div>
  );
}