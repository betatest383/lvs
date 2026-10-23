import { Outlet } from 'react-router-dom';
import OnboardingNav from './OnboardingNav';

export default function OnboardingLayout() {
  return (
    <div className="space-y-0">
      <OnboardingNav />
      <div className="p-4 md:p-6">
        <Outlet />
      </div>
    </div>
  );
}