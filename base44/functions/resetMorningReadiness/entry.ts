import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ALLOWED_ROLES = ['owner', 'admin', 'director_of_operations'];

const CHECK_FIELDS = [
  'consumables_status', 'material_transfer_status', 'previous_returns_status',
  'truck_cleaned_status', 'truck_organized_status', 'daily_equipment_status',
  'todays_job_equipment_status', 'materials_loaded_status', 'forklift_loading_status',
  'blocking_issues_status', 'manager_holds_status',
];

const RESET_STATUSES = Object.fromEntries(CHECK_FIELDS.map(f => [f, 'waiting']));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (!ALLOWED_ROLES.includes(user.role)) {
      return Response.json({ error: 'Forbidden — only Owner, Admin, or Director of Operations can perform a developer reset.' }, { status: 403 });
    }

    const body = await req.json();
    const {
      technician_email,
      clear_test_tasks = false,
      clear_test_notifications = false,
      clear_test_events = false,
      reason = 'Development Testing',
    } = body;

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const now = new Date().toISOString();

    // 1. Find today's departure check(s)
    const query = technician_email
      ? { technician_email, date: today }
      : { date: today };

    const departureChecks = await base44.entities.Wh105DepartureCheck.filter(query, '-updated_date', 200);

    const resetRecords = [];
    const trucksReset = new Set();

    for (const dep of departureChecks) {
      // Reset the departure check record to initial state
      await base44.entities.Wh105DepartureCheck.update(dep.id, {
        ...RESET_STATUSES,
        overall_status: 'waiting',
        readiness_percentage: 0,
        departed: false,
        departure_timestamp: null,
        blocking_issues_detail: null,
        manager_overrides: null,
        help_requested: false,
        help_requested_at: null,
        help_request_reason: null,
        issue_reported: false,
        issue_reported_at: null,
        issue_reported_detail: null,
        notes: null,
      });

      resetRecords.push({
        departure_id: dep.departure_id,
        technician_name: dep.technician_name,
        technician_email: dep.technician_email,
        truck_id: dep.truck_id,
        truck_number: dep.truck_number,
      });

      // 2. Reset truck status back to "Not Started" / Available
      if (dep.truck_id) {
        try {
          const trucks = await base44.entities.TruckProfile.filter({ truck_id: dep.truck_id });
          if (trucks.length > 0) {
            await base44.entities.TruckProfile.update(trucks[0].id, {
              current_assignment_status: 'Available',
              current_driver: '',
              current_job: '',
            });
            trucksReset.add(dep.truck_id);
          }
        } catch (e) {
          console.error('Truck reset failed:', e.message);
        }
      }
    }

    // 3. Clear test automation data (optional)
    let tasksCleared = 0;
    let notificationsCleared = 0;
    let eventsCleared = 0;

    if (clear_test_tasks) {
      try {
        const testTasks = await base44.entities.EnterpriseTask.filter({ source_module: 'wh105' }, '-updated_date', 500);
        tasksCleared = testTasks.length;
        for (const t of testTasks) {
          await base44.entities.EnterpriseTask.delete(t.id).catch(() => {});
        }
      } catch (e) {
        console.error('Task clear failed:', e.message);
      }
    }

    if (clear_test_notifications) {
      try {
        const testNotifs = await base44.entities.EnterpriseNotification.filter({ source_module: 'wh105' }, '-updated_date', 500);
        notificationsCleared = testNotifs.length;
        for (const n of testNotifs) {
          await base44.entities.EnterpriseNotification.delete(n.id).catch(() => {});
        }
      } catch (e) {
        console.error('Notification clear failed:', e.message);
      }
    }

    if (clear_test_events) {
      try {
        const testEvents = await base44.entities.IntegrationEvent.filter({ source_system: 'WH-105' }, '-updated_date', 500);
        eventsCleared = testEvents.length;
        for (const ev of testEvents) {
          await base44.entities.IntegrationEvent.delete(ev.id).catch(() => {});
        }
      } catch (e) {
        console.error('Event clear failed:', e.message);
      }
    }

    // 5. Audit trail — log as an IntegrationEvent
    try {
      await base44.entities.IntegrationEvent.create({
        event_id: `EVT-RESET-${Date.now()}`,
        source_system: 'WH-105 Developer Reset',
        event_type: 'morning_readiness_reset',
        external_id: `RESET-${today}`,
        received_at: now,
        processed_at: now,
        status: 'Processed',
        parsed_summary: `Developer reset performed by ${user.full_name} (${user.email}) at ${now}. Reason: ${reason}. Reset ${resetRecords.length} departure check(s), ${trucksReset.size} truck(s). Cleared: ${tasksCleared} task(s), ${notificationsCleared} notification(s), ${eventsCleared} event(s). Technicians: ${resetRecords.map(r => r.technician_name).join(', ') || 'none'}.`,
        related_truck_id: trucksReset.size > 0 ? [...trucksReset].join(',') : '',
        related_technician_id: technician_email || 'ALL',
      });
    } catch (e) {
      console.error('Audit trail failed:', e.message);
    }

    return Response.json({
      success: true,
      reset_count: resetRecords.length,
      trucks_reset: trucksReset.size,
      tasks_cleared: tasksCleared,
      notifications_cleared: notificationsCleared,
      events_cleared: eventsCleared,
      reset_records: resetRecords,
      performed_by: user.full_name,
      performed_at: now,
      reason,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});