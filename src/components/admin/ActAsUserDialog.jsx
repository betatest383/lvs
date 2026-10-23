import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { useImpersonation } from '@/lib/ImpersonationContext';
import { Search, Loader2, UserCog, Truck } from 'lucide-react';

export default function ActAsUserDialog({ open, onClose, preselectedEmployeeId }) {
  const { startImpersonation } = useImpersonation();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [reason, setReason] = useState('');
  const [writeActions, setWriteActions] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      base44.entities.EmployeeRegistry.list('-created_date', 200)
        .then((res) => setEmployees(res || []))
        .catch(() => setEmployees([]))
        .finally(() => setLoading(false));

      if (preselectedEmployeeId) {
        const found = employees.find(e => e.employee_id === preselectedEmployeeId || e.id === preselectedEmployeeId);
        if (found) setSelectedEmp(found);
      } else {
        setSelectedEmp(null);
      }
      setReason('');
      setWriteActions(false);
      setSearch('');
    }
  }, [open, preselectedEmployeeId]);

  const filtered = useMemo(() => {
    if (!search) return employees.filter(e => e.employment_status !== 'Terminated' && e.account_status !== 'Disabled');
    const q = search.toLowerCase();
    return employees.filter(e => {
      if (e.employment_status === 'Terminated' || e.account_status === 'Disabled') return false;
      return (
        (e.first_name || '').toLowerCase().includes(q) ||
        (e.last_name || '').toLowerCase().includes(q) ||
        (e.email || '').toLowerCase().includes(q) ||
        (e.primary_role || '').toLowerCase().includes(q) ||
        (e.department || '').toLowerCase().includes(q) ||
        (e.employee_id || '').toLowerCase().includes(q)
      );
    });
  }, [employees, search]);

  const handleStart = async () => {
    if (!selectedEmp || !reason.trim()) return;
    setStarting(true);
    try {
      await startImpersonation(selectedEmp, reason.trim(), writeActions);
      onClose();
    } catch (err) {
      console.error('Impersonation failed', err);
    } finally {
      setStarting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="w-5 h-5 text-accent" />
            Act As User
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Temporarily assume another employee's identity for testing and support. All actions are audited.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, role, or department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          {/* Employee List */}
          <div className="border rounded-md max-h-64 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No employees found</p>
            ) : (
              filtered.map((emp) => (
                <button
                  key={emp.id}
                  onClick={() => setSelectedEmp(emp)}
                  className={`w-full text-left px-3 py-2.5 border-b last:border-b-0 transition-colors ${
                    selectedEmp?.id === emp.id
                      ? 'bg-accent/10 border-l-4 border-l-accent'
                      : 'hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {emp.first_name} {emp.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {emp.employee_id} · {emp.primary_role || 'No role'} · {emp.department || 'No dept'}
                      </p>
                      <p className="text-xs text-muted-foreground/70 truncate">
                        {emp.email || emp.login_email || '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {emp.assigned_truck && (
                        <Badge variant="outline" className="text-xs">
                          <Truck className="w-3 h-3 mr-1" />{emp.assigned_truck}
                        </Badge>
                      )}
                      {emp.user_linked && <Badge variant="secondary" className="text-xs">Linked</Badge>}
                      <Badge variant="outline" className="text-xs">{emp.account_status || 'Pending'}</Badge>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Selected Employee Detail */}
          {selectedEmp && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name:</span>
                <span className="font-medium">{selectedEmp.first_name} {selectedEmp.last_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Employee ID:</span>
                <span className="font-medium">{selectedEmp.employee_id || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email:</span>
                <span className="font-medium truncate ml-2">{selectedEmp.email || selectedEmp.login_email || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Role:</span>
                <span className="font-medium">{selectedEmp.primary_role || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Department:</span>
                <span className="font-medium">{selectedEmp.department || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dashboard:</span>
                <span className="font-medium">{selectedEmp.default_dashboard || 'Default'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Truck:</span>
                <span className="font-medium">{selectedEmp.assigned_truck || '—'}</span>
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <Label>Reason for Impersonation *</Label>
            <Textarea
              placeholder="e.g. Testing technician dashboard workflow, troubleshooting WH-105 issue..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>

          {/* Write Actions Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="cursor-pointer">Allow Write Actions</Label>
              <p className="text-xs text-muted-foreground">
                If off, view-only mode (no data modifications). Turn on for testing forms and workflows.
              </p>
            </div>
            <Switch checked={writeActions} onCheckedChange={setWriteActions} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleStart}
            disabled={!selectedEmp || !reason.trim() || starting}
          >
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCog className="w-4 h-4" />}
            Start Impersonation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}