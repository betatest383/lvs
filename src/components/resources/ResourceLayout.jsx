import { Outlet } from 'react-router-dom';
import ResourceNav from './ResourceNav';

export default function ResourceLayout() {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-card px-6 py-4">
        <h1 className="text-xl font-semibold">Product Resources</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manufacturer manuals, brochures, parts diagrams, and technical resources
        </p>
      </div>
      <ResourceNav />
      <div className="flex-1 overflow-auto p-6">
        <Outlet />
      </div>
    </div>
  );
}