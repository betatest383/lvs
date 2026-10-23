import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import {
  Loader2, CalendarCheck, Truck, ClipboardList, PackageCheck,
  CheckCircle2, Circle, Boxes,
} from 'lucide-react';
import NightBeforePrepCard from '@/components/warehouse/NightBeforePrepCard';
import { useEmployeeContext } from '@/hooks/useEmployeeContext';
import EmployeeIdentityHeader from '@/components/shared/EmployeeIdentityHeader';
import { useCurrentRole } from '@/hooks/useCurrentRole';
import moment from 'moment';

export default function NightBeforePrepPage() {
  const { employee, user, isImpersonating, effectiveName, effectiveRole, effectiveEmployeeId, effectiveDepartment, effectiveTruck } = useEmployeeContext();
  const { role } = useCurrentRole();
  const canSignOff = ['admin', 'operations_manager', 'director_of_operations', 'warehouse_manager', 'warehouse_associate'].includes(role);

  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  const [loading, setLoading] = useState(true);
  const [tomorrowJobs, setTomorrowJobs] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [consumableReqs, setConsumableReqs] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [prepRecords, setPrepRecords] = useState([]);
  const [selectedTruck, setSelectedTruck] = useState(null);

  const dateOnly = (d) => d ? String(d).split('T')[0] : '';

  useEffect(() => {
    const load = async () => {
      try {
        const [jobs, truckList, empList, transferList, consumableList, equipList, prepList] = await Promise.all([
          base44.entities.Job.filter({ service_date: tomorrow }),
          base44.entities.TruckProfile.list('-created_date', 200),
          base44.entities.EmployeeRegistry.list('-created_date', 200),
          base44.entities.MaterialTransferSheet.list('-created_date', 200),
          base44.entities.ConsumableReplenishment.list('-created_date', 200),
          base44.entities.TechEquipment.list('-created_date', 200),
          base44.entities.NightBeforePrep.filter({ prep_date: today }),
        ]);
        setTomorrowJobs(jobs);
        setTrucks(truckList);
        setEmployees(empList);
        setTransfers(transferList.filter(t => t.date === tomorrow || dateOnly(t.created_date) === today));
        setConsumableReqs(consumableList.filter(r => dateOnly(r.submitted_time || r.created_date) === today));
        setEquipment(equipList);
        setPrepRecords(prepList);
      } catch (e) {
        console.error('Night Before Prep page load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tomorrow, today]);

  const trucksNeedingPrep = useMemo(() => {
    const emailToTruck = new Map();
    employees.forEach(emp => {
      const truckNum = emp.assigned_truck || '';
      const email = (emp.email || '').toLowerCase();
      if (email && truckNum) emailToTruck.set(email, truckNum);
    });

    const truckMap = new Map();
    tomorrowJobs.forEach(job => {
      const email = (job.technician_email || '').toLowerCase();
      const tn = emailToTruck.get(email) || job.truck_number || '';
      const key = tn || email || job.technician_name || 'unassigned';
      if (!truckMap.has(key)) {
        const truckProfile = tn ? trucks.find(t => t.truck_number === tn || t.truck_id === tn || t.vehicle_name === tn) : null;
        const prepRecord = prepRecords.find(p => p.truck_number === key);
        truckMap.set(key, {
          truckNumber: key,
          truckProfile,
          technician: job.technician_name || job.technician_email || 'Unassigned',
          techEmail: job.technician_email || '',
          jobs: [],
          prepRecord,
        });
      }
      truckMap.get(key).jobs.push(job);
    });
    return Array.from(truckMap.values());
  }, [tomorrowJobs, trucks, employees, prepRecords]);

  const stats = useMemo(() => ({
    total: trucksNeedingPrep.length,
    complete: trucksNeedingPrep.filter(t => t.prepRecord?.signed_off).length,
    staged: trucksNeedingPrep.filter(t => t.prepRecord?.staged).length,
    inProgress: trucksNeedingPrep.filter(t => t.prepRecord && !t.prepRecord.signed_off).length,
  }), [trucksNeedingPrep]);

  const selectedTruckData = selectedTruck ? trucksNeedingPrep.find(t => t.truckNumber === selectedTruck) : null;
  const selectedTruckJobs = selectedTruckData?.jobs || [];
  const selectedTransfers = transfers.filter(t => {
    const tn = t.truck_number;
    return tn === selectedTruck;
  });
  const selectedEquipment = equipment.filter(e => e.assigned_truck === selectedTruck || e.assigned_truck_number === selectedTruck);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <EmployeeIdentityHeader
        employee={employee} user={user} isImpersonating={isImpersonating}
        effectiveName={effectiveName} effectiveRole={effectiveRole}
        effectiveEmployeeId={effectiveEmployeeId} effectiveDepartment={effectiveDepartment}
        effectiveTruck={effectiveTruck}
        equipmentPackage={employee?.assigned_equipment_package}
        lastLogin={employee?.last_login} accountStatus={employee?.account_status}
        truckLink="/fleet/trucks" equipmentLink="/equipment"
        onOpenProfile={() => {}}
      />

      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Boxes className="w-6 h-6 text-indigo-500" />
          Night Before Preparation
        </h1>
        <p className="text-muted-foreground text-sm">
          Preparing for {moment(tomorrow).format('dddd, MMMM D')} — warehouse preparation for tomorrow's dispatch.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Trucks Needing Prep" value={stats.total} icon={Truck} color="text-indigo-600 bg-indigo-50" />
        <StatCard label="In Progress" value={stats.inProgress} icon={ClipboardList} color="text-amber-600 bg-amber-50" />
        <StatCard label="Staged" value={stats.staged} icon={PackageCheck} color="text-blue-600 bg-blue-50" />
        <StatCard label="Complete" value={stats.complete} icon={CheckCircle2} color="text-green-600 bg-green-50" />
      </div>

      {trucksNeedingPrep.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            <CalendarCheck className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
            No jobs scheduled for tomorrow. Nothing to prepare.
          </CardContent>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Trucks</h2>
            {trucksNeedingPrep.map(truckData => {
              const isSelected = selectedTruck === truckData.truckNumber;
              const prep = truckData.prepRecord;
              return (
                <button
                  key={truckData.truckNumber}
                  onClick={() => setSelectedTruck(truckData.truckNumber)}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                    isSelected ? 'border-indigo-400 bg-indigo-50' : 'border-border bg-card hover:border-indigo-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {prep?.signed_off
                        ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                        : prep ? <Loader2 className="w-4 h-4 text-amber-500 flex-shrink-0" /> : <Circle className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">Truck {truckData.truckNumber}</p>
                        <p className="text-xs text-muted-foreground truncate">{truckData.technician}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-medium">{truckData.jobs.length} job{truckData.jobs.length !== 1 ? 's' : ''}</p>
                      {prep && (
                        <p className={`text-xs ${prep.signed_off ? 'text-green-600' : 'text-amber-600'}`}>
                          {prep.readiness_percentage || 0}%
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-2">
            {selectedTruckData ? (
              <NightBeforePrepCard
                prepDate={today}
                serviceDate={tomorrow}
                truck={selectedTruckData.truckProfile}
                truckNumber={selectedTruckData.truckNumber}
                techEmail={selectedTruckData.techEmail}
                techName={selectedTruckData.technician}
                jobNumber={selectedTruckJobs[0]?.id || ''}
                customerName={selectedTruckJobs[0]?.customer_name || ''}
                data={{
                  tomorrowJobs: selectedTruckJobs,
                  trucks,
                  transferSheets: selectedTransfers,
                  consumableReqs,
                  equipment: selectedEquipment,
                }}
                warehouseManagerName={effectiveName}
                canSignOff={canSignOff}
              />
            ) : (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  Select a truck to begin preparation.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="p-4">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}