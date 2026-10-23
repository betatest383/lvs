import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

let cachedMap = null;
let fetchPromise = null;

/**
 * Fetches EmployeeRegistry once and builds a lookup map keyed by
 * email, login_email, employee_id, and linked_user_id (prefixed with "uid:").
 * Used by audit components to resolve "Performed By" to human names.
 */
export function useEmployeeAuditMap() {
  const [employeeMap, setEmployeeMap] = useState(cachedMap || {});

  useEffect(() => {
    if (cachedMap) {
      setEmployeeMap(cachedMap);
      return;
    }

    if (!fetchPromise) {
      fetchPromise = base44.entities.EmployeeRegistry.list('-created_date', 500)
        .then(employees => {
          const map = {};
          for (const emp of employees || []) {
            if (emp.email) map[emp.email.toLowerCase()] = emp;
            if (emp.login_email) map[emp.login_email.toLowerCase()] = emp;
            if (emp.employee_id) map[emp.employee_id.toLowerCase()] = emp;
            if (emp.linked_user_id) map[`uid:${emp.linked_user_id}`] = emp;
          }
          cachedMap = map;
          return map;
        })
        .catch(() => ({}));
    }

    fetchPromise.then(map => setEmployeeMap(map));
  }, []);

  return employeeMap;
}