import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { technician_email } = body;

    if (!technician_email) {
      return Response.json({ error: 'technician_email is required' }, { status: 400 });
    }

    // Helper: look up TruckProfile by truck_number and return normalized result
    async function resolveTruckProfile(truckNumber, source) {
      if (!truckNumber) return { truck_number: '', truck_id: '', vehicle_name: '', truck_profile_id: '', source, found: false };
      try {
        const profiles = await base44.asServiceRole.entities.TruckProfile.filter({ truck_number: truckNumber });
        const truck = profiles[0];
        return {
          truck_number: truckNumber,
          truck_id: truck?.truck_id || '',
          vehicle_name: truck?.vehicle_name || '',
          truck_profile_id: truck?.id || '',
          source,
          found: true
        };
      } catch {
        return { truck_number: truckNumber, truck_id: '', vehicle_name: '', truck_profile_id: '', source, found: true };
      }
    }

    // 1. Active VehicleAssignment for this technician
    try {
      const vaRecords = await base44.asServiceRole.entities.VehicleAssignment.filter({
        assigned_to_email: technician_email,
        status: 'Active'
      });
      if (vaRecords && vaRecords.length > 0) {
        const permanent = vaRecords.find(r => r.assignment_type === 'Permanent');
        const vaMatch = permanent || vaRecords[0];
        if (vaMatch && vaMatch.truck_number) {
          return Response.json(await resolveTruckProfile(vaMatch.truck_number, 'vehicle_assignment'));
        }
      }
    } catch {}

    // 2. Technician profile default_truck_number
    try {
      const techRecords = await base44.asServiceRole.entities.Technician.filter({ email: technician_email });
      if (techRecords && techRecords.length > 0 && techRecords[0].default_truck_number) {
        return Response.json(await resolveTruckProfile(techRecords[0].default_truck_number, 'technician_profile'));
      }
    } catch {}

    // 3. EmployeeRegistry assigned_truck field
    try {
      let empRecords = await base44.asServiceRole.entities.EmployeeRegistry.filter({ email: technician_email });
      if (!empRecords || empRecords.length === 0) {
        empRecords = await base44.asServiceRole.entities.EmployeeRegistry.filter({ login_email: technician_email });
      }
      if (empRecords && empRecords.length > 0 && empRecords[0].assigned_truck) {
        return Response.json(await resolveTruckProfile(empRecords[0].assigned_truck, 'employee_registry'));
      }
    } catch {}

    // 4. No truck found
    return Response.json({
      truck_number: '',
      truck_id: '',
      vehicle_name: '',
      truck_profile_id: '',
      source: 'none',
      found: false
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});