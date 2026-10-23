import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMyJobs } from '@/hooks/useMyJobs';

const dateOnly = (d) => d ? String(d).split('T')[0] : '';

async function safe(promise, fallback = []) {
  try {
    return await promise;
  } catch (e) {
    console.error('TechDashboard fetch error:', e);
    return fallback;
  }
}

export function useTechDashboardData({ employee, email, fullName, assignedTruck, role, department, employeePackageId, employeeId, servicetitanEmployeeId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Shared job resolution — same hook used by Today's Jobs page and Developer Panel
  const employeeForJobs = employee || {
    email, login_email: email,
    first_name: fullName ? fullName.split(' ')[0] : '',
    last_name: fullName ? fullName.split(' ').slice(1).join(' ') : '',
    employee_id: employeeId,
    servicetitan_employee_id: servicetitanEmployeeId,
    assigned_truck: assignedTruck,
  };
  const myJobsResult = useMyJobs(employeeForJobs);

  useEffect(() => {
    if (!email && !fullName) return;
    let cancelled = false;

    const load = async () => {
      try {
        const [assignments, trucks, consumableReqs, transferSheets, materialReturns, equipment, correctiveActions, invoices, estimates, memberships, customers, tasks, notifications] = await Promise.all([
          safe(base44.entities.VehicleAssignment.list('-created_date', 50)),
          safe(base44.entities.TruckProfile.list('-updated_date', 50)),
          safe(base44.entities.ConsumableReplenishment.list('-created_date', 50)),
          safe(base44.entities.ServiceTitanTransferSheet.list('-created_date', 50)),
          safe(base44.entities.MaterialReturn.list('-created_date', 50)),
          safe(base44.entities.TechEquipment.list('-created_date', 200)),
          safe(base44.entities.CorrectiveAction.list('-created_date', 50)),
          safe(base44.entities.Invoice.list('-created_date', 100)),
          safe(base44.entities.Estimate.list('-created_date', 100)),
          safe(base44.entities.Membership.list('-created_date', 50)),
          safe(base44.entities.Customer.list('-created_date', 200)),
          safe(base44.entities.EnterpriseTask.list('-created_date', 200)),
          safe(base44.entities.EnterpriseNotification.list('-created_date', 200)),
        ]);

        if (cancelled) return;

        const today = new Date().toLocaleDateString('en-CA');

        const myAssignments = assignments.filter(a =>
          a.assigned_to_email === email && a.status === 'Active'
        );

        // Truck resolution: EmployeeRegistry.assigned_truck is the source of truth.
        // Only fall back to active vehicle assignments if registry has no truck.
        let truckLookupField = 'truck_id OR truck_number';
        let truckMatchedBy = null;
        let myTruck = trucks.find(t => {
          if (t.truck_id === assignedTruck) { truckMatchedBy = 'truck_id'; return true; }
          if (t.truck_number === assignedTruck) { truckMatchedBy = 'truck_number'; return true; }
          return false;
        });
        let truckResolutionReason = null;
        if (!myTruck) {
          truckResolutionReason = `No TruckProfile where truck_id === "${assignedTruck}" OR truck_number === "${assignedTruck}"`;
          if (myAssignments.length > 0) {
            myTruck = trucks.find(t => {
              if (t.truck_id === myAssignments[0].truck_id) { truckMatchedBy = 'truck_id (via VehicleAssignment)'; return true; }
              if (t.truck_number === myAssignments[0].truck_number) { truckMatchedBy = 'truck_number (via VehicleAssignment)'; return true; }
              return false;
            });
            if (!myTruck) truckResolutionReason = `Fallback: No TruckProfile matching VehicleAssignment truck_id="${myAssignments[0].truck_id}" or truck_number="${myAssignments[0].truck_number}"`;
          } else {
            truckResolutionReason += ' (no active VehicleAssignments to fall back on)';
          }
        }

        const truckResolutionInfo = {
          lookup_value: assignedTruck || '(empty)',
          lookup_field: truckLookupField,
          matched_by: truckMatchedBy,
          matching_record_id: myTruck?.id || myTruck?.truck_id || null,
          total_trucks_checked: trucks.length,
          fallback_used: !truckMatchedBy?.includes('via VehicleAssignment') ? false : true,
          reason: myTruck ? null : truckResolutionReason,
        };

        const truckNumber = myTruck?.truck_number || assignedTruck || '';

        // Equipment package resolution chain:
        // Employee → assigned_truck → TruckProfile → assigned_equipment_package_id → EquipmentPackage
        const equipmentPackages = await safe(base44.entities.EquipmentPackage.list('-updated_date', 50));
        const rawPackageIdFromTruck = myTruck?.assigned_equipment_package_id || null;
        let myEquipmentPackage = null;
        let packageLookupSource = null;

        if (rawPackageIdFromTruck) {
          // Resolve via TruckProfile (single source of truth)
          myEquipmentPackage = equipmentPackages.find(p => p.id === rawPackageIdFromTruck) || null;
          if (!myEquipmentPackage) {
            // Fallback: direct fetch by ID
            try {
              myEquipmentPackage = await base44.entities.EquipmentPackage.get(rawPackageIdFromTruck);
            } catch {
              myEquipmentPackage = null;
            }
          }
          packageLookupSource = myEquipmentPackage ? 'TruckProfile.assigned_equipment_package_id' : null;
        }

        // Legacy fallback: EmployeeRegistry.assigned_equipment_package (if truck has no package)
        if (!myEquipmentPackage && employeePackageId) {
          myEquipmentPackage = equipmentPackages.find(p =>
            p.package_id === employeePackageId || p.id === employeePackageId || p.package_name === employeePackageId
          ) || null;
          if (myEquipmentPackage) {
            packageLookupSource = 'EmployeeRegistry.assigned_equipment_package (legacy)';
          }
        }

        const equipmentPackageResolutionInfo = {
          resolution_chain: 'Employee → assigned_truck → TruckProfile → assigned_equipment_package_id → EquipmentPackage',
          truck_id: myTruck?.truck_id || null,
          truck_number: myTruck?.truck_number || null,
          truck_record_id: myTruck?.id || null,
          raw_assigned_equipment_package_id: rawPackageIdFromTruck || '(empty)',
          legacy_employee_package_id: employeePackageId || '(empty)',
          resolved_package_id: myEquipmentPackage?.package_id || myEquipmentPackage?.id || null,
          resolved_package_name: myEquipmentPackage?.package_name || null,
          resolved_package_record_id: myEquipmentPackage?.id || null,
          assignment_source: packageLookupSource || null,
          assignment_timestamp: myEquipmentPackage?.assignment_timestamp || myTruck?.equipment_package_assigned_date || null,
          assigned_by: myEquipmentPackage?.assigned_by || myTruck?.equipment_package_assigned_by || null,
          lookup_status: !rawPackageIdFromTruck && !employeePackageId
            ? 'No package ID on truck or employee'
            : myEquipmentPackage
              ? 'Resolved'
              : 'Missing (package record not found)',
          total_packages_checked: equipmentPackages.length,
        };

        const customerMap = {};
        customers.forEach(c => { customerMap[c.id] = c; });

        // My tasks: strictly scoped to THIS employee only.
        // Role/department matching applies ONLY to broadcast tasks (no specific assignee).
        const normalizeRoleKey = (r) => r ? String(r).trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
        const normalizedRole = normalizeRoleKey(role);
        const totalTasksFetched = tasks.length;

        const taskMatchReason = (t) => {
          if (!t || t.status === 'Completed' || t.status === 'Cancelled') return null;
          const hasSpecificAssignee = !!(t.assigned_to_email || t.assigned_to);

          // 1. Direct assignment by email
          if (t.assigned_to_email && t.assigned_to_email === email) return 'assigned_to_email match';
          // 2. Direct assignment by name
          if (t.assigned_to && fullName && t.assigned_to === fullName) return 'assigned_to (name) match';
          // 3. Direct assignment by employee ID (assigned_to may hold EMP-ID)
          if (t.assigned_to && employeeId && t.assigned_to === employeeId) return 'assigned_to (employee_id) match';
          // 4. Related employee match
          if (t.related_employee && employeeId && t.related_employee === employeeId) return 'related_employee match';
          // 5. Related truck match
          if (t.related_truck && truckNumber && t.related_truck === truckNumber) return 'related_truck match';
          // 6. Role broadcast: assigned_role matches AND task has no specific assignee
          if (normalizedRole && t.assigned_role && !hasSpecificAssignee) {
            if (normalizeRoleKey(t.assigned_role) === normalizedRole) return 'role broadcast (no specific assignee)';
          }
          // 7. Department broadcast: assigned_department matches AND no specific assignee AND no specific role
          if (department && t.assigned_department === department && !hasSpecificAssignee && !t.assigned_role) {
            return 'department broadcast (no specific assignee or role)';
          }
          return null;
        };

        const myTasks = tasks.filter(t => taskMatchReason(t) !== null);

        const tasksResolutionInfo = {
          lookup_keys: {
            employee_id: employeeId || '(not set)',
            employee_email: email || '(empty)',
            employee_name: fullName || '(empty)',
            role: normalizedRole || '(empty)',
            department: department || '(empty)',
            truck: truckNumber || '(empty)',
          },
          query_executed: 'EnterpriseTask.list(-created_date, 200) → filter: assigned_to_email===email OR assigned_to===fullName OR assigned_to===employeeId OR related_employee===employeeId OR related_truck===truckNumber OR (assigned_role===role AND no specific assignee) OR (assigned_department===department AND no assignee AND no role)',
          total_tasks_fetched: totalTasksFetched,
          total_tasks_after_filter: myTasks.length,
          inclusion_reasons: myTasks.reduce((acc, t) => {
            const key = t.task_id || t.id;
            if (key) acc[key] = taskMatchReason(t);
            return acc;
          }, {}),
        };

        // My notifications: recipient email matches, or role/department matches
        const myNotifications = notifications.filter(n => {
          if (!n || n.is_archived) return false;
          return n.recipient_email === email ||
            (role && n.recipient_role === role) ||
            (department && n.recipient_department === department) ||
            (!n.recipient_email && !n.recipient_role && !n.recipient_department);
        });

        // WH-105 record for today
        const wh105Records = await safe(base44.entities.Wh105DepartureCheck.filter({ date: today }));
        const myWh105 = wh105Records.find(w => w.technician_email === email) || null;

        setData({
          email, fullName, truckNumber, myTruck,
          myEquipmentPackage, truckResolutionInfo, tasksResolutionInfo,
          equipmentPackageResolutionInfo,
          wh105RecordId: myWh105?.departure_id || myWh105?.id || null,
          wh105Status: myWh105?.overall_status || null,
          consumableReqs: consumableReqs.filter(r => r.technician_email === email || (truckNumber && r.truck_number === truckNumber)),
          transferSheets: transferSheets.filter(t => t.technician === fullName || (truckNumber && t.truck === truckNumber)),
          materialReturns: materialReturns.filter(r => r.technician === fullName || (truckNumber && r.truck_number === truckNumber)),
          equipment: equipment.filter(e => e.assigned_employee_email === email || e.assigned_employee === fullName || (truckNumber && e.assigned_truck === truckNumber)),
          correctiveActions: correctiveActions.filter(c => c.assigned_employee_email === email),
          invoices, estimates, memberships, customerMap, today,
          myTasks, myNotifications,
        });
      } catch (e) {
        console.error('TechDashboard load error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [email, fullName, assignedTruck, role, department, employeeId, servicetitanEmployeeId]);

  const combinedData = (!loading && !myJobsResult.loading && data) ? {
    ...data,
    todayJobs: myJobsResult.todayJobs,
    allMyJobs: myJobsResult.matchingJobs,
    jobsQueryCriteria: myJobsResult.jobsQueryCriteria,
    jobsResolutionInfo: myJobsResult.jobsResolutionInfo,
  } : null;

  return { data: combinedData, loading: loading || myJobsResult.loading };
}