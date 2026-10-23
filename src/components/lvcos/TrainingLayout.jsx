import { Outlet } from 'react-router-dom';
import TrainingNav from './TrainingNav';

export default function TrainingLayout() {
  return (
    <div className="space-y-0">
      <TrainingNav />
      <div className="p-4 md:p-6">
        <Outlet />
      </div>
    </div>
  );
}