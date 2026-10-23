import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

export function useFleetData() {
  const [trucks, setTrucks] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [t, a] = await Promise.all([
        base44.entities.TruckProfile.list('-updated_date', 200),
        base44.entities.VehicleAssignment.list('-created_date', 200),
      ]);
      setTrucks(t);
      setAssignments(a);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  return { trucks, assignments, loading, reload: load };
}