import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, ClipboardList, ArrowLeftRight, Undo2, Sparkles, MapPin, CheckSquare, AlertCircle, PackageX, Boxes } from 'lucide-react';
import { useEmployeeContext } from '@/hooks/useEmployeeContext';
import EmployeeIdentityHeader from '@/components/shared/EmployeeIdentityHeader';
import MyTasksCard from '@/components/dashboard/MyTasksCard';
import MyNotificationsCard from '@/components/dashboard/MyNotificationsCard';
import TopReservedInventoryWidget from '@/components/inventory/TopReservedInventoryWidget';

export default function WarehouseDashboard() {
  const navigate = useNavigate();
  const {
    employee, user, isImpersonating,
    effectiveName, effectiveRole, effectiveEmployeeId,
    effectiveDepartment, effectiveTruck,
  } = useEmployeeContext();
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().split('T')[0];
      try {
        const [techs, checklists, transfers, returns, cleanups, binReqs, matReturns] = await Promise.all([
          base44.entities.Technician.list('-created_date', 200),
          base44.entities.HardwareChecklist.list('-created_date', 200),
          base44.entities.MaterialTransferSheet.list('-created_date', 200),
          base44.entities.ReturnedMaterial.list('-created_date', 200),
          base44.entities.WarehouseCleanup.list('-created_date', 200),
          base44.entities.BinDesignationRequest.list('-created_date', 200),
          base44.entities.MaterialReturn.list('-created_date', 200),
        ]);
        setStats({
          activeTechs: techs.filter(t => t.status !== 'inactive').length,
          checklistsToday: checklists.filter(c => c.date === today).length,
          checklistsPending: checklists.filter(c => c.status !== 'Completed').length,
          transfersToday: transfers.filter(t => t.date === today).length,
          returnsPending: returns.filter(r => r.status === 'Received' || r.status === 'Needs Correction').length,
          cleanupToday: cleanups.find(c => c.date === today),
          binReqsPending: binReqs.filter(b => b.status === 'Pending').length,
          matReturnsWaiting: matReturns.filter(r => r.status === 'Returned').length,
        });
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const cards = [
    { label: 'Active Technicians', value: stats.activeTechs ?? '—', icon: Users, to: '/warehouse/technicians', color: 'text-blue-600 bg-blue-50' },
    { label: 'Checklists Today', value: stats.checklistsToday ?? '—', sub: `${stats.checklistsPending} pending`, icon: ClipboardList, to: '/warehouse/hardware-checklists', color: 'text-amber-600 bg-amber-50' },
    { label: 'Transfer Sheets Today', value: stats.transfersToday ?? '—', icon: ArrowLeftRight, to: '/warehouse/transfer-sheets', color: 'text-indigo-600 bg-indigo-50' },
    { label: 'Returns Pending', value: stats.returnsPending ?? '—', icon: Undo2, to: '/warehouse/returned-materials', color: 'text-purple-600 bg-purple-50' },
    { label: 'Cleanup Status', value: stats.cleanupToday?.status === 'Complete' ? 'Done' : stats.cleanupToday ? 'Incomplete' : 'Not Started', icon: Sparkles, to: '/warehouse/cleanup', color: stats.cleanupToday?.status === 'Complete' ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50' },
    { label: 'Bin Requests Pending', value: stats.binReqsPending ?? '—', icon: MapPin, to: '/warehouse/bin-requests', color: 'text-orange-600 bg-orange-50' },
    { label: 'Material Returns', value: stats.matReturnsWaiting ?? '—', sub: 'waiting verification', icon: PackageX, to: '/warehouse/material-returns', color: 'text-teal-600 bg-teal-50' },
  ];

  return (
    <div className="space-y-6">
      <EmployeeIdentityHeader
        employee={employee}
        user={user}
        isImpersonating={isImpersonating}
        effectiveName={effectiveName}
        effectiveRole={effectiveRole}
        effectiveEmployeeId={effectiveEmployeeId}
        effectiveDepartment={effectiveDepartment}
        effectiveTruck={effectiveTruck}
        equipmentPackage={employee?.assigned_equipment_package}
        lastLogin={employee?.last_login}
        accountStatus={employee?.account_status}
        truckLink="/fleet/trucks"
        equipmentLink="/equipment"
        onOpenProfile={() => navigate('/profile')}
      />

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Warehouse Operations</h1>
          <p className="text-muted-foreground text-sm">
            Morning dashboard — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to="/warehouse/setup-dashboard">
            <Button variant="outline" size="sm"><ClipboardList className="w-4 h-4 mr-1.5" />Setup Sessions</Button>
          </Link>
          <Link to="/warehouse/setup">
            <Button size="sm"><Sparkles className="w-4 h-4 mr-1.5" />Setup Wizard</Button>
          </Link>
        </div>
      </div>

      <Card className="border-accent/30 bg-accent/5">
        <CardContent className="p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-accent flex-shrink-0" />
          <p className="text-sm font-medium">
            Morning technician departures are the warehouse priority. Ensure all hardware checklists are pulled before dispatch.
          </p>
        </CardContent>
      </Card>

      <Link to="/warehouse/night-before-prep">
        <Card className="border-2 border-indigo-300 bg-indigo-50/50 hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Boxes className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="font-semibold text-indigo-900">Night Before Preparation</p>
                <p className="text-xs text-muted-foreground">Prepare tomorrow's transfers, consumables, equipment, and staging before technicians arrive</p>
              </div>
            </div>
            <ClipboardList className="w-5 h-5 text-indigo-400" />
          </CardContent>
        </Card>
      </Link>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {cards.map((card, i) => (
            <Link key={i} to={card.to}>
              <Card className="border shadow-sm hover:shadow-md transition-shadow h-full">
                <CardContent className="p-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${card.color}`}>
                    <card.icon className="w-5 h-5" />
                  </div>
                  <p className="text-2xl font-bold">{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  {card.sub && <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Link to="/warehouse/hardware-checklists">
            <Button variant="outline" className="w-full justify-start"><ClipboardList className="w-4 h-4 mr-2" /> New Checklist</Button>
          </Link>
          <Link to="/warehouse/transfer-sheets">
            <Button variant="outline" className="w-full justify-start"><ArrowLeftRight className="w-4 h-4 mr-2" /> New Transfer Sheet</Button>
          </Link>
          <Link to="/warehouse/material-returns/new">
            <Button variant="outline" className="w-full justify-start"><PackageX className="w-4 h-4 mr-2" /> New Material Return</Button>
          </Link>
          <Link to="/warehouse/returned-materials">
            <Button variant="outline" className="w-full justify-start"><Undo2 className="w-4 h-4 mr-2" /> Log Return</Button>
          </Link>
          <Link to="/warehouse/cleanup">
            <Button variant="outline" className="w-full justify-start"><Sparkles className="w-4 h-4 mr-2" /> Cleanup Checklist</Button>
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <MyTasksCard />
        <MyNotificationsCard />
      </div>

      <TopReservedInventoryWidget />

      <Link to="/warehouse/manager-review">
        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <CheckSquare className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Manager Review Dashboard</p>
                <p className="text-xs text-muted-foreground">Review all pending warehouse items</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}