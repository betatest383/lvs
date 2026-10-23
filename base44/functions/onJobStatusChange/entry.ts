import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { event, data, old_data } = await req.json();
    if (!event || event.type !== 'update' || event.entity_name !== 'Job') {
      return Response.json({ skipped: true, reason: 'Not a Job update event' });
    }

    const job = data;
    const prevJob = old_data || {};
    const prevStatus = prevJob.status;
    const newStatus = job.status;

    // Only trigger on transition to "approved" or "scheduled"
    const triggerStatuses = ['approved', 'scheduled'];
    if (!triggerStatuses.includes(newStatus) || prevStatus === newStatus) {
      return Response.json({ skipped: true, reason: `Status ${newStatus} is not a trigger, or no change` });
    }

    // Skip if a warehouse task already exists for this job + workflow
    const existingTasks = await base44.asServiceRole.entities.EnterpriseTask.filter({
      related_job: job.crm_job_number || job.id,
      source_module: 'Warehouse Workflow',
      source_record_id: 'JOB_STATUS_TRIGGER'
    });
    if (existingTasks && existingTasks.length > 0) {
      return Response.json({ skipped: true, reason: 'Warehouse prompt task already exists for this job' });
    }

    // Generate task ID
    const taskCount = await base44.asServiceRole.entities.EnterpriseTask.list('-created_date', 1);
    const nextNum = String((taskCount?.length || 0) + 1).padStart(6, '0');
    const taskId = `TASK-${nextNum}`;

    // Create Warehouse Task prompting Material Transfer creation
    const triggerLabel = newStatus === 'approved' ? 'Estimate Approved' : 'Job Scheduled';
    const task = await base44.asServiceRole.entities.EnterpriseTask.create({
      task_id: taskId,
      title: `Create Warehouse Material Transfer — ${job.customer_name || 'Job'}`,
      description: `Job status changed to "${newStatus}" (${triggerLabel}). A Material Transfer should be created to reserve inventory for this job.\n\nJob: ${job.crm_job_number || job.id}\nCustomer: ${job.customer_name || '—'}\nAddress: ${job.address || '—'}${job.city ? ', ' + job.city : ''}${job.state ? ', ' + job.state : ''} ${job.zip || ''}\nTechnician: ${job.technician_name || '—'}\nService Date: ${job.service_date || '—'}\n\nAction Required: Review job requirements and create a Material Transfer to reserve needed inventory.`,
      department: 'Warehouse',
      task_type: 'Warehouse',
      priority: job.priority === 'urgent' ? 'Critical' : job.priority === 'high' ? 'High' : 'Medium',
      status: 'New',
      assigned_to: 'Warehouse Team',
      related_job: job.crm_job_number || job.id,
      source_module: 'Warehouse Workflow',
      source_record_id: 'JOB_STATUS_TRIGGER',
      notes: `Auto-generated from Job status change: ${prevStatus || '—'} → ${newStatus}`,
    });

    // Create notification to warehouse staff
    const notifCount = await base44.asServiceRole.entities.EnterpriseNotification.list('-created_date', 1);
    const nextNotifNum = String((notifCount?.length || 0) + 1).padStart(6, '0');
    const notifId = `NOT-${nextNotifNum}`;

    await base44.asServiceRole.entities.EnterpriseNotification.create({
      notification_id: notifId,
      title: `Material Transfer Needed — ${job.customer_name || 'Job'}`,
      message: `Job ${job.crm_job_number || job.id} for ${job.customer_name || 'customer'} has been ${triggerLabel.toLowerCase()}. A Warehouse Material Transfer should be created to reserve inventory.\n\nTechnician: ${job.technician_name || '—'}\nService Date: ${job.service_date || '—'}`,
      notification_type: 'Approval Required',
      priority: newStatus === 'approved' ? 'High' : 'Medium',
      status: 'Pending',
      source_module: 'Warehouse Workflow',
      source_record_id: task.id,
      recipient_role: 'warehouse_manager',
      recipient_department: 'Warehouse',
      related_job: job.crm_job_number || job.id,
      related_customer: job.customer_name || '',
      delivery_methods: ['In-App'],
      requires_acknowledgment: false,
    });

    return Response.json({
      success: true,
      task_id: taskId,
      notification_id: notifId,
      job_id: job.id,
      trigger: triggerLabel,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});