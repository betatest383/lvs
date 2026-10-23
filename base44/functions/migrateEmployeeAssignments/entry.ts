import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false; // default to dry run (preview only)

    // Load all employees
    const employees = await base44.asServiceRole.entities.EmployeeRegistry.list('-created_date', 1000);

    // Build lookup indexes
    const byName = {};
    const byEmail = {};

    employees.forEach(emp => {
      const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim().toLowerCase();
      const preferred = `${emp.preferred_name || emp.first_name || ''} ${emp.last_name || ''}`.trim().toLowerCase();
      const email = (emp.login_email || emp.email || '').toLowerCase().trim();

      [fullName, preferred].forEach(n => {
        if (!n) return;
        if (!byName[n]) byName[n] = [];
        byName[n].push(emp);
      });

      if (email) byEmail[email] = emp;
    });

    const matchEmployee = (name, email) => {
      const normalizedEmail = (email || '').toLowerCase().trim();
      if (normalizedEmail && byEmail[normalizedEmail]) {
        return { emp: byEmail[normalizedEmail], method: 'email' };
      }
      const normalizedName = (name || '').trim().toLowerCase();
      if (normalizedName && byName[normalizedName]) {
        const matches = byName[normalizedName];
        if (matches.length === 1) {
          return { emp: matches[0], method: 'name_exact' };
        }
        return { emp: null, method: 'duplicate_name', duplicates: matches };
      }
      return { emp: null, method: 'no_match' };
    };

    const empName = (emp) => `${emp.preferred_name || emp.first_name} ${emp.last_name}`.trim();

    /**
     * Generic migration processor for a single entity type.
     * config: {
     *   entityName, label,
     *   nameField, emailField, registryIdField, linkedUserIdField, roleField,
     *   extraPopulate: (emp) => ({})  // optional extra fields to set on update
     * }
     */
    async function migrateEntity(config) {
      const records = await base44.asServiceRole.entities[config.entityName].list('-created_date', 1000);
      const results = { converted: [], unmatched: [], duplicates: [] };
      const updates = [];

      for (const record of records) {
        if (record[config.registryIdField]) continue;
        const name = record[config.nameField];
        const email = record[config.emailField];
        if (!name && !email) continue;

        const result = matchEmployee(name, email);

        if (result.emp) {
          const emp = result.emp;
          const name = empName(emp);
          results.converted.push({
            record_id: record.id,
            identifier: record[config.identifierField] || record.id,
            original_name: record[config.nameField],
            original_email: record[config.emailField],
            matched_employee_id: emp.id,
            matched_employee_name: name,
            match_method: result.method,
          });
          if (!dryRun) {
            const update = {
              id: record.id,
              [config.registryIdField]: emp.id,
              [config.nameField]: name,
              [config.emailField]: emp.login_email || emp.email || record[config.emailField],
            };
            if (config.linkedUserIdField) {
              update[config.linkedUserIdField] = emp.linked_user_id || '';
            }
            if (config.roleField) {
              update[config.roleField] = emp.primary_role || record[config.roleField] || '';
            }
            if (config.extraPopulate) {
              Object.assign(update, config.extraPopulate(emp, record));
            }
            updates.push(update);
          }
        } else if (result.method === 'duplicate_name') {
          results.duplicates.push({
            record_id: record.id,
            identifier: record[config.identifierField] || record.id,
            original_name: record[config.nameField],
            original_email: record[config.emailField],
            duplicate_matches: result.duplicates.map(e => ({
              employee_id: e.id,
              employee_name: `${e.first_name} ${e.last_name}`,
              email: e.login_email || e.email,
            })),
          });
        } else {
          results.unmatched.push({
            record_id: record.id,
            identifier: record[config.identifierField] || record.id,
            original_name: record[config.nameField],
            original_email: record[config.emailField],
          });
        }
      }

      // Apply updates in batches
      if (!dryRun && updates.length > 0) {
        for (let i = 0; i < updates.length; i += 100) {
          const batch = updates.slice(i, i + 100);
          await base44.asServiceRole.entities[config.entityName].bulkUpdate(batch);
        }
      }

      return {
        scanned: records.length,
        converted: results.converted.length,
        unmatched: results.unmatched.length,
        duplicates: results.duplicates.length,
        records: results,
        applied: !dryRun ? updates.length : 0,
      };
    }

    // Define all entity migration configs
    const configs = [
      {
        entityName: 'EnterpriseTask',
        label: 'Enterprise Tasks',
        identifierField: 'task_id',
        nameField: 'assigned_to',
        emailField: 'assigned_to_email',
        registryIdField: 'assigned_employee_registry_id',
        linkedUserIdField: 'assigned_to_linked_user_id',
        roleField: 'assigned_role',
        extraPopulate: (emp) => ({ assigned_department: emp.department || '' }),
      },
      {
        entityName: 'EnterpriseNotification',
        label: 'Enterprise Notifications',
        identifierField: 'notification_id',
        nameField: 'recipient_name',
        emailField: 'recipient_email',
        registryIdField: 'recipient_employee_registry_id',
        linkedUserIdField: 'recipient_user_id',
        roleField: 'recipient_role',
        extraPopulate: (emp) => ({ recipient_department: emp.department || '' }),
      },
      {
        entityName: 'EmployeeCertification',
        label: 'Employee Certifications',
        identifierField: 'certification_name',
        nameField: 'employee_name',
        emailField: 'employee_email',
        registryIdField: 'employee_registry_id',
        linkedUserIdField: null,
        roleField: 'role',
      },
      {
        entityName: 'CorrectiveAction',
        label: 'Corrective Actions',
        identifierField: 'audit_number',
        nameField: 'assigned_employee',
        emailField: 'assigned_employee_email',
        registryIdField: 'assigned_employee_registry_id',
        linkedUserIdField: null,
        roleField: null,
        extraPopulate: (emp) => ({ department: emp.department || '' }),
      },
      {
        entityName: 'EmployeeOnboarding',
        label: 'Employee Onboarding',
        identifierField: 'onboarding_id',
        nameField: 'employee_name',
        emailField: 'employee_email',
        registryIdField: 'employee_registry_id',
        linkedUserIdField: null,
        roleField: 'primary_role',
        extraPopulate: (emp) => ({
          employee_id: emp.employee_id || '',
          department: emp.department || '',
          supervisor: emp.supervisor || '',
        }),
      },
      {
        entityName: 'TechEquipment',
        label: 'Equipment Assignments',
        identifierField: 'equipment_id',
        nameField: 'assigned_employee',
        emailField: 'assigned_employee_email',
        registryIdField: 'assigned_employee_registry_id',
        linkedUserIdField: null,
        roleField: null,
      },
      {
        entityName: 'TruckProfile',
        label: 'Truck Lead Technician Assignments',
        identifierField: 'truck_id',
        nameField: 'assigned_lead_technician',
        emailField: 'assigned_lead_technician',
        registryIdField: 'assigned_lead_technician_registry_id',
        linkedUserIdField: null,
        roleField: null,
      },
    ];

    // Run migrations
    const results = {};
    let totalApplied = 0;
    for (const config of configs) {
      const result = await migrateEntity(config);
      results[config.entityName] = { label: config.label, ...result };
      totalApplied += result.applied;
    }

    return Response.json({
      dry_run: dryRun,
      total_employees: employees.length,
      entities: results,
      applied: totalApplied,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});