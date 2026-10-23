import { Outlet } from 'react-router-dom';
import RuleEngineNav from './RuleEngineNav';

export default function RuleEngineLayout() {
  return (
    <div className="space-y-0">
      <RuleEngineNav />
      <div className="p-4 md:p-6">
        <Outlet />
      </div>
    </div>
  );
}