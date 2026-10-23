import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { computeFleetReadiness } from '@/lib/fleetReadinessCalculator';

const TODAY = new Date().toLocaleDateString('en-CA');

/**
 * Loads all fleet readiness data in parallel and computes readiness metrics.
 */
export function useFleetReadinessData() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [stats, setStats] = useState({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      const startTime = performance.now();
      const queryStats = {};

      const queries = [
        { key: 'trucks', fn: () => base44.entities.TruckProfile.filter({ status: { $ne: 'Retired' } }, '-updated_date', 200) },
        { key: 'wh105', fn: () => base44.entities.Wh105DepartureCheck.filter({}, '-created_date', 200) },
        { key: 'equipment', fn: () => base44.entities.TechEquipment.filter({ is_active: true }, '-created_date', 300) },
        { key: 'packages', fn: () => base44.entities.EquipmentPackage.filter({ is_active: true }, '-created_date', 100) },
        { key: 'transfers', fn: () => base44.entities.MaterialTransferSheet.filter({}, '-created_date', 200) },
        { key: 'consumables', fn: () => base44.entities.ConsumableReplenishment.filter({}, '-created_date', 200) },
        { key: 'returns', fn: () => base44.entities.MaterialReturn.filter({}, '-created_date', 100) },
        { key: 'jobs', fn: () => base44.entities.Job.filter({ service_date: TODAY }, '-created_date', 100) },
        { key: 'assignments', fn: () => base44.entities.VehicleAssignment.filter({ status: 'Active' }, '-created_date', 100) },
        { key: 'weeklyInspections', fn: () => base44.entities.WeeklyInspection.filter({}, '-date', 200) },
      ];

      const results = await Promise.allSettled(queries.map(async q => {
        const t0 = performance.now();
        const data = await q.fn();
        queryStats[q.key] = { count: data?.length || 0, duration: Math.round(performance.now() - t0), error: null };
        return data || [];
      }));

      const resolved = {};
      results.forEach((r, i) => {
        const key = queries[i].key;
        if (r.status === 'fulfilled') {
          resolved[key] = r.value;
        } else {
          resolved[key] = [];
          queryStats[key] = { count: 0, duration: 0, error: r.reason?.message || 'Query failed' };
        }
      });

      queryStats.totalDuration = Math.round(performance.now() - startTime);
      setStats(queryStats);

      const computed = computeFleetReadiness({
        trucks: resolved.trucks,
        wh105: resolved.wh105,
        equipment: resolved.equipment,
        packages: resolved.packages,
        transfers: resolved.transfers,
        consumables: resolved.consumables,
        returns: resolved.returns,
        jobs: resolved.jobs,
        assignments: resolved.assignments,
        weeklyInspections: resolved.weeklyInspections,
        todayStr: TODAY,
      });

      setReadiness(computed);
      setLoading(false);
    };

    load().catch(err => {
      setError(err.message);
      setLoading(false);
    });
  }, []);

  return { loading, error, readiness, stats, todayStr: TODAY };
}