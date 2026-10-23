import SidebarLink from './SidebarLink';
import { useTaskBadge } from '@/hooks/useTaskBadge';
import { LayoutDashboard, Calendar, Sunrise, CheckSquare, Bell, Truck, Wrench, FileText, GraduationCap, MessageSquare, Settings, Award, ClipboardCheck, Lightbulb, Home } from 'lucide-react';

export default function TechSidebar() {
  const badgeCount = useTaskBadge();
  return (
    <div className="space-y-1">
      <p className="px-6 py-2 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">Menu</p>
      <SidebarLink to="/" icon={Home} label="Job Hub" />
      <SidebarLink to="/tech/dashboard" icon={Calendar} label="Today's Jobs" />
      <SidebarLink to="/tech/readiness" icon={Sunrise} label="Morning Readiness" />
      <SidebarLink to="/tech/weekly-inspection" icon={ClipboardCheck} label="Weekly Inspection" />
      <SidebarLink to="/tasks/my-tasks" icon={CheckSquare} label="My Tasks" badge={badgeCount} />
      <SidebarLink to="/notifications/my" icon={Bell} label="My Notifications" />
      <SidebarLink to="/tech/truck" icon={Truck} label="My Truck" />
      <SidebarLink to="/tech/equipment" icon={Wrench} label="My Equipment" />
      <SidebarLink to="/forms" icon={FileText} label="Forms" />
      <SidebarLink to="/tech/training" icon={GraduationCap} label="Training" />
      <SidebarLink to="/tech/certifications" icon={Award} label="Certifications" />
      <SidebarLink to="/tech/messages" icon={MessageSquare} label="Messages" />

      <p className="px-6 py-2 mt-4 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">More</p>
      <SidebarLink to="/ci/submit" icon={Lightbulb} label="Submit Improvement Idea" />

      <SidebarLink to="/profile" icon={Settings} label="Settings" />
    </div>
  );
}