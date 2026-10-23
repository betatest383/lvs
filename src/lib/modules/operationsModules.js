/**
 * Operations Modules
 *
 * Modules covering day-to-day operations:
 * Job Hub, Scheduling, Dispatch, Warehouse, Inventory, Fleet,
 * Purchasing, Material Reconciliation
 */
import { COMMON_FIELDS, JOB_FIELDS } from '@/lib/moduleFields';

export const OPERATIONS_MODULES = [
  // ─────────────────────────────────────────────
  // JOB HUB
  // ─────────────────────────────────────────────
  {
    module: 'Job Hub',
    moduleKey: 'job_hub',
    category: 'operations',
    icon: 'Briefcase',
    color: 'bg-slate-100 text-slate-700',
    events: [
      {
        event: 'Job Created',
        eventKey: 'jobhub.job_created',
        description: 'Fired when a new job is created in the Job Hub.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'job_type', label: 'Job Type', type: 'string' },
          { key: 'priority', label: 'Priority', type: 'string' },
          { key: 'workflow_version', label: 'Workflow Version', type: 'string' },
        ],
      },
      {
        event: 'Job Updated',
        eventKey: 'jobhub.job_updated',
        description: 'Fired when a job record is updated.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'changed_fields', label: 'Changed Fields', type: 'array' },
        ],
      },
      {
        event: 'Job Status Changed',
        eventKey: 'jobhub.status_changed',
        description: 'Fired when a job status transitions.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'old_status', label: 'Old Status', type: 'string' },
          { key: 'new_status', label: 'New Status', type: 'string' },
        ],
      },
      {
        event: 'Stage Started',
        eventKey: 'jobhub.stage_started',
        description: 'Fired when a workflow stage is started.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'stage_key', label: 'Stage Key', type: 'string' },
        ],
      },
      {
        event: 'Stage Completed',
        eventKey: 'jobhub.stage_completed',
        description: 'Fired when a workflow stage is completed.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'stage_key', label: 'Stage Key', type: 'string' },
          { key: 'overall_progress', label: 'Overall Progress %', type: 'number' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────
  // SCHEDULING
  // ─────────────────────────────────────────────
  {
    module: 'Scheduling',
    moduleKey: 'scheduling',
    category: 'operations',
    icon: 'CalendarPlus',
    color: 'bg-blue-100 text-blue-700',
    events: [
      {
        event: 'Appointment Scheduled',
        eventKey: 'scheduling.appointment_scheduled',
        description: 'Fired when an appointment is scheduled for a job.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'appointment_date', label: 'Appointment Date', type: 'date' },
          { key: 'arrival_window_start', label: 'Arrival Window Start', type: 'string' },
          { key: 'arrival_window_end', label: 'Arrival Window End', type: 'string' },
        ],
      },
      {
        event: 'Appointment Rescheduled',
        eventKey: 'scheduling.rescheduled',
        description: 'Fired when an appointment is rescheduled.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'old_date', label: 'Old Date', type: 'date' },
          { key: 'new_date', label: 'New Date', type: 'date' },
          { key: 'reason', label: 'Reason', type: 'string' },
        ],
      },
      {
        event: 'Appointment Cancelled',
        eventKey: 'scheduling.cancelled',
        description: 'Fired when an appointment is cancelled.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'cancellation_reason', label: 'Cancellation Reason', type: 'string' },
        ],
      },
      {
        event: 'Appointment Confirmed',
        eventKey: 'scheduling.confirmed',
        description: 'Fired when a customer confirms an appointment.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'confirmed_by', label: 'Confirmed By', type: 'string' },
        ],
      },
      {
        event: 'Technician Assigned',
        eventKey: 'scheduling.tech_assigned',
        description: 'Fired when a technician is assigned to a job.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'technician_email', label: 'Technician Email', type: 'string' },
          { key: 'lead_technician', label: 'Is Lead', type: 'boolean' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────
  // DISPATCH
  // ─────────────────────────────────────────────
  {
    module: 'Dispatch',
    moduleKey: 'dispatch',
    category: 'operations',
    icon: 'Send',
    color: 'bg-indigo-100 text-indigo-700',
    events: [
      {
        event: 'Technician Dispatched',
        eventKey: 'dispatch.dispatched',
        description: 'Fired when a technician is dispatched to a job.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'truck_number', label: 'Truck Number', type: 'string' },
        ],
      },
      {
        event: 'Technician En Route',
        eventKey: 'dispatch.en_route',
        description: 'Fired when a technician marks themselves as en route.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'eta_minutes', label: 'ETA (min)', type: 'number' },
        ],
      },
      {
        event: 'Technician On Site',
        eventKey: 'dispatch.on_site',
        description: 'Fired when a technician arrives on site.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'arrival_time', label: 'Arrival Time', type: 'datetime' },
        ],
      },
      {
        event: 'Dispatch Cancelled',
        eventKey: 'dispatch.cancelled',
        description: 'Fired when a dispatch is cancelled.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'cancellation_reason', label: 'Reason', type: 'string' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────
  // WAREHOUSE
  // ─────────────────────────────────────────────
  {
    module: 'Warehouse',
    moduleKey: 'warehouse',
    category: 'operations',
    icon: 'Warehouse',
    color: 'bg-teal-100 text-teal-700',
    events: [
      {
        event: 'Pick List Created',
        eventKey: 'warehouse.picklist_created',
        description: 'Fired when a warehouse pick list is generated.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'picklist_id', label: 'Pick List ID', type: 'string' },
          { key: 'item_count', label: 'Item Count', type: 'number' },
        ],
      },
      {
        event: 'Pick List Completed',
        eventKey: 'warehouse.picklist_completed',
        description: 'Fired when a warehouse pick list is fulfilled.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'picklist_id', label: 'Pick List ID', type: 'string' },
        ],
      },
      {
        event: 'Material Staged',
        eventKey: 'warehouse.material_staged',
        description: 'Fired when materials are staged for a job.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'item_count', label: 'Item Count', type: 'number' },
        ],
      },
      {
        event: 'Material Loaded',
        eventKey: 'warehouse.material_loaded',
        description: 'Fired when materials are loaded onto a truck.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'truck_number', label: 'Truck Number', type: 'string' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────
  // INVENTORY
  // ─────────────────────────────────────────────
  {
    module: 'Inventory',
    moduleKey: 'inventory',
    category: 'operations',
    icon: 'Boxes',
    color: 'bg-amber-100 text-amber-700',
    events: [
      {
        event: 'Inventory Received',
        eventKey: 'inventory.received',
        description: 'Fired when inventory is received from a purchase order.',
        fields: [
          ...COMMON_FIELDS,
          { key: 'inventory_master_id', label: 'Inventory Master ID', type: 'string' },
          { key: 'item_name', label: 'Item Name', type: 'string' },
          { key: 'sku', label: 'SKU', type: 'string' },
          { key: 'quantity', label: 'Quantity', type: 'number' },
          { key: 'unit_cost', label: 'Unit Cost', type: 'number' },
          { key: 'warehouse_location', label: 'Warehouse Location', type: 'string' },
        ],
      },
      {
        event: 'Inventory Issued',
        eventKey: 'inventory.issued',
        description: 'Fired when inventory is issued to a job.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'inventory_master_id', label: 'Inventory Master ID', type: 'string' },
          { key: 'item_name', label: 'Item Name', type: 'string' },
          { key: 'quantity', label: 'Quantity', type: 'number' },
          { key: 'truck_number', label: 'Truck Number', type: 'string' },
        ],
      },
      {
        event: 'Inventory Transferred',
        eventKey: 'inventory.transferred',
        description: 'Fired when inventory is transferred between locations.',
        fields: [
          ...COMMON_FIELDS,
          { key: 'inventory_master_id', label: 'Inventory Master ID', type: 'string' },
          { key: 'quantity', label: 'Quantity', type: 'number' },
          { key: 'from_location', label: 'From Location', type: 'string' },
          { key: 'to_location', label: 'To Location', type: 'string' },
        ],
      },
      {
        event: 'Inventory Adjusted',
        eventKey: 'inventory.adjusted',
        description: 'Fired when an inventory adjustment is posted.',
        fields: [
          ...COMMON_FIELDS,
          { key: 'inventory_master_id', label: 'Inventory Master ID', type: 'string' },
          { key: 'adjustment_type', label: 'Adjustment Type', type: 'string' },
          { key: 'quantity_adjustment', label: 'Quantity Adjustment', type: 'number' },
        ],
      },
      {
        event: 'Stock Below Reorder Point',
        eventKey: 'inventory.below_reorder',
        description: 'Fired when an item drops below its reorder point.',
        fields: [
          ...COMMON_FIELDS,
          { key: 'inventory_master_id', label: 'Inventory Master ID', type: 'string' },
          { key: 'item_name', label: 'Item Name', type: 'string' },
          { key: 'quantity_owned', label: 'Quantity Owned', type: 'number' },
          { key: 'reorder_point', label: 'Reorder Point', type: 'number' },
        ],
      },
      {
        event: 'Transfer Received',
        eventKey: 'inventory.transfer_received',
        description: 'Fired when a warehouse transfer is received at its destination.',
        fields: [
          ...COMMON_FIELDS,
          { key: 'transfer_id', label: 'Transfer ID', type: 'string' },
          { key: 'item_count', label: 'Item Count', type: 'number' },
          { key: 'to_location', label: 'Destination', type: 'string' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────
  // PURCHASING
  // ─────────────────────────────────────────────
  {
    module: 'Purchasing',
    moduleKey: 'purchasing',
    category: 'operations',
    icon: 'ShoppingCart',
    color: 'bg-blue-100 text-blue-700',
    events: [
      {
        event: 'Purchase Order Created',
        eventKey: 'purchasing.po_created',
        description: 'Fired when a purchase order is created.',
        fields: [
          ...COMMON_FIELDS,
          { key: 'po_number', label: 'PO Number', type: 'string' },
          { key: 'vendor_name', label: 'Vendor', type: 'string' },
          { key: 'line_count', label: 'Line Count', type: 'number' },
          { key: 'total', label: 'Total', type: 'number' },
        ],
      },
      {
        event: 'Purchase Order Sent',
        eventKey: 'purchasing.po_sent',
        description: 'Fired when a purchase order is sent to a vendor.',
        fields: [
          ...COMMON_FIELDS,
          { key: 'po_number', label: 'PO Number', type: 'string' },
          { key: 'vendor_name', label: 'Vendor', type: 'string' },
        ],
      },
      {
        event: 'Purchase Order Received',
        eventKey: 'purchasing.po_received',
        description: 'Fired when a purchase order is fully received.',
        fields: [
          ...COMMON_FIELDS,
          { key: 'po_number', label: 'PO Number', type: 'string' },
          { key: 'received_date', label: 'Received Date', type: 'date' },
        ],
      },
      {
        event: 'Purchase Order Cancelled',
        eventKey: 'purchasing.po_cancelled',
        description: 'Fired when a purchase order is cancelled.',
        fields: [
          ...COMMON_FIELDS,
          { key: 'po_number', label: 'PO Number', type: 'string' },
          { key: 'cancellation_reason', label: 'Reason', type: 'string' },
        ],
      },
      {
        event: 'Vendor Created',
        eventKey: 'purchasing.vendor_created',
        description: 'Fired when a new vendor is created.',
        fields: [
          ...COMMON_FIELDS,
          { key: 'vendor_id', label: 'Vendor ID', type: 'string' },
          { key: 'vendor_name', label: 'Vendor Name', type: 'string' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────
  // MATERIAL RECONCILIATION
  // ─────────────────────────────────────────────
  {
    module: 'Material Reconciliation',
    moduleKey: 'material_reconciliation',
    category: 'operations',
    icon: 'Scale',
    color: 'bg-rose-100 text-rose-700',
    events: [
      {
        event: 'Reconciliation Started',
        eventKey: 'reconciliation.started',
        description: 'Fired when material reconciliation begins for a completed job.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'reconciliation_id', label: 'Reconciliation ID', type: 'string' },
        ],
      },
      {
        event: 'Reconciliation Completed',
        eventKey: 'reconciliation.completed',
        description: 'Fired when material reconciliation is completed.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'reconciliation_id', label: 'Reconciliation ID', type: 'string' },
          { key: 'materials_used', label: 'Materials Used', type: 'number' },
          { key: 'materials_returned', label: 'Materials Returned', type: 'number' },
          { key: 'materials_wasted', label: 'Materials Wasted', type: 'number' },
        ],
      },
      {
        event: 'Discrepancy Detected',
        eventKey: 'reconciliation.discrepancy',
        description: 'Fired when a material discrepancy is found during reconciliation.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'reconciliation_id', label: 'Reconciliation ID', type: 'string' },
          { key: 'discrepancy_type', label: 'Discrepancy Type', type: 'string' },
          { key: 'item_name', label: 'Item Name', type: 'string' },
          { key: 'expected_quantity', label: 'Expected Quantity', type: 'number' },
          { key: 'actual_quantity', label: 'Actual Quantity', type: 'number' },
        ],
      },
      {
        event: 'Disposition Assigned',
        eventKey: 'reconciliation.disposition',
        description: 'Fired when a disposition is assigned to a material line.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'reconciliation_id', label: 'Reconciliation ID', type: 'string' },
          { key: 'item_name', label: 'Item Name', type: 'string' },
          { key: 'disposition', label: 'Disposition', type: 'string' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────
  // FLEET MANAGEMENT
  // ─────────────────────────────────────────────
  {
    module: 'Fleet Management',
    moduleKey: 'fleet',
    category: 'operations',
    icon: 'Truck',
    color: 'bg-indigo-100 text-indigo-700',
    events: [
      {
        event: 'Vehicle Assigned',
        eventKey: 'fleet.vehicle_assigned',
        description: 'Fired when a vehicle is assigned to a driver.',
        fields: [...COMMON_FIELDS, { key: 'truck_id', label: 'Truck ID', type: 'string' }, { key: 'assignment_type', label: 'Assignment Type', type: 'string' }],
      },
      {
        event: 'Vehicle Returned',
        eventKey: 'fleet.vehicle_returned',
        description: 'Fired when a shared vehicle is returned.',
        fields: [...COMMON_FIELDS, { key: 'truck_id', label: 'Truck ID', type: 'string' }, { key: 'return_condition', label: 'Return Condition', type: 'string' }],
      },
      {
        event: 'Maintenance Due',
        eventKey: 'fleet.maintenance_due',
        description: 'Fired when a vehicle maintenance is upcoming.',
        fields: [...COMMON_FIELDS, { key: 'truck_id', label: 'Truck ID', type: 'string' }, { key: 'next_maintenance_date', label: 'Next Maintenance Date', type: 'date' }],
      },
      {
        event: 'Inspection Due',
        eventKey: 'fleet.inspection_due',
        description: 'Fired when a vehicle inspection is upcoming.',
        fields: [...COMMON_FIELDS, { key: 'truck_id', label: 'Truck ID', type: 'string' }, { key: 'next_inspection_date', label: 'Next Inspection Date', type: 'date' }],
      },
    ],
  },
];