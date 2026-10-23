import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Resolves related-entity IDs stored on an EnterpriseTask to readable names.
 * Canonical IDs are preserved on the task record — this hook is display-only.
 *
 * When a lookup fails but the task stores a related ID, an "unavailable" marker
 * is returned so the UI can still render the row instead of hiding it.
 *
 * Returns a map of field → { name, id, route, unavailable } | null
 */
export function useTaskRelatedNames(task) {
  const [names, setNames] = useState({});

  useEffect(() => {
    if (!task) { setNames({}); return; }
    let cancelled = false;

    async function safeGet(entity, id) {
      if (!id) return null;
      try {
        return await base44.entities[entity].get(id);
      } catch {
        return null;
      }
    }

    async function safeFilter(entity, query) {
      try {
        const results = await base44.entities[entity].filter(query, null, 1);
        return results[0] || null;
      } catch {
        return null;
      }
    }

    function empName(emp) {
      if (!emp) return null;
      const name = [emp.preferred_name || emp.first_name || '', emp.last_name || ''].filter(Boolean).join(' ').trim();
      return name ? `${name} (${emp.employee_id})` : emp.employee_id;
    }

    function buildRoute(base, id) {
      return id ? `${base}/${id}` : null;
    }

    // Resolved → {name, id, route}. Failed-but-id-present → unavailable marker.
    function rec(record, id, nameFn, route) {
      if (record) return { name: nameFn(record), id: record.id, route, unavailable: false };
      if (id) return { name: 'Record unavailable', id, route: null, unavailable: true };
      return null;
    }

    async function resolve() {
      const [
        customer, job, assignedEmp, truck, equipment, sop, workflow,
        businessProcess, policy, training, certification, audit,
        correctiveAction, onboarding, improvementRequest,
      ] = await Promise.all([
        safeGet('Customer', task.related_customer),
        safeGet('Job', task.related_job),
        safeGet('EmployeeRegistry', task.assigned_employee_registry_id),
        safeGet('TruckProfile', task.related_truck),
        safeGet('EquipmentMaster', task.related_equipment),
        safeGet('SopRegistry', task.related_sop),
        safeGet('WorkflowRegistry', task.related_workflow),
        safeGet('BusinessProcess', task.related_business_process),
        safeGet('PolicyRegistry', task.related_policy),
        safeGet('TrainingRegistry', task.related_training),
        safeGet('CertificationRegistry', task.related_certification),
        safeGet('AuditTemplate', task.related_audit),
        safeGet('CorrectiveAction', task.related_corrective_action),
        safeGet('EmployeeOnboarding', task.related_onboarding),
        safeGet('ImprovementRequest', task.related_improvement_request),
      ]);

      // requested_by_employee_id stores the employee_id field (e.g. EMP-011), not the record ID
      const requestedByEmp = task.requested_by_employee_id
        ? await safeFilter('EmployeeRegistry', { employee_id: task.requested_by_employee_id })
        : null;

      // created_by stores the authenticated user's email — resolve to the employee record
      const createdByEmp = task.created_by
        ? (await safeFilter('EmployeeRegistry', { login_email: task.created_by })
           || await safeFilter('EmployeeRegistry', { email: task.created_by }))
        : null;

      if (cancelled) return;

      setNames({
        customer: rec(customer, task.related_customer, c => c.name || c.customer_number, '/admin/customers'),
        job: rec(job, task.related_job, j => j.job_number || j.title || j.id, buildRoute('/admin/jobs', task.related_job)),
        assignedEmployee: assignedEmp ? { name: empName(assignedEmp), id: assignedEmp.id, route: buildRoute('/lvcos/employees/detail', assignedEmp.id), unavailable: false } : null,
        requestedByEmployee: requestedByEmp ? { name: empName(requestedByEmp), id: requestedByEmp.id, route: buildRoute('/lvcos/employees/detail', requestedByEmp.id), unavailable: false } : null,
        createdBy: createdByEmp ? { name: empName(createdByEmp), id: createdByEmp.id, route: buildRoute('/lvcos/employees/detail', createdByEmp.id), unavailable: false } : null,
        truck: rec(truck, task.related_truck, t => t.truck_number || t.name || t.id, buildRoute('/fleet/trucks', task.related_truck)),
        equipment: rec(equipment, task.related_equipment, e => e.equipment_id || e.name || e.id, null),
        sop: rec(sop, task.related_sop, s => s.sop_number ? `${s.sop_number} — ${s.title}` : s.title || s.id, '/lvcos/sop-registry'),
        workflow: rec(workflow, task.related_workflow, w => w.workflow_id || w.name || w.id, '/lvcos/workflow-registry'),
        businessProcess: rec(businessProcess, task.related_business_process, b => b.process_id || b.name || b.id, '/lvcos/business-process-registry'),
        policy: rec(policy, task.related_policy, p => p.policy_id ? `${p.policy_id} — ${p.title}` : p.title || p.id, buildRoute('/lvcos/policies/detail', task.related_policy)),
        training: rec(training, task.related_training, t => t.training_number ? `${t.training_number} — ${t.title}` : t.title || t.id, buildRoute('/lvcos/training/detail', task.related_training)),
        certification: rec(certification, task.related_certification, c => c.certification_id || c.name || c.id, buildRoute('/lvcos/certifications/detail', task.related_certification)),
        audit: rec(audit, task.related_audit, a => a.name || a.id, null),
        correctiveAction: rec(correctiveAction, task.related_corrective_action, c => c.action_id || c.title || c.id, null),
        onboarding: rec(onboarding, task.related_onboarding, o => o.onboarding_id || o.employee_name || o.id, buildRoute('/lvcos/onboarding/detail', task.related_onboarding)),
        improvementRequest: rec(improvementRequest, task.related_improvement_request, i => i.request_id || i.title || i.id, null),
      });
    }

    resolve();
    return () => { cancelled = true; };
  }, [task?.id, task?.related_customer, task?.related_job, task?.related_truck,
      task?.related_equipment, task?.related_sop, task?.related_workflow,
      task?.related_business_process, task?.related_policy, task?.related_training,
      task?.related_certification, task?.related_audit, task?.related_corrective_action,
      task?.related_onboarding, task?.related_improvement_request,
      task?.assigned_employee_registry_id, task?.requested_by_employee_id, task?.created_by]);

  return names;
}