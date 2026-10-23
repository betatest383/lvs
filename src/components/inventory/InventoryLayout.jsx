import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, ArrowDownToLine, ArrowUpFromLine, Repeat, ClipboardCheck, History, Package, Layers, Wrench, Truck, ShieldCheck, BarChart3, Boxes, Warehouse, Grid3x3, Building2, Factory, Tags, RotateCcw } from 'lucide-react';

const navItems = [
  { to: '/inventory', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/inventory/master', label: 'All Inventory', icon: Boxes },
  { to: '/inventory/master/consumables', label: 'Consumables', icon: Package },
  { to: '/inventory/master/materials', label: 'Materials', icon: Layers },
  { to: '/inventory/master/equipment', label: 'Equipment', icon: Wrench },
  { to: '/inventory/master/tools', label: 'Tools', icon: Wrench },
  { to: '/inventory/master/fleet-parts', label: 'Fleet Parts', icon: Truck },
  { to: '/inventory/master/safety', label: 'Safety Supply', icon: ShieldCheck },
  { to: '/inventory/master-data', label: 'Master Data', icon: Grid3x3 },
  { to: '/inventory/warehouses', label: 'Warehouses', icon: Warehouse },
  { to: '/inventory/bins', label: 'Bin Locations', icon: Grid3x3 },
  { to: '/inventory/categories', label: 'Categories', icon: Tags },
  { to: '/inventory/vendors', label: 'Vendors', icon: Building2 },
  { to: '/inventory/manufacturers', label: 'Manufacturers', icon: Factory },
  { to: '/inventory/reports', label: 'Reports', icon: BarChart3 },
  { to: '/inventory/receive', label: 'Receive', icon: ArrowDownToLine },
  { to: '/inventory/issue', label: 'Issue', icon: ArrowUpFromLine },
  { to: '/inventory/return', label: 'Return', icon: ArrowDownToLine },
  { to: '/inventory/transfer', label: 'Transfer', icon: Repeat },
  { to: '/inventory/count', label: 'Physical Count', icon: ClipboardCheck },
  { to: '/inventory/transactions', label: 'Transaction History', icon: History },
  { to: '/inventory/replay', label: 'Replay State', icon: RotateCcw }
];

export default function InventoryLayout() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Inventory Transaction Engine</h1>
        <p className="text-sm text-muted-foreground">All inventory changes through transaction-based ledger entries</p>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b pb-px">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`
            }
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}