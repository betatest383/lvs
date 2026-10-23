import React from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Search } from 'lucide-react';
import { CALENDAR_SCOPES } from '@/lib/calendarConstants';

const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const STATUSES = ['all', 'Draft', 'New', 'Assigned', 'In Progress', 'Blocked', 'On Hold', 'Submitted for Review', 'Changes Requested', 'Awaiting Approval', 'Approved', 'Completed', 'Canceled', 'Waiting', 'Overdue'];
const TASK_TYPES = ['all', 'Data Entry', 'Operational', 'Warehouse', 'Technician', 'CSR', 'Management', 'Review', 'Approval', 'Corrective Action', 'Recurring Operational Task', 'Safety', 'Equipment', 'Fleet', 'Audit', 'Training', 'Certification'];
const WORK_CATEGORIES = ['all', 'critical', 'operational_interruption', 'high_priority', 'scheduled_primary', 'routine', 'busy_work'];
const ACK_STATUSES = ['all', 'none', 'pending', 'acknowledged', 'start_now', 'request_clarification', 'unable_to_start', 'manager_assistance_requested', 'overdue', 'escalated'];

export default function CalendarFilters({ open, onOpenChange, filters, onChange, onClear, role, employees, departments }) {
  const update = (key, value) => onChange({ ...filters, [key]: value });

  const isPrivileged = role === 'admin' || role === 'owner';
  const isManager = isPrivileged || ['director_of_operations', 'operations_manager', 'warehouse_manager', 'office_manager'].includes(role);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:w-96 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Calendar Filters</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          {/* Scope */}
          <div>
            <Label className="text-xs text-muted-foreground">Calendar Scope</Label>
            <Select value={filters.scope || CALENDAR_SCOPES.MY} onValueChange={(v) => update('scope', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={CALENDAR_SCOPES.MY}>My Calendar</SelectItem>
                {isManager && <SelectItem value={CALENDAR_SCOPES.EMPLOYEE}>Employee</SelectItem>}
                {isManager && <SelectItem value={CALENDAR_SCOPES.DEPARTMENT}>Department</SelectItem>}
                {isPrivileged && <SelectItem value={CALENDAR_SCOPES.COMPANY}>Company-Wide</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {filters.scope === CALENDAR_SCOPES.EMPLOYEE && isManager && (
            <div>
              <Label className="text-xs text-muted-foreground">Employee</Label>
              <Select value={filters.employeeId || ''} onValueChange={(v) => update('employeeId', v)}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {(employees || []).map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name} ({emp.employee_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {filters.scope === CALENDAR_SCOPES.DEPARTMENT && isManager && (
            <div>
              <Label className="text-xs text-muted-foreground">Department</Label>
              <Select value={filters.department || ''} onValueChange={(v) => update('department', v)}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {(departments || []).map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-xs text-muted-foreground">Search</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filters.search || ''}
                onChange={(e) => update('search', e.target.value)}
                placeholder="Search tasks..."
                className="pl-8"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Priority</Label>
            <Select value={filters.priority || 'all'} onValueChange={(v) => update('priority', v === 'all' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={filters.status || 'all'} onValueChange={(v) => update('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map(s => <SelectItem key={s} value={s}>{s === 'all' ? 'All Statuses' : s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Task Type</Label>
            <Select value={filters.taskType || 'all'} onValueChange={(v) => update('taskType', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map(t => <SelectItem key={t} value={t}>{t === 'all' ? 'All Types' : t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Work Category</Label>
            <Select value={filters.workCategory || 'all'} onValueChange={(v) => update('workCategory', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {WORK_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c === 'all' ? 'All Categories' : c.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Acknowledgment State</Label>
            <Select value={filters.acknowledgmentStatus || 'all'} onValueChange={(v) => update('acknowledgmentStatus', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACK_STATUSES.map(a => <SelectItem key={a} value={a}>{a === 'all' ? 'All States' : a.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 pt-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={!!filters.showCompleted}
                onChange={(e) => update('showCompleted', e.target.checked)}
                className="rounded"
              />
              Show Completed
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={!!filters.showOverdueOnly}
                onChange={(e) => update('showOverdueOnly', e.target.checked)}
                className="rounded"
              />
              Overdue Only
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={!!filters.showInterruptedOnly}
                onChange={(e) => update('showInterruptedOnly', e.target.checked)}
                className="rounded"
              />
              Interrupted / Resume Required
            </label>
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClear} className="w-full">
            <X className="w-4 h-4 mr-1" /> Clear Filters
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}