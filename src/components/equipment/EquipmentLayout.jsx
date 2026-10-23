import { Outlet } from 'react-router-dom';
import EquipmentNav from './EquipmentNav';

export default function EquipmentLayout() {
  return (
    <div className="space-y-0">
      <EquipmentNav />
      <div className="p-4 md:p-6">
        <Outlet />
      </div>
    </div>
  );
}