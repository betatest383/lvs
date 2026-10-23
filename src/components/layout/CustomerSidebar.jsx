import SidebarLink from './SidebarLink';
import { LayoutDashboard, ShoppingBag, Crown, Receipt, FileText, Calculator, CalendarPlus, Briefcase } from 'lucide-react';

export default function CustomerSidebar() {
  return (
    <div className="space-y-1">
      <p className="px-6 py-2 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">Menu</p>
      <SidebarLink to="/" icon={LayoutDashboard} label="Dashboard" />
      <SidebarLink to="/customer/book" icon={CalendarPlus} label="Book a Service" />
      <SidebarLink to="/customer/jobs" icon={Briefcase} label="My Jobs" />
      <SidebarLink to="/customer/reports" icon={FileText} label="Inspection Reports" />
      <SidebarLink to="/customer/estimates" icon={Calculator} label="Estimates" />
      <SidebarLink to="/customer/invoices" icon={Receipt} label="Invoices" />
      <SidebarLink to="/customer/store" icon={ShoppingBag} label="Store" />
      <SidebarLink to="/customer/membership" icon={Crown} label="Membership" />
    </div>
  );
}