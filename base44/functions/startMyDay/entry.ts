import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { departure_id } = body;

    if (!departure_id) return Response.json({ error: 'departure_id required' }, { status: 400 });

    const departure = await base44.entities.Wh105DepartureCheck.get(departure_id);
    if (!departure) return Response.json({ error: 'Departure check not found' }, { status: 404 });
    if (departure.departed) return Response.json({ error: 'Already departed', departure_timestamp: departure.departure_timestamp }, { status: 400 });

    const checks = ['consumables', 'material_transfer', 'previous_returns', 'truck_cleaned', 'truck_organized', 'daily_equipment', 'todays_job_equipment', 'materials_loaded', 'forklift_loading', 'blocking_issues', 'manager_holds', 'truck_inspection', 'dashboard_review'];
    const failing = checks.filter(c => {
      const status = departure[`${c}_status`];
      return !['complete', 'not_required', 'manager_override'].includes(status);
    });

    if (failing.length > 0) {
      return Response.json({ error: 'Readiness checks not passed', failing }, { status: 400 });
    }

    const now = new Date().toISOString();

    await base44.entities.Wh105DepartureCheck.update(departure_id, {
      departed: true,
      departure_timestamp: now,
      overall_status: 'departed',
      readiness_percentage: 100,
    });

    if (departure.truck_id) {
      try {
        const trucks = await base44.entities.TruckProfile.filter({ truck_id: departure.truck_id });
        if (trucks.length > 0) {
          await base44.entities.TruckProfile.update(trucks[0].id, {
            current_assignment_status: 'In Use',
            current_driver: departure.technician_name,
            current_job: departure.job_number || '',
          });
        }
      } catch (e) {
        console.error('Truck update failed:', e.message);
      }
    }

    try {
      await base44.entities.IntegrationEvent.create({
        event_id: `EVT-WH105-${Date.now()}`,
        source_system: 'WH-105',
        event_type: 'technician_departure',
        external_id: departure.departure_id,
        received_at: now,
        processed_at: now,
        status: 'Processed',
        parsed_summary: `Technician ${departure.technician_name} departed with truck ${departure.truck_number}${departure.job_number ? ' for job ' + departure.job_number : ''} at ${now}`,
        related_truck_id: departure.truck_id,
        related_technician_id: departure.technician_email,
      });
    } catch (e) {
      console.error('Event log failed:', e.message);
    }

    return Response.json({
      success: true,
      departure_timestamp: now,
      truck_number: departure.truck_number,
      technician_name: departure.technician_name,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});