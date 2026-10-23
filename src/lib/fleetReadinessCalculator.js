/**
 * Fleet Readiness Calculator
 * Computes all dispatch readiness metrics from raw entity data.
 */

const TODAY = new Date().toLocaleDateString('en-CA');

const SAFETY_KEYWORDS = ['fire extinguisher', 'extinguisher', 'first aid', 'first-aid', 'safety', 'hard hat', 'harness', 'respirator', 'goggles'];
const FIRE_EXTINGUISHER_KEYWORDS = ['fire extinguisher', 'extinguisher'];
const FIRST_AID_KEYWORDS = ['first aid', 'first-aid', 'firstaid'];

function matchesAny(text, keywords) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return keywords.some(function(k) { return lower.indexOf(k) >= 0; });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  var target = new Date(dateStr + 'T00:00:00');
  var today = new Date(TODAY + 'T00:00:00');
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

function addDaysStr(dateStr, days) {
  if (!dateStr) return null;
  var d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA');
}

function safeGet(obj, prop) {
  return obj && obj[prop] ? obj[prop] : null;
}

export function computeFleetReadiness(data) {
  var trucks = data.trucks || [];
  var wh105 = data.wh105 || [];
  var equipment = data.equipment || [];
  var transfers = data.transfers || [];
  var consumables = data.consumables || [];
  var returns = data.returns || [];
  var jobs = data.jobs || [];
  var todayStr = data.todayStr || TODAY;

  var truckData = trucks.map(function(truck) {
    var truckEq = equipment.filter(function(e) {
      return e.assigned_truck_number === truck.truck_number ||
             e.assigned_truck === truck.id ||
             e.assigned_truck === truck.truck_id;
    });
    var truckWh105 = wh105.filter(function(w) { return w.truck_number === truck.truck_number; })
      .sort(function(a, b) { return new Date(b.created_date) - new Date(a.created_date); });
    var latestWh105 = truckWh105[0] || null;
    var todayWh105 = truckWh105.find(function(w) { return w.date === todayStr; }) || null;

    var truckWeekly = (data.weeklyInspections || []).filter(function(w) { return w.truck_number === truck.truck_number; })
      .sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    var latestWeekly = truckWeekly[0] || null;

    var dailySafetyWh105 = truckWh105.find(function(w) { return w.truck_inspection_status === 'complete' || w.truck_inspection_status === 'manager_override'; }) || null;
    var lastDailySafetyCheck = dailySafetyWh105 ? dailySafetyWh105.date : null;
    var lastWeeklyInspection = latestWeekly && latestWeekly.completed ? latestWeekly.date : (latestWeekly ? latestWeekly.date : null);
    var truckTransfers = transfers.filter(function(t) { return t.truck_number === truck.truck_number; });
    var truckConsumables = consumables.filter(function(c) { return c.truck_number === truck.truck_number; });
    var truckReturns = returns.filter(function(r) { return r.truck_number === truck.truck_number; });

    var isShared = truck.vehicle_type === 'Shared Vehicle';
    var assignedTech = truck.assigned_lead_technician;
    var hasEquipment = truckEq.length > 0;
    var hasPackage = truckEq.some(function(e) { return !!e.equipment_package_id; });
    var openDefects = truckWh105.filter(function(w) { return w.issue_reported; });
    var outstandingReturns = truckReturns.filter(function(r) {
      return r.status !== 'Closed' && r.status !== 'Verified' && !r.manager_override_applied;
    });

    var blockingReasons = [];
    var warningReasons = [];

    if (truck.status === 'Out of Service') blockingReasons.push('Out of Service');
    if (truck.status === 'Maintenance') blockingReasons.push('In Maintenance');
    if (!isShared && !assignedTech) blockingReasons.push('No technician assigned');
    if (latestWh105 && latestWh105.overall_status === 'blocked') blockingReasons.push('WH-105 departure blocked');
    if (latestWh105 && latestWh105.issue_reported && latestWh105.blocking_issues_status === 'blocked')
      blockingReasons.push('Critical defect reported');
    if (!hasEquipment && !isShared) blockingReasons.push('Missing required equipment');

    var inspDays = daysUntil(truck.next_inspection_date);
    if (inspDays !== null && inspDays < 0) {
      blockingReasons.push('Inspection overdue by ' + Math.abs(inspDays) + ' day(s)');
    }

    var weeklyDays = daysUntil(lastWeeklyInspection ? addDaysStr(lastWeeklyInspection, 7) : null);
    var weeklyOverdue = !latestWeekly || !latestWeekly.completed || (weeklyDays !== null && weeklyDays < 0);
    if (weeklyOverdue) {
      warningReasons.push('Weekly inspection overdue');
    }

    if (latestWh105 && ['ready', 'departed', 'blocked'].indexOf(latestWh105.overall_status) === -1) {
      warningReasons.push('WH-105 departure in progress');
    }
    if (!todayWh105) warningReasons.push('No WH-105 departure check today');

    var pendingTransfers = truckTransfers.filter(function(t) {
      return ['Issued', 'Closed', 'Completed', 'Picked Up'].indexOf(t.status) === -1;
    });
    if (pendingTransfers.length > 0)
      warningReasons.push(pendingTransfers.length + ' material transfer(s) not loaded');

    var pendingConsumables = truckConsumables.filter(function(c) { return c.status !== 'Completed'; });
    if (pendingConsumables.length > 0)
      warningReasons.push(pendingConsumables.length + ' consumable request(s) pending');

    if (outstandingReturns.length > 0)
      warningReasons.push(outstandingReturns.length + ' outstanding return(s)');

    if (inspDays !== null && inspDays >= 0 && inspDays <= 7)
      warningReasons.push('Inspection due in ' + inspDays + ' day(s)');

    if (hasEquipment && !hasPackage && !isShared)
      warningReasons.push('No equipment package assigned');

    var eqTexts = truckEq.map(function(e) {
      return (e.item_name || '') + ' ' + (e.category || '') + ' ' + (e.description || '');
    });
    var hasSafety = eqTexts.some(function(n) { return matchesAny(n, SAFETY_KEYWORDS); });
    var hasFireExt = eqTexts.some(function(n) { return matchesAny(n, FIRE_EXTINGUISHER_KEYWORDS); });
    var hasFirstAid = eqTexts.some(function(n) { return matchesAny(n, FIRST_AID_KEYWORDS); });
    if (!hasSafety && !isShared) warningReasons.push('Missing safety equipment');
    if (!hasFireExt && !isShared) warningReasons.push('Missing fire extinguisher');
    if (!hasFirstAid && !isShared) warningReasons.push('Missing first aid kit');

    var dispatchStatus;
    if (blockingReasons.length > 0) dispatchStatus = 'blocked';
    else if (warningReasons.length > 0) dispatchStatus = 'warning';
    else dispatchStatus = 'ready';

    var checks = [
      { label: 'Inspections Complete', ok: !blockingReasons.some(function(r) { return r.indexOf('Inspection overdue') >= 0 || r.indexOf('WH-105 departure blocked') >= 0; }) },
      { label: 'No Critical Defects', ok: blockingReasons.indexOf('Critical defect reported') === -1 },
      { label: 'Required Equipment Present', ok: hasEquipment || isShared },
      { label: 'Required Consumables Loaded', ok: pendingConsumables.length === 0 },
      { label: 'Material Transfers Loaded', ok: pendingTransfers.length === 0 },
      { label: 'Technician Assigned', ok: !!assignedTech || isShared },
      { label: 'Not Out of Service', ok: truck.status !== 'Out of Service' && truck.status !== 'Maintenance' },
      { label: 'No Outstanding Returns', ok: outstandingReturns.length === 0 },
    ];

    var passedChecks = checks.filter(function(c) { return c.ok; }).length;
    var score = Math.round((passedChecks / checks.length) * 100);

    return {
      truck: truck,
      dispatchStatus: dispatchStatus,
      score: score,
      blockingReasons: blockingReasons,
      warningReasons: warningReasons,
      checks: checks,
      equipment: truckEq,
      latestWh105: latestWh105,
      todayWh105: todayWh105,
      openDefects: openDefects,
      outstandingReturns: outstandingReturns,
      lastInspection: truck.last_inspection_date || (latestWh105 ? latestWh105.date : null),
      nextInspection: truck.next_inspection_date,
      lastDailySafetyCheck: lastDailySafetyCheck,
      lastWeeklyInspection: lastWeeklyInspection,
      latestWeeklyInspection: latestWeekly,
      weeklyOverdue: weeklyOverdue,
      assignedTech: assignedTech,
      isShared: isShared,
      hasEquipment: hasEquipment,
      hasPackage: hasPackage,
      hasSafety: hasSafety,
      hasFireExt: hasFireExt,
      hasFirstAid: hasFirstAid,
      wh105Count: truckWh105.length,
      pendingTransfers: pendingTransfers,
      pendingConsumables: pendingConsumables,
    };
  });

  // --- Summary KPIs ---
  var summary = {
    totalTrucks: trucks.length,
    ready: truckData.filter(function(t) { return t.dispatchStatus === 'ready'; }).length,
    needsAttention: truckData.filter(function(t) { return t.dispatchStatus === 'warning'; }).length,
    blocked: truckData.filter(function(t) { return t.dispatchStatus === 'blocked' && t.truck.status !== 'Out of Service' && t.truck.status !== 'Maintenance'; }).length,
    outOfService: truckData.filter(function(t) { return t.truck.status === 'Out of Service' || t.truck.status === 'Maintenance'; }).length,
    shared: truckData.filter(function(t) { return t.isShared; }).length,
    unassigned: truckData.filter(function(t) { return !t.isShared && !t.assignedTech; }).length,
  };

  // --- Inspection Status ---
  var inspDueToday = truckData.filter(function(t) { return t.nextInspection === todayStr; });
  var inspOverdue = truckData.filter(function(t) { var d = daysUntil(t.nextInspection); return d !== null && d < 0; });
  var notInspectedToday = truckData.filter(function(t) { return !t.todayWh105; });
  var weeklyOverdue = truckData.filter(function(t) { return t.weeklyOverdue; });
  var inspection = {
    dueToday: inspDueToday.length,
    overdue: inspOverdue.length,
    notInspectedToday: notInspectedToday.length,
    weeklyOverdue: weeklyOverdue.length,
    weeklyOverdueTrucks: weeklyOverdue,
    ready: truckData.filter(function(t) { return t.dispatchStatus === 'ready'; }).length,
    notReady: truckData.filter(function(t) { return t.dispatchStatus !== 'ready'; }).length,
    dueTodayTrucks: inspDueToday,
    overdueTrucks: inspOverdue,
    notInspectedTodayTrucks: notInspectedToday,
  };

  // --- Equipment Readiness ---
  var equipmentReadiness = {
    missingPackages: truckData.filter(function(t) { return !t.hasPackage && !t.isShared; }),
    missingRequired: truckData.filter(function(t) { return !t.hasEquipment && !t.isShared; }),
    missingSafety: truckData.filter(function(t) { return !t.hasSafety && !t.isShared; }),
    missingFireExtinguisher: truckData.filter(function(t) { return !t.hasFireExt && !t.isShared; }),
    missingFirstAid: truckData.filter(function(t) { return !t.hasFirstAid && !t.isShared; }),
  };

  // --- Consumable Readiness ---
  var transfersReadyList = transfers.filter(function(t) { return ['Issued', 'Closed', 'Completed', 'Picked Up'].indexOf(t.status) >= 0; });
  var transfersWaitingList = transfers.filter(function(t) { return ['Draft', 'Submitted', 'Requested', 'Staged'].indexOf(t.status) >= 0; });
  var transfersNotLoadedList = transfers.filter(function(t) { return ['Issued', 'Closed', 'Completed', 'Picked Up'].indexOf(t.status) === -1; });
  var consumableReadiness = {
    missingRequired: truckData.filter(function(t) { return t.pendingConsumables.length > 0; }),
    belowMinimum: truckData.filter(function(t) { return t.pendingConsumables.length > 0; }),
    transfersReady: transfersReadyList.length,
    transfersWaiting: transfersWaitingList.length,
    transfersNotLoaded: transfersNotLoadedList.length,
    transfersNotLoadedList: transfersNotLoadedList,
  };

  // --- Defects ---
  var allOpenDefects = truckData.flatMap(function(t) {
    return t.openDefects.map(function(d) { return Object.assign({}, d, { truck: t.truck }); });
  });
  var defects = {
    openDefects: allOpenDefects.length,
    criticalDefects: allOpenDefects.filter(function(d) { return d.issue_reported; }).length,
    repairsInProgress: 0,
    repairsCompletedToday: 0,
    allOpenDefects: allOpenDefects,
  };

  // --- Jobs ---
  var todaysJobs = jobs.filter(function(j) { return j.service_date === todayStr && ['completed', 'cancelled'].indexOf(j.status) === -1; });
  var blockedJobs = [];
  var readyJobs = [];

  todaysJobs.forEach(function(job) {
    var reasons = [];
    var linkedWh105 = wh105.find(function(w) { return w.job_number === job.crm_job_number || w.job_number === job.id; });
    var linkedTransfer = transfers.find(function(t) { return t.job_id === job.id || t.job_number === job.crm_job_number; });
    var truckNumber = (linkedWh105 && linkedWh105.truck_number) || (linkedTransfer && linkedTransfer.truck_number);
    var linkedTruck = truckNumber ? truckData.find(function(t) { return t.truck.truck_number === truckNumber; }) : null;

    if (!job.technician_name && !job.technician_email) reasons.push('Technician Missing');
    if (linkedTruck) {
      if (linkedTruck.truck.status === 'Out of Service' || linkedTruck.truck.status === 'Maintenance') reasons.push('Out of Service Vehicle');
      if (linkedTruck.dispatchStatus === 'blocked') reasons.push('Truck Not Ready');
      if (linkedTruck.blockingReasons.some(function(r) { return r.indexOf('Inspection overdue') >= 0; })) reasons.push('Inspection Overdue');
      if (linkedTruck.blockingReasons.indexOf('Missing required equipment') >= 0) reasons.push('Equipment Missing');
      if (linkedTruck.warningReasons.some(function(r) { return r.indexOf('consumable') >= 0; })) reasons.push('Consumables Missing');
      if (linkedTruck.warningReasons.some(function(r) { return r.indexOf('material transfer') >= 0; })) reasons.push('Material Transfer Missing');
    } else {
      reasons.push('Truck Not Ready');
    }

    var blockedByFleet = reasons.indexOf('Truck Not Ready') >= 0 || reasons.indexOf('Out of Service Vehicle') >= 0 || reasons.indexOf('Inspection Overdue') >= 0;
    var blockedByMaterial = reasons.indexOf('Material Transfer Missing') >= 0;
    var blockedByEquipment = reasons.indexOf('Equipment Missing') >= 0;
    var awaitingWarehouse = reasons.indexOf('Consumables Missing') >= 0 || reasons.indexOf('Material Transfer Missing') >= 0;

    if (reasons.length === 0) {
      readyJobs.push(job);
    } else {
      blockedJobs.push({ job: job, reasons: reasons, linkedTruck: linkedTruck, blockedByFleet: blockedByFleet, blockedByMaterial: blockedByMaterial, blockedByEquipment: blockedByEquipment, awaitingWarehouse: awaitingWarehouse });
    }
  });

  var jobsData = { todaysJobs: todaysJobs, ready: readyJobs.length, blocked: blockedJobs.length, blockedJobs: blockedJobs, readyJobs: readyJobs };

  // --- Dispatch Readiness ---
  var trucksReady = truckData.filter(function(t) { return t.dispatchStatus === 'ready'; }).length;
  var trucksReadyWithWarnings = truckData.filter(function(t) { return t.dispatchStatus === 'warning'; }).length;
  var trucksBlocked = truckData.filter(function(t) { return t.dispatchStatus === 'blocked'; }).length;
  var dispatchReadiness = {
    trucksReady: trucksReady,
    trucksReadyWithWarnings: trucksReadyWithWarnings,
    trucksBlocked: trucksBlocked,
    jobsReady: readyJobs.length,
    jobsBlockedByFleet: blockedJobs.filter(function(j) { return j.blockedByFleet; }).length,
    jobsBlockedByMaterial: blockedJobs.filter(function(j) { return j.blockedByMaterial; }).length,
    jobsBlockedByEquipment: blockedJobs.filter(function(j) { return j.blockedByEquipment; }).length,
    jobsAwaitingWarehouse: blockedJobs.filter(function(j) { return j.awaitingWarehouse; }).length,
    score: trucks.length > 0 ? Math.round((trucksReady / trucks.length) * 100) : 0,
  };

  // --- Fleet Health Score ---
  var inspFactor = trucks.length > 0 ? inspection.ready / trucks.length : 0;
  var defectFactor = allOpenDefects.length > 0 ? Math.max(0, 1 - allOpenDefects.length / Math.max(trucks.length, 1)) : 1;
  var equipFactor = truckData.length > 0 ? truckData.filter(function(t) { return t.hasEquipment || t.isShared; }).length / truckData.length : 0;
  var consumableFactor = truckData.length > 0 ? truckData.filter(function(t) { return t.pendingConsumables.length === 0; }).length / truckData.length : 0;
  var availFactor = trucks.length > 0 ? (trucks.length - summary.outOfService) / trucks.length : 0;

  var fleetHealth = {
    score: Math.round((inspFactor + defectFactor + equipFactor + consumableFactor + availFactor) / 5 * 100),
    factors: {
      inspections: Math.round(inspFactor * 100),
      defects: Math.round(defectFactor * 100),
      equipment: Math.round(equipFactor * 100),
      consumables: Math.round(consumableFactor * 100),
      availability: Math.round(availFactor * 100),
    },
  };

  // --- Alerts ---
  var alerts = [];
  truckData.forEach(function(td) {
    td.blockingReasons.forEach(function(reason) {
      alerts.push({ severity: 'critical', truck: td.truck.truck_number, message: 'Truck ' + td.truck.truck_number + ': ' + reason });
    });
    if (!td.hasFireExt && !td.isShared) {
      alerts.push({ severity: 'warning', truck: td.truck.truck_number, message: 'Truck ' + td.truck.truck_number + ' missing fire extinguisher' });
    }
    if (td.pendingConsumables.length > 0) {
      alerts.push({ severity: 'warning', truck: td.truck.truck_number, message: 'Truck ' + td.truck.truck_number + ' missing consumables' });
    }
  });
  transfersNotLoadedList.forEach(function(t) {
    alerts.push({ severity: 'warning', truck: t.truck_number, message: 'Material Transfer ' + (t.transfer_id || t.id) + ' not loaded' });
  });
  blockedJobs.forEach(function(bj) {
    var truckNum = bj.linkedTruck ? bj.linkedTruck.truck.truck_number : null;
    alerts.push({ severity: 'critical', truck: truckNum, message: 'Job ' + (bj.job.crm_job_number || bj.job.id) + ' cannot dispatch: ' + bj.reasons.join(', ') });
  });

  return {
    summary: summary,
    dispatchReadiness: dispatchReadiness,
    fleetHealth: fleetHealth,
    truckData: truckData,
    inspection: inspection,
    equipmentReadiness: equipmentReadiness,
    consumableReadiness: consumableReadiness,
    defects: defects,
    jobs: jobsData,
    alerts: alerts,
    todayStr: todayStr,
  };
}