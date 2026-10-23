/**
 * Shared field constants for module event definitions.
 * Imported by category-specific module files to avoid circular dependencies.
 */

export const COMMON_FIELDS = [
  { key: 'employee', label: 'Employee', type: 'string' },
  { key: 'truck', label: 'Truck', type: 'string' },
  { key: 'department', label: 'Department', type: 'string' },
  { key: 'status', label: 'Status', type: 'string' },
  { key: 'timestamp', label: 'Timestamp', type: 'datetime' },
  { key: 'related_record_id', label: 'Related Record ID', type: 'string' },
];

export const JOB_FIELDS = [
  { key: 'job_id', label: 'Job ID', type: 'string' },
  { key: 'job_number', label: 'Job Number', type: 'string' },
  { key: 'customer_name', label: 'Customer Name', type: 'string' },
  { key: 'customer_id', label: 'Customer ID', type: 'string' },
  { key: 'technician_email', label: 'Technician Email', type: 'string' },
  { key: 'appointment_id', label: 'Appointment ID', type: 'string' },
];