import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const FIELD_SERVICE_DEPARTMENTS = ['field service', 'field operations'];
const FIELD_SERVICE_ROLE_KEYWORDS = ['lead tech', 'apprentice', 'mason', 'technician'];

/**
 * Loads field-service technicians from EmployeeRegistry (single source of truth).
 * Filters by Field Service department or technician-related roles.
 */
export function useTechnicians() {
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const recs = await base44.entities.EmployeeRegistry.list('-created_date', 200);
        const techs = recs
          .filter(e => {
            const dept = (e.department || '').toLowerCase();
            const role = (e.primary_role || '').toLowerCase();
            return FIELD_SERVICE_DEPARTMENTS.some(d => dept.includes(d)) ||
                   FIELD_SERVICE_ROLE_KEYWORDS.some(r => role.includes(r));
          })
          .filter(e => e.employment_status !== 'Terminated' && e.employment_status !== 'Inactive')
          .map(e => ({
            id: e.id,
            name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
            email: e.email || e.login_email || '',
            phone: e.phone || '',
            technician_id: e.servicetitan_employee_id || e.employee_id || '',
            status: (e.employment_status || 'Active').toLowerCase(),
            active_status: e.employment_status === 'Active',
            truck_number: e.assigned_truck || '',
          }));
        setTechnicians(techs);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return { technicians, loading };
}